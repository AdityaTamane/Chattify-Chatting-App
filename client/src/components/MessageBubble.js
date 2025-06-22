import React from 'react';

function MessageBubble({ msg, currentUser }) {
  const isSentByCurrentUser = msg.sender === currentUser;
  const messageClass = isSentByCurrentUser ? 'sent' : 'received';
  const senderName = isSentByCurrentUser ? 'You' : msg.sender;

  const renderMessageContent = () => {
    switch (msg.type) {
      case 'image':
        // If msg.file is a Base64 string (from socket.io upload), use it directly.
        // If msg.file is a relative URL (from HTTP upload), prepend the server base URL.
        const imageUrl = msg.file && msg.file.startsWith('data:') 
                         ? msg.file 
                         : `http://localhost:5000${msg.file}`;
        return (
          <>
            {msg.file && <img src={imageUrl} alt={msg.fileName || 'Image'} className="chat-image" />}
            {/* Display message/filename if available, even without file data */}
            {msg.message && <p>{msg.message}</p>} 
          </>
        );
      case 'video':
        // Video files are always uploaded via HTTP POST, so msg.file will be a relative URL.
        const videoUrl = `http://localhost:5000${msg.file}`;
        return (
          <>
            {msg.file && (
              <video controls className="chat-video">
                <source src={videoUrl} type={msg.fileType} />
                Your browser does not support the video tag.
              </video>
            )}
            {/* Display filename as text alongside video */}
            {msg.message && <p>{msg.message}</p>} 
          </>
        );
      case 'file':
        // General files can be Base64 (older direct socket approach) or URL (HTTP POST)
        const fileContent = msg.file || msg.fileContent; // Prioritize URL if available

        if (fileContent && fileContent.startsWith('data:')) {
          // It's a Base64 string, create a Blob for download
          const blobUrl = createBlobUrl(fileContent, msg.fileType);
          return (
            <p>
              📄 <a href={blobUrl} download={msg.fileName} target="_blank" rel="noopener noreferrer">{msg.fileName}</a> ({formatBytes(msg.fileSize)})
            </p>
          );
        } else if (fileContent) {
          // It's a URL (from server upload via HTTP POST)
          return (
            <p>
              📄 <a href={`http://localhost:5000${fileContent}`} download={msg.fileName} target="_blank" rel="noopener noreferrer">{msg.fileName}</a> ({formatBytes(msg.fileSize)})
            </p>
          );
        } else {
          return <p>{msg.message}</p>;
        }

      default: // 'text' or system messages
        return <p>{msg.message}</p>;
    }
  };

  // Helper function to convert Base64 to Blob and create a URL for client-side download
  function createBlobUrl(b64DataWithPrefix, contentType) {
    if (!b64DataWithPrefix) return '#'; // Return a fallback if data is missing

    const parts = b64DataWithPrefix.split(';');
    const base64Data = parts[1] ? parts[1].split(',')[1] : '';

    if (!base64Data) return '#'; // Return a fallback if base64 data is malformed

    const byteCharacters = atob(base64Data);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    const blob = new Blob(byteArrays, { type: contentType || 'application/octet-stream' });
    return URL.createObjectURL(blob);
  }

  // Helper function to format file size for display
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  return (
    <div className={`message-bubble ${messageClass}`}>
      <div className="message-header">
        <span className="sender-name">{senderName}</span>
        <span className="timestamp">{msg.timestamp}</span>
      </div>
      <div className="message-content">
        {renderMessageContent()}
      </div>
    </div>
  );
}

export default MessageBubble;