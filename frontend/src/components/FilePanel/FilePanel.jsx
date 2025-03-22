import React from 'react';
import './FilePanel.css';

const FilePanel = ({ files = [], onFileSelect, activeFileId, onProcessFile }) => {
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getFileStatus = (file) => {
    if (file.processing_complete) {
      return <span className="file-status success">Processed</span>;
    }
    if (file.processing_started) {
      return <span className="file-status processing">Processing...</span>;
    }
    return (
      <button 
        className="process-button"
        onClick={(e) => {
          e.stopPropagation();
          onProcessFile(file);
        }}
      >
        Process
      </button>
    );
  };

  return (
    <div className="file-panel">
      <h3>Uploaded Files</h3>
      <div className="file-list">
        {files.length === 0 ? (
          <div className="no-files-message">
            No files uploaded yet. Upload a file to get started.
          </div>
        ) : (
          files.map((file) => (
            <div 
              key={file.id} 
              className={`file-item ${file.id === activeFileId ? 'active' : ''}`}
            >
              <div className="file-info" onClick={() => onFileSelect(file)}>
                <span className="file-name">{file.original_file_name}</span>
                <div className="file-details">
                  <span className="file-date">{formatDate(file.scan_date)}</span>
                  <span className="file-organ">{file.organ}</span>
                  {getFileStatus(file)}
                </div>
              </div>
              <span className="file-size">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default FilePanel; 