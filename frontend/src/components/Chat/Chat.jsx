import { useState, useRef, useEffect } from 'react'
import './Chat.css'
import MessageList from '../MessageList/MessageList'
import ChatInput from '../ChatInput/ChatInput'
import FilePanel from '../FilePanel/FilePanel'
import ImageViewer from '../ImageViewer/ImageViewer'
import { getAIResponse } from '../../services/aiService'

// Base API URL from environment variables
const BASE_URL = `/api`

const Chat = () => {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentResponse, setCurrentResponse] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [awaitingFileMetadata, setAwaitingFileMetadata] = useState(false)
  const [activeFileId, setActiveFileId] = useState(null)
  const fileInputRef = useRef(null)
  const pendingFileRef = useRef(null)
  const pollingIntervals = useRef({})

  // Function to check processing status
  const checkProcessingStatus = async (fileId) => {
    try {
      const response = await fetch(`${BASE_URL}/status/${fileId}/`);
      const data = await response.json();

      if (response.ok) {
        setUploadedFiles(prev => prev.map(f => 
          f.id === fileId ? {
            ...f,
            processing_complete: data.processing_complete,
            processing_started: !data.processing_complete,
            segmentation_file_path: data.segmentation_file_path,
            output_file_path: data.output_file_path
          } : f
        ));

        // If processing is complete, stop polling
        if (data.processing_complete) {
          if (pollingIntervals.current[fileId]) {
            clearInterval(pollingIntervals.current[fileId]);
            delete pollingIntervals.current[fileId];
          }
        }
      }
    } catch (error) {
      console.error('Error checking status:', error);
    }
  };

  // Start polling for a file
  const startPolling = (fileId) => {
    // Clear any existing polling for this file
    if (pollingIntervals.current[fileId]) {
      clearInterval(pollingIntervals.current[fileId]);
    }

    // Check immediately
    checkProcessingStatus(fileId);

    // Then start polling every 5 seconds
    pollingIntervals.current[fileId] = setInterval(() => {
      checkProcessingStatus(fileId);
    }, 5000);
  };

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingIntervals.current).forEach(interval => {
        clearInterval(interval);
      });
    };
  }, []);

  // Check status of processing files on initial load
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const response = await fetch(`${BASE_URL}/analyze/`);
        const data = await response.json();
        
        if (response.ok && data.success) {
          const files = data.data.map(file => ({
            ...file,
            size: file.size || 0
          }));
          setUploadedFiles(files);

          // Start polling for any files that are processing
          files.forEach(file => {
            if (file.processing_started && !file.processing_complete) {
              startPolling(file.id);
            }
          });
        } else {
          console.error('Failed to fetch files:', data.message);
        }
      } catch (error) {
        console.error('Error fetching files:', error);
      }
    };

    fetchFiles();
  }, []);

  const getFileContext = () => {
    if (uploadedFiles.length === 0) return '';
    if (activeFileId) {
      const activeFile = uploadedFiles.find(f => f.id === activeFileId);
      if (activeFile) {
        return `Context: Working with file: ${activeFile.original_file_name} (${activeFile.organ}, dated ${activeFile.scan_date}). `;
      }
    }
    const filesList = uploadedFiles.map(file => 
      `${file.original_file_name} (${file.organ}, dated ${file.scan_date})`
    ).join(', ');
    return `Context: Available files: ${filesList}. `;
  }

  const handleProcessFile = async (file) => {
    try {
      const response = await fetch(`${BASE_URL}/process/${file.id}/`, {
        method: 'POST'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start processing');
      }

      // Update the file's processing status
      setUploadedFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, processing_started: true } : f
      ));

      // Start polling for status updates
      startPolling(file.id);

      setMessages(prev => [...prev, {
        text: data.message || "Processing started successfully.",
        sender: 'ai'
      }]);

    } catch (error) {
      console.error('Processing error:', error);
      setMessages(prev => [...prev, {
        text: error.message || "Failed to start processing. Please try again.",
        sender: 'ai',
        isError: true
      }]);
    }
  };

  const handleMorphometryAnalysis = (morphometryData) => {
    try {
      // Format morphometry data for display in chat
      let formattedData = '';
      if (typeof morphometryData === 'string') {
        try {
          const parsed = JSON.parse(morphometryData);
          formattedData = Object.entries(parsed)
            .map(([region, value]) => `${region}: ${typeof value === 'number' ? value.toFixed(2) : value} mm³`)
            .join('\n');
        } catch (e) {
          formattedData = morphometryData;
        }
      } else if (typeof morphometryData === 'object' && morphometryData !== null) {
        formattedData = Object.entries(morphometryData)
          .map(([region, value]) => `${region}: ${typeof value === 'number' ? value.toFixed(2) : value} mm³`)
          .join('\n');
      }

      // Add the data to chat as a user message
      setMessages(prev => [...prev, {
        text: "Please analyze this brain morphometry data:",
        sender: 'user'
      }]);

      // Add the morphometry data with formatting
      setMessages(prev => [...prev, {
        text: formattedData,
        sender: 'user',
        type: 'data'
      }]);

      // Create the prompt for GPT
      const prompt = `You are a MRI specialist and here is brain morphometry data:\n\n${formattedData}\n\nPlease analyze this data and provide clinical insights.`;
      
      // Send the request to GPT
      handleAIRequest(prompt);
    } catch (error) {
      console.error('Error handling morphometry analysis:', error);
      setMessages(prev => [...prev, {
        text: "Failed to analyze morphometry data. Please try again.",
        sender: 'ai',
        isError: true
      }]);
    }
  };

  // Function to handle AI requests separately from user input
  const handleAIRequest = async (prompt) => {
    setIsLoading(true);
    setCurrentResponse('');
    
    try {
      let lastResponse = '';
      
      for await (const partialResponse of getAIResponse(prompt)) {
        lastResponse = partialResponse;
        setCurrentResponse(partialResponse);
      }
      
      setMessages(prev => [...prev, { text: lastResponse, sender: 'ai' }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        text: "Sorry, I couldn't process your request. Please try again.", 
        sender: 'ai',
        isError: true
      }]);
    } finally {
      setIsLoading(false);
      setCurrentResponse('');
    }
  };

  const handleFileMetadata = async (message) => {
    if (!pendingFileRef.current) return false;

    const [date, organ] = message.split(',').map(s => s.trim());
    if (!date || !organ) {
      setMessages(prev => [...prev, {
        text: "Please provide both the date and organ in the format: 'YYYY-MM-DD, organ name'",
        sender: 'ai',
        isError: true
      }]);
      return false;
    }

    // Create form data for file upload
    const formData = new FormData();
    formData.append('file', pendingFileRef.current);
    formData.append('metadata', JSON.stringify({
      date,
      organ
    }));

    try {
      const response = await fetch(`${BASE_URL}/analyze/`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload file');
      }

      // Add the file to the uploaded files list with server-provided data
      const fileData = {
        ...data.data,
        size: pendingFileRef.current.size
      };
      
      setUploadedFiles(prev => [...prev, fileData]);
      setActiveFileId(fileData.id);
      pendingFileRef.current = null;
      setAwaitingFileMetadata(false);

      setMessages(prev => [...prev, {
        text: data.message || `File "${fileData.original_file_name}" has been uploaded successfully.`,
        sender: 'ai'
      }]);

      return true;
    } catch (error) {
      console.error('File upload error:', error);
      setMessages(prev => [...prev, {
        text: error.message || "Failed to upload the file. Please try again.",
        sender: 'ai',
        isError: true
      }]);
      return false;
    }
  }

  const handleSubmit = async (message, file = null) => {
    if (!message.trim() && !file) return;
    
    setMessages(prev => [...prev, { 
      text: message, 
      sender: 'user',
      file: file
    }]);

    if (file) {
      pendingFileRef.current = file;
      setAwaitingFileMetadata(true);
      setMessages(prev => [...prev, {
        text: "Please provide the date this file was created and the organ it represents in the format: 'YYYY-MM-DD, organ name'",
        sender: 'ai'
      }]);
      return;
    }

    if (awaitingFileMetadata) {
      const success = await handleFileMetadata(message);
      if (success) return;
    }
    
    setIsLoading(true);
    setCurrentResponse('');
    
    try {
      let lastResponse = '';
      const contextualMessage = `${getFileContext()}${message}`;
      
      for await (const partialResponse of getAIResponse(contextualMessage)) {
        lastResponse = partialResponse;
        setCurrentResponse(partialResponse);
      }
      
      setMessages(prev => [...prev, { text: lastResponse, sender: 'ai' }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        text: "Sorry, I couldn't process your request. Please try again.", 
        sender: 'ai',
        isError: true
      }]);
    } finally {
      setIsLoading(false);
      setCurrentResponse('');
    }
  }

  const handleFileSelect = (file) => {
    const newActiveId = file.id === activeFileId ? null : file.id;
    setActiveFileId(newActiveId);
    
    if (newActiveId) {
      // Add context message when selecting a file
      const contextMessage = `Selected file: ${file.original_file_name}\nOrgan: ${file.organ}\nDate: ${new Date(file.scan_date).toLocaleDateString()}\n${file.processing_complete ? 'Status: Processed' : file.processing_started ? 'Status: Processing...' : 'Status: Not processed'}`;
      
      setMessages(prev => {
        // If there are no messages or the last message isn't a context message
        if (prev.length === 0 || prev[prev.length - 1].type !== 'context') {
          return [...prev, {
            text: contextMessage,
            sender: 'system',
            type: 'context'
          }];
        }
        // Replace the last context message
        return [
          ...prev.slice(0, -1),
          {
            text: contextMessage,
            sender: 'system',
            type: 'context'
          }
        ];
      });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = (file) => {
    if (file) {
      handleSubmit('', file);
    }
  };

  return (
    <div className="chat-wrapper">
      <FilePanel 
        files={uploadedFiles} 
        onFileSelect={handleFileSelect}
        activeFileId={activeFileId}
        onProcessFile={handleProcessFile}
      />
      <div 
        className={`chat-container ${messages.length > 0 || activeFileId ? 'expanded' : ''} ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={(e) => handleFileUpload(e.target.files[0])}
          accept=".jpg,.jpeg,.png,.pdf,.dcm"
        />
        <MessageList 
          messages={messages} 
          isExpanded={messages.length > 0 || activeFileId}
          isLoading={isLoading}
          currentResponse={currentResponse}
        />
        <ChatInput 
          onSubmit={handleSubmit} 
          disabled={isLoading}
          onFileUpload={handleFileUpload}
          placeholder={awaitingFileMetadata ? "Enter date and organ (YYYY-MM-DD, organ name)" : activeFileId ? "Ask a question about this file..." : "Type your message..."}
        />
      </div>
      {activeFileId && uploadedFiles.find(f => f.id === activeFileId)?.processing_complete && (
        <div className="viewers-container">
          <div className="viewer-section">
            <h3>Original MRI</h3>
            <ImageViewer 
              fileId={activeFileId} 
              fileType="output" 
              onSendToChat={handleMorphometryAnalysis}
            />
          </div>
          {/* <div className="viewer-section">
            <h3>Segmentation</h3>
            <ImageViewer fileId={activeFileId} fileType="segmentation" />
          </div> */}
        </div>
      )}
    </div>
  )
}

export default Chat 