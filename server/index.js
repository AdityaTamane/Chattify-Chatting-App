const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg'); // Import fluent-ffmpeg

// Set FFmpeg path if it's not in your system's PATH
// IMPORTANT: Uncomment and set these paths if ffmpeg is not globally accessible
// These paths are examples; adjust them based on your OS and FFmpeg installation.
// For macOS (Homebrew):
// ffmpeg.setFfmpegPath('/usr/local/bin/ffmpeg');
// ffmpeg.setFfprobePath('/usr/local/bin/ffprobe');
// For Linux (e.g., Ubuntu/Debian):
// ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
// ffmpeg.setFfprobePath('/usr/bin/ffprobe');
// For Windows, point to your ffmpeg.exe and ffprobe.exe paths:
// ffmpeg.setFfmpegPath('C:\\path\\to\\ffmpeg\\bin\\ffmpeg.exe');
// ffmpeg.setFfprobePath('C:\\path\\to\\ffmpeg\\bin\\ffprobe.exe');

const onlineUsers = new Map();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8 // Increase buffer size for larger files (e.g., 100MB)
});

const uploadsDir = path.join(__dirname, 'uploads');
const compressedVideosDir = path.join(__dirname, 'compressed_videos');

// Create directories if they don't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
if (!fs.existsSync(compressedVideosDir)) {
  fs.mkdirSync(compressedVideosDir);
}

// Configure Multer for original file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename to prevent path traversal or other issues
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${safeFilename}`);
  },
});
const upload = multer({ storage: storage });

app.use(cors());
// Serve static files from 'uploads' and 'compressed_videos' directories
app.use('/uploads', express.static(uploadsDir));
app.use('/compressed_videos', express.static(compressedVideosDir));

let chatHistory = [];

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (username) => {
    socket.username = username;
    onlineUsers.set(socket.id, username);

    io.emit('online-users', Array.from(onlineUsers.values()));

    socket.broadcast.emit('chat', {
      sender: 'System',
      message: `${username} has joined the chat.`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'text'
    });

    socket.emit('chat-history', chatHistory);
  });

  socket.on('typing', (username) => {
    socket.broadcast.emit('typing', username);
  });

  socket.on('chat', (msg) => {
    const messageData = {
      sender: socket.username,
      message: msg,
      timestamp: new Date().toLocaleTimeString(),
      type: 'text'
    };
    chatHistory.push(messageData);
    io.emit('chat', messageData);
  });

  // Handle image upload from client (already compressed client-side)
  // These images are sent as Base64 strings.
  socket.on('file-upload', (fileData) => {
    const messageData = {
      sender: socket.username,
      message: fileData.fileName,
      timestamp: new Date().toLocaleTimeString(),
      type: fileData.type,
      file: fileData.fileContent, // Base64 string for images
      fileType: fileData.fileType,
      fileName: fileData.fileName,
      fileSize: fileData.fileSize
    };
    chatHistory.push(messageData);
    io.emit('chat', messageData);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online-users', Array.from(onlineUsers.values()));

    if (socket.username) {
      io.emit('chat', {
        sender: 'System',
        message: `${socket.username} has left the chat.`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'text'
      });
    }
  });
});

// New HTTP POST route for handling general file uploads (especially videos)
app.post('/upload', upload.single('chatFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const originalFilePath = req.file.path;
  const fileExtension = path.extname(req.file.filename).toLowerCase();
  const fileNameWithoutExt = path.basename(req.file.filename, fileExtension);
  const messageType = req.file.mimetype.startsWith('image/') ? 'image' :
                      req.file.mimetype.startsWith('video/') ? 'video' : 'file';

  let finalFileUrl;
  let finalFileSize = req.file.size;
  let finalFileType = req.file.mimetype; // Default to original mimetype

  if (messageType === 'video') {
    // Ensure the output file name is unique to avoid conflicts
    const compressedFileName = `${fileNameWithoutExt}_compressed_${Date.now()}.mp4`; 
    const compressedFilePath = path.join(compressedVideosDir, compressedFileName);

    try {
      // Check if ffmpeg is correctly configured
      // fluent-ffmpeg uses ffprobe to get file info, so checking for its binary path is good.
      if (ffmpeg.get  || !ffmpeg.getFfprobePath() ) {
          // If FFmpeg paths are not set globally or via setFfmpegPath, this might be undefined.
          // This check is a basic attempt to see if FFmpeg is configured.
          // A more robust check might involve trying to run a dummy command.
          console.warn("FFmpeg or FFprobe path might not be set. Video compression may fail if not in system PATH or explicitly configured.");
      }

      await new Promise((resolve, reject) => {
        ffmpeg(originalFilePath)
          .output(compressedFilePath)
          .videoCodec('libx264') // H.264 codec for good compatibility and compression
          .audioCodec('aac')    // AAC audio codec
          .format('mp4')        // Ensure output is MP4
          .size('?x480')        // Resize to 480p height, maintain aspect ratio. Adjust this if needed.
          .videoBitrate('800k') // Target video bitrate (adjust for desired quality/size)
          .audioBitrate('128k') // Target audio bitrate
          .on('end', () => {
            console.log('Video compression finished.');
            // Delete original uncompressed file if no longer needed
            fs.unlink(originalFilePath, (err) => {
              if (err) console.error('Error deleting original video:', err);
            });
            resolve();
          })
          .on('error', (err) => {
            console.error('Video compression error:', err.message); // Log full error message
            reject(err);
          })
          .run();
      });

      const stats = fs.statSync(compressedFilePath);
      finalFileSize = stats.size;
      finalFileUrl = `/compressed_videos/${compressedFileName}`;
      finalFileType = 'video/mp4'; // Always MP4 after compression for compressed videos

    } catch (error) {
      console.error('Failed to compress video, serving original:', error.message);
      // If compression fails, serve the original video as a fallback
      finalFileUrl = `/uploads/${req.file.filename}`; 
      finalFileType = req.file.mimetype; // Use original mimetype
    }
  } else {
    // For non-video files or if video compression was skipped/failed
    finalFileUrl = `/uploads/${req.file.filename}`;
  }

  const messageData = {
    sender: req.body.username || 'Unknown', // Get sender from form data
    message: req.file.originalname,
    timestamp: new Date().toLocaleTimeString(),
    type: messageType,
    file: finalFileUrl, // The URL to access the processed file (relative path)
    fileType: finalFileType, 
    fileName: req.file.originalname,
    fileSize: finalFileSize
  };
  chatHistory.push(messageData);
  io.emit('chat', messageData); // Emit the message to all clients

  res.status(200).json({ message: 'File uploaded and processed successfully', fileUrl: finalFileUrl });
});


server.listen(5000, () => {
  console.log('Server listening on http://localhost:5000');
});