import React from 'react';
// import './Sidebar.css';

function Sidebar({ onlineUsers, username }) {
  return (
    <div className="sidebar">
      <h2>👤 {username}</h2>
      <h3>Online Users</h3>
      <ul>
        {onlineUsers.map((user, idx) => (
          <li key={idx} className={user === username ? 'self' : ''}>
            {user} {user === username ? '(You)' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Sidebar;
