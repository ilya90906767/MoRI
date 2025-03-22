import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './FilePanel.css';

const FilePanel = ({ files = [], onFileSelect, activeFileId, onProcessFile }) => {
  const [compareMode, setCompareMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);

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

  const toggleFileSelection = (file) => {
    if (selectedFiles.some(f => f.id === file.id)) {
      setSelectedFiles(selectedFiles.filter(f => f.id !== file.id));
    } else {
      // Only allow 2 files to be selected
      if (selectedFiles.length < 2) {
        setSelectedFiles([...selectedFiles, file]);
      }
    }
  };

  const handleCompareClick = () => {
    setCompareMode(!compareMode);
    // Clear selected files when exiting compare mode
    if (compareMode) {
      setSelectedFiles([]);
    }
  };

  return (
    <div className="file-panel">
      <div className="file-panel-header">
        <h3>Uploaded Files</h3>
        <div className="file-panel-actions">
          {compareMode ? (
            <>
              {selectedFiles.length === 2 ? (
                <Link 
                  to="/compare" 
                  state={{ files: selectedFiles }}
                  className="compare-start-button"
                >
                  Compare Selected
                </Link>
              ) : (
                <span className="compare-hint">Select 2 files to compare</span>
              )}
              <button 
                className="compare-cancel-button"
                onClick={handleCompareClick}
              >
                Cancel
              </button>
            </>
          ) : (
            <button 
              className="compare-button"
              onClick={handleCompareClick}
              disabled={files.length < 2}
            >
              Compare
            </button>
          )}
        </div>
      </div>
      <div className="file-list">
        {files.length === 0 ? (
          <div className="no-files-message">
            No files uploaded yet. Upload a file to get started.
          </div>
        ) : (
          files.map((file) => (
            <div 
              key={file.id} 
              className={`file-item ${file.id === activeFileId && !compareMode ? 'active' : ''} ${compareMode && selectedFiles.some(f => f.id === file.id) ? 'selected' : ''}`}
              onClick={() => compareMode ? toggleFileSelection(file) : onFileSelect(file)}
            >
              <div className="file-info">
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