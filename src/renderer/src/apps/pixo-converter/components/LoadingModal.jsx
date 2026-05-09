// src/renderer/components/LoadingModal.jsx
import React from 'react';
import '../components/style/loadingmodal.css';

const LoadingModal = ({ message = '変換中です...', progress = null }) => {
  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-spinner" />
        <p className="loading-text">{message}</p>
        {progress !== null && (
          <div className="loading-progress">
            <div className="loading-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingModal;
