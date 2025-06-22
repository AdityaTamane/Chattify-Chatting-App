import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import Sidebar from './components/Sidebar.js';
import MessageBubble from './components/MessageBubble.js';
import imageCompression from 'browser-image-compression';
import EmojiPicker from 'emoji-picker-react'; // Import the emoji picker

const socket = io('http://localhost:5000');

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [typing, setTyping] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false); // New state for emoji picker visibility
  const [isLoading, setIsLoading] = useState(false); // New state for loader
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiPickerRef = useRef(null); // Ref for emoji picker container

  useEffect(() => {
    socket.on('chat', (data) => setMessages((prev) => [...prev, data]));
    socket.on('chat-history', (history) => setMessages(history));
    socket.on('typing', (name) => {
      // Only show typing indicator if someone else is typing
      if (name !== username) {
        setTyping(name);
        // Clear typing indicator after a short delay
        setTimeout(() => setTyping(''), 2000);
      }
    });
    socket.on('online-users', (users) => {
      setOnlineUsers(users);
    });

    // Close emoji picker if click outside
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      socket.off();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [username]);

  useEffect(() => {
    // Scroll to the bottom of the chat when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      socket.emit('chat', input);
      setInput('');
      setShowEmojiPicker(false); // Hide picker after sending
    }
  };

  const handleLogin = () => {
    if (username.trim()) {
      setIsLoggedIn(true);
      socket.emit('join', username);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const messageType = file.type.startsWith('image/') ? 'image' :
                        file.type.startsWith('video/') ? 'video' : 'file';

    setIsLoading(true); // Show loader when file selection starts

    if (messageType === 'image') {
      const options = {
        maxSizeMB: 1, // Max size for compressed image
        maxWidthOrHeight: 1920, // Max width/height for compressed image
        useWebWorker: true, // Use web worker for better performance
        initialQuality: 0.8 // Initial quality for compression
      };
      try {
        console.log('Original image file size:', file.size / (1024 * 1024), 'MB');
        const compressedFile = await imageCompression(file, options);
        console.log('Compressed image file size:', compressedFile.size / (1024 * 1024), 'MB');

        const reader = new FileReader();
        reader.onload = (e) => {
          const fileContent = e.target.result; // Base64 string
          socket.emit('file-upload', {
            fileName: compressedFile.name,
            fileType: compressedFile.type,
            fileSize: compressedFile.size,
            fileContent: fileContent,
            type: 'image'
          });
          setIsLoading(false); // Hide loader after socket emit
        };
        reader.readAsDataURL(compressedFile);

      } catch (error) {
        console.error('Image compression error:', error);
        // Fallback: If compression fails, send the original image as Base64
        const reader = new FileReader();
        reader.onload = (e) => {
          socket.emit('file-upload', {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileContent: e.target.result,
            type: 'image'
          });
          setIsLoading(false); // Hide loader even if fallback
        };
        reader.readAsDataURL(file);
      }
    } else {
      // For videos and other file types, use HTTP POST for server-side processing
      const formData = new FormData();
      formData.append('chatFile', file);
      formData.append('username', username); // Send username for sender info

      try {
        const response = await fetch('http://localhost:5000/upload', {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        console.log('Server file upload response:', result);
      } catch (error) {
        console.error('File upload to server failed:', error);
      } finally {
        setIsLoading(false); // Hide loader after fetch completes (success or failure)
      }
    }
    event.target.value = null; // Clear the input field after selection
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const onEmojiClick = (emojiObject, event) => {
    setInput((prevInput) => prevInput + emojiObject.emoji);
    // You can choose to keep the picker open or close it after each emoji click
    // setShowEmojiPicker(false); // Uncomment to close after each emoji
  };

  return (
    <div className="app">
      {!isLoggedIn ? (
        <div className="login-box">
          <h2>Enter your name</h2>
          <input
            type="text"
            placeholder="Your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin}>Join Chat</button>
        </div>
      ) : (
        <div className="chat-wrapper">
          <Sidebar onlineUsers={onlineUsers} username={username} />
          <div className="chat-container">
            <header>💬 Chattify</header>
            <div className="chat-box">
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} msg={msg} currentUser={username} />
              ))}
              {typing && <p className="typing">{typing} is typing<span className="dots">...</span></p>}
              {isLoading && <div className="loader">Uploading...</div>} {/* Loader */}
              <div ref={messagesEndRef} /> {/* Scroll to this element */}
            </div>
            <footer>
              {/* Emoji Picker Container */}
              {showEmojiPicker && (
                <div ref={emojiPickerRef} className="emoji-picker-container">
                  <EmojiPicker onEmojiClick={onEmojiClick} />
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
                accept="image/*,video/*,application/pdf,.doc,.docx,.txt" // Allowed file types
              />
              <button className="upload-button" onClick={triggerFileInput} disabled={isLoading}>📎</button> {/* Disable while loading */}
              <button
                className="emoji-button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                disabled={isLoading} // Disable while loading
              >
                😀
              </button>
              <input
                value={input}
                placeholder="Type a message..."
                onChange={(e) => {
                  setInput(e.target.value);
                  socket.emit('typing', username);
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                disabled={isLoading} // Disable while loading
              />
              <button onClick={handleSend} disabled={isLoading || !input.trim()}>Send</button> {/* Disable while loading or input is empty */}
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;