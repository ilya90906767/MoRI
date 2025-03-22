import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ImageViewer from '../ImageViewer/ImageViewer';
import ChatInput from '../ChatInput/ChatInput';
import MessageList from '../MessageList/MessageList';
import { getAIResponse } from '../../services/aiService';
import './FileComparison.css';

// Base API URL from environment variables
const API_BASE_URL = `/api`;

const FileComparison = () => {
  const [selectedFiles, setSelectedFiles] = useState({ first: null, second: null });
  const [differences, setDifferences] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize selectedFiles from location state when component mounts
  useEffect(() => {
    if (location.state?.files && Array.isArray(location.state.files) && location.state.files.length === 2) {
      setSelectedFiles({
        first: location.state.files[0],
        second: location.state.files[1]
      });
      // Automatically start comparison if files are provided via state
      setIsComparing(true);
    }
  }, [location.state]);

  // Function to handle file selection
  const handleFileSelection = (file, position) => {
    setSelectedFiles(prev => ({
      ...prev,
      [position]: file
    }));
  };

  // Calculate differences between morphometry data of two files
  const calculateDifferences = (data1, data2) => {
    if (!data1 || !data2) return null;
    
    const differences = {};
    const allKeys = new Set([...Object.keys(data1), ...Object.keys(data2)]);
    
    allKeys.forEach(key => {
      if (data1[key] !== undefined && data2[key] !== undefined) {
        const value1 = parseFloat(data1[key]);
        const value2 = parseFloat(data2[key]);
        
        if (!isNaN(value1) && !isNaN(value2)) {
          const diff = value2 - value1;
          const percentChange = value1 !== 0 ? (diff / value1) * 100 : 0;
          
          differences[key] = {
            before: value1,
            after: value2,
            difference: diff,
            percentChange: percentChange
          };
        }
      }
    });
    
    return differences;
  };

  // Calculate differences on the backend
  const fetchDifferences = async (firstFileId, secondFileId) => {
    if (selectedFiles.first?.morphometryData && selectedFiles.second?.morphometryData) {
      const diffs = calculateDifferences(
        selectedFiles.first.morphometryData,
        selectedFiles.second.morphometryData
      );
      setDifferences(diffs);
    }
  };

  // Handle comparing the two files
  const handleCompare = () => {
    if (selectedFiles.first && selectedFiles.second) {
      setIsComparing(true);
      
      // If both files already have morphometry data, calculate differences immediately
      if (selectedFiles.first.morphometryData && selectedFiles.second.morphometryData) {
        fetchDifferences(selectedFiles.first.id, selectedFiles.second.id);
      }
    }
  };

  // Handle chat input submission
  const handleChatSubmit = async (message) => {
    if (!message.trim()) return;
    
    // Add user message to chat
    setMessages(prev => [...prev, { text: message, sender: 'user' }]);
    
    // Show loading state
    setIsLoading(true);
    setCurrentResponse('');
    
    try {
      // Prepare context with comparison information
      let context = '';
      if (differences) {
        context = `You are analyzing a brain MRI comparison between two scans.\n\n`;
        context += `File 1: ${selectedFiles.first.original_file_name}\n`;
        context += `File 2: ${selectedFiles.second.original_file_name}\n\n`;
        context += `The comparison shows the following differences in brain morphometry:\n\n`;
        
        Object.entries(differences).forEach(([key, values]) => {
          context += `${key} changed from ${values.before.toFixed(2)} to ${values.after.toFixed(2)} (${values.percentChange > 0 ? '+' : ''}${values.percentChange.toFixed(2)}%)\n`;
        });
        
        context += `\nUser question: ${message}\n\n`;
      } else {
        context = message;
      }
      
      // Stream AI response
      let lastResponse = '';
      for await (const partialResponse of getAIResponse(context)) {
        lastResponse = partialResponse;
        setCurrentResponse(partialResponse);
      }
      
      // Add AI response to messages
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

  // Handle sending comparison to GPT
  const handleSendToGPT = () => {
    if (!differences) return;
    
    // Prepare the prompt with the differences
    let prompt = "Analyze the following changes in brain morphometry:\n\n";
    
    Object.entries(differences).forEach(([key, values]) => {
      prompt += `${key} was ${values.before.toFixed(2)} and became ${values.after.toFixed(2)} (${values.percentChange > 0 ? '+' : ''}${values.percentChange.toFixed(2)}%)\n`;
    });
    
    prompt += "\nAnalyze these differences and their potential clinical significance.";
    
    // Add prompt to chat directly instead of navigating away
    handleChatSubmit(prompt);
  };

  // Handle receiving morphometry data from ImageViewer components
  const handleMorphometryData = (data, position) => {
    // Update the file data with morphometry data
    setSelectedFiles(prev => {
      const updated = {
        ...prev,
        [position]: {
          ...prev[position],
          morphometryData: data
        }
      };
      
      // Only calculate differences once both files have morphometry data and differences haven't been calculated yet
      if (!differences && updated.first?.morphometryData && updated.second?.morphometryData) {
        fetchDifferences(updated.first.id, updated.second.id);
      }
      
      return updated;
    });
  };

  return (
    <div className="file-comparison-container">
      {!isComparing ? (
        <div className="comparison-setup">
          <h2>Compare Brain MRI Files</h2>
          <p>Select two files to compare their morphometry data and brain age</p>
          
          <div className="file-selection">
            <div className="file-slot">
              <h3>First File (Before)</h3>
              {/* This would be replaced with actual file selector component */}
              <button className="select-file-btn">Select File</button>
              {selectedFiles.first && <p>{selectedFiles.first.original_file_name}</p>}
            </div>
            
            <div className="file-slot">
              <h3>Second File (After)</h3>
              {/* This would be replaced with actual file selector component */}
              <button className="select-file-btn">Select File</button>
              {selectedFiles.second && <p>{selectedFiles.second.original_file_name}</p>}
            </div>
          </div>
          
          <button 
            className="compare-button"
            disabled={!selectedFiles.first || !selectedFiles.second}
            onClick={handleCompare}
          >
            Compare Files
          </button>
        </div>
      ) : (
        <>
          <div className="comparison-results">
            <div className="comparison-header">
              <h2>Comparison Results</h2>
              <button 
                className="back-button"
                onClick={() => setIsComparing(false)}
              >
                Back to Selection
              </button>
            </div>
            
            <div className="viewers-container">
              <div className="viewer-column">
                <h3>Before: {selectedFiles.first?.original_file_name}</h3>
                {selectedFiles.first && (
                  <ImageViewer 
                    fileId={selectedFiles.first.id} 
                    onMorphometryData={(data) => handleMorphometryData(data, 'first')}
                  />
                )}
              </div>
              
              <div className="viewer-column">
                <h3>After: {selectedFiles.second?.original_file_name}</h3>
                {selectedFiles.second && (
                  <ImageViewer 
                    fileId={selectedFiles.second.id} 
                    onMorphometryData={(data) => handleMorphometryData(data, 'second')}
                  />
                )}
              </div>
            </div>
            
            {differences && (
              <div className="differences-container">
                <h3>Morphometry Changes</h3>
                <div className="differences-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Before</th>
                        <th>After</th>
                        <th>Change</th>
                        <th>% Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(differences).map(([key, values]) => (
                        <tr key={key} className={values.percentChange > 0 ? 'increase' : values.percentChange < 0 ? 'decrease' : ''}>
                          <td>{key.split('_').join(' ')}</td>
                          <td>{values.before.toFixed(2)}</td>
                          <td>{values.after.toFixed(2)}</td>
                          <td>{values.difference.toFixed(2)}</td>
                          <td>{values.percentChange > 0 ? '+' : ''}{values.percentChange.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <button 
                  className="futuristic-button gpt-analyze-button"
                  onClick={handleSendToGPT}
                >
                  <span className="button-icon">🤖</span>
                  Ask GPT to Analyze Changes
                </button>
              </div>
            )}
            
            <div className="chat-section">
              <h3>Analysis Chat</h3>
              <div className="chat-container">
                <MessageList 
                  messages={messages} 
                  isExpanded={true}
                  isLoading={isLoading}
                  currentResponse={currentResponse}
                />
                <ChatInput 
                  onSubmit={handleChatSubmit}
                  disabled={isLoading}
                  placeholder="Ask about the comparison results..."
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FileComparison; 