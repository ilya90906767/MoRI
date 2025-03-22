import React, { useState, useEffect, useRef } from 'react';
import './ImageViewer.css';

// Base API URL from environment variables
const API_BASE_URL = `/api`;

const ImageViewer = ({ fileId, onSendToChat, onMorphometryData }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [currentSlice, setCurrentSlice] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [totalSlices, setTotalSlices] = useState(0);
  const [alzAnalysisInProgress, setAlzAnalysisInProgress] = useState(false);
  const [alzPrediction, setAlzPrediction] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [morphometryInProgress, setMorphometryInProgress] = useState(false);
  const [morphometryData, setMorphometryData] = useState(null);
  const [dataLoadStatus, setDataLoadStatus] = useState('checking'); // 'checking', 'idle', 'in_progress', 'success', 'error'
  const canvasRef = useRef(null);
  const previousImageDataRef = useRef(null); // Add ref to store previous image data

  // Clear all state when fileId changes
  useEffect(() => {
    setData(null);
    setError(null);
    setCurrentSlice(30);
    setIsLoading(false);
    setTotalSlices(0);
    setAlzAnalysisInProgress(false);
    setAlzPrediction(null);
    setPredictionLoading(false);
    setMorphometryInProgress(false);
    setMorphometryData(null);
    setDataLoadStatus('checking');
    previousImageDataRef.current = null;
  }, [fileId]);

  const fetchData = async (sliceNumber) => {
    try {
      setIsLoading(true);
      setError(null);
      console.log(`Fetching data for fileId: ${fileId}, slice: ${parseInt(sliceNumber)}`);
      
      const response = await fetch(`${API_BASE_URL}/results/${fileId}/output/${parseInt(sliceNumber)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch slice ${parseInt(sliceNumber)}`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        console.log('Received data:', {
          shape: result.data.shape,
          availableSlices: Object.keys(result.data.data).length,
          dtype: result.data.dtype,
          totalSlices: result.data.total_slices
        });
        
        // Set total slices from the response data as integer
        setTotalSlices(parseInt(result.data.total_slices));
        
        if (!result.data.data || !Array.isArray(result.data.shape)) {
          throw new Error('Invalid data structure received from server');
        }

        setData(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch data');
      }
    } catch (error) {
      console.error('Error fetching image data:', error);
      setError(error.message);
      setData(null);
    } finally {
      setIsLoading(false);  
    }
  };

  // Check morphometry status
  const checkMorphometryStatus = async () => {
    try {
      // Only show checking state if we're moving from idle
      if (dataLoadStatus !== 'in_progress') {
        setDataLoadStatus('checking');
      }
      
      console.log('Checking morphometry status...');
      // Use the dedicated morphometry endpoint instead of the general scan endpoint
      const response = await fetch(`${API_BASE_URL}/morphometry-data/${fileId}/`);
      
      if (!response.ok) {
        // Check specific status codes
        if (response.status === 202) {
          // 202 Accepted means process is running
          console.log("Morphometry analysis is in progress");
          setMorphometryInProgress(true);
          setDataLoadStatus('in_progress');
          setError(null);
          // Continue polling
          setTimeout(checkMorphometryStatus, 5000);
          return;
        }
        
        if (response.status === 404) {
          // 404 Not Found means no data and not started
          console.log("No morphometry data or analysis found");
          setMorphometryInProgress(false);
          setDataLoadStatus('idle');
          return;
        }
        
        throw new Error('Failed to fetch morphometry data');
      }
      
      // If we got here, we received a successful response
      const result = await response.json();
      
      // Log the full response data for debugging
      console.log('Got morphometry data:', result);
      
      if (result.status === 'success' && result.morphometry_data) {
        console.log("Found morphometry data:", result.morphometry_data);
        setMorphometryData(result.morphometry_data);
        setMorphometryInProgress(false);
        setDataLoadStatus('success');
        setError(null);
      } else if (result.status === 'in_progress') {
        console.log("Morphometry analysis is in progress");
        setMorphometryInProgress(true);
        setDataLoadStatus('in_progress');
        setError(null);
        // Continue polling
        setTimeout(checkMorphometryStatus, 5000);
      } else {
        // Unknown status
        console.log(`Unknown status: ${result.status}`);
        setMorphometryInProgress(false);
        setDataLoadStatus('idle');
      }
    } catch (error) {
      console.error('Error checking morphometry status:', error);
      
      // If we think an analysis is in progress, keep checking despite errors
      if (morphometryInProgress) {
        console.log("Will retry status check despite error");
        setTimeout(checkMorphometryStatus, 15000); // Longer delay on error
      } else {
        setMorphometryInProgress(false);
        setDataLoadStatus('error');
        setError(error.message);
      }
    }
  };

  // Start morphometry analysis
  const startMorphometryAnalysis = async () => {
    try {
      // First, check if morphometry data already exists to avoid unnecessary calls
      const checkResponse = await fetch(`${API_BASE_URL}/morphometry-data/${fileId}/`);
      
      // Handle the response from the dedicated endpoint
      if (checkResponse.ok) {
        const result = await checkResponse.json();
        
        // If data already exists, just set it and exit
        if (result.status === 'success' && result.morphometry_data) {
          console.log("Found existing morphometry data:", result.morphometry_data);
          setMorphometryData(result.morphometry_data);
          setMorphometryInProgress(false);
          setDataLoadStatus('success');
          setError(null);
          return; // Exit early - data already available
        }
      }
      // If 202 Accepted, analysis is in progress
      else if (checkResponse.status === 202) {
        console.log("Morphometry analysis is already in progress");
        setMorphometryInProgress(true);
        setDataLoadStatus('in_progress');
        setError(null);
        // Poll for results
        setTimeout(checkMorphometryStatus, 5000);
        return; // Exit early - analysis already in progress
      }
      // If not 404, something else went wrong
      else if (checkResponse.status !== 404) {
        console.error(`Unexpected status checking morphometry: ${checkResponse.status}`);
      }
      
      // If we reached here, we need to start a new analysis
      setMorphometryInProgress(true);
      setDataLoadStatus('in_progress');
      
      // Make the POST request to start analysis
      console.log('Starting morphometry analysis - this may take several minutes...');
      
      // Use a try/catch specifically for the POST request to handle timeout separately
      try {
        const response = await fetch(`${API_BASE_URL}/morphometry/${fileId}/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          console.log(`POST request returned status: ${response.status}`);
        } else {
          const result = await response.json();
          console.log('Morphometry analysis started:', result);
        }
      } catch (postError) {
        // Log the POST error but don't change the UI state yet
        console.error('Error in POST request:', postError);
        console.log('Will check for data anyway in case analysis started on server');
      }
      
      // Always check for data regardless of POST success or failure
      // This is crucial - even if POST times out, the server might have started processing
      setTimeout(checkMorphometryStatus, 5000);
      
    } catch (error) {
      console.error('Error in morphometry workflow:', error);
      setError('Error starting morphometry analysis. Please try checking status later.');
      // Still try to check status in case there's data
      setTimeout(checkMorphometryStatus, 10000);
    }
  };

  // Send morphometry data to Chat component
  const handleSendToChat = () => {
    if (morphometryData && onSendToChat) {
      onSendToChat(morphometryData);
    }
  };

  // Start Alzheimer's prediction analysis
  const startAlzheimerAnalysis = async () => {
    try {
      setPredictionLoading(true);
      setAlzAnalysisInProgress(true);
      setAlzPrediction(null);
      
      const response = await fetch(`${API_BASE_URL}/alzheimer-prediction/${fileId}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to start Alzheimer analysis');
      }
      
      const result = await response.json();
      console.log('Alzheimer analysis started:', result);
      
      // Start polling for results
      checkPredictionStatus();
      
    } catch (error) {
      console.error('Error starting Alzheimer analysis:', error);
      setError(error.message);
      setAlzAnalysisInProgress(false);
    } finally {
      setPredictionLoading(false);
    }
  };
  
  // Check prediction status and fetch results
  const checkPredictionStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/mri-scans/${fileId}/`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch scan data');
      }
      
      const result = await response.json();
      const scanData = result.data || result;
      
      if (scanData.prediction_complete) {
        // Prediction is complete
        setAlzAnalysisInProgress(false);
        setAlzPrediction({
          result: scanData.alzheimer_prediction,
          confidence: scanData.prediction_confidence || 'N/A'
        });
      } else if (scanData.alzheimer_prediction) {
        // We have a result but it's not marked as complete
        setAlzAnalysisInProgress(false);
        setAlzPrediction({
          result: scanData.alzheimer_prediction,
          confidence: scanData.prediction_confidence || 'N/A'
        });
      } else if (alzAnalysisInProgress) {
        // Still in progress, poll again after a delay
        setTimeout(checkPredictionStatus, 5000);
      }
      
    } catch (error) {
      console.error('Error checking prediction status:', error);
      setError(error.message);
      setAlzAnalysisInProgress(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (fileId) {
      fetchData(currentSlice);
      
      // Check existing data status
      const checkExistingData = async () => {
        console.log('Checking for existing data on initial load...');
        try {
          // Set initial state to checking
          setDataLoadStatus('checking');
          
          // Check for morphometry data using dedicated endpoint
          try {
            const morphResponse = await fetch(`${API_BASE_URL}/morphometry-data/${fileId}/`);
            
            if (morphResponse.ok) {
              const morphResult = await morphResponse.json();
              console.log('Initial morphometry check returned:', morphResult);
              
              if (morphResult.status === 'success' && morphResult.morphometry_data) {
                console.log('Found existing morphometry data on load');
                setMorphometryData(morphResult.morphometry_data);
                setMorphometryInProgress(false);
                setDataLoadStatus('success');
                setError(null);
              } else if (morphResult.status === 'in_progress') {
                console.log('Found morphometry analysis in progress on load');
                setMorphometryInProgress(true);
                setDataLoadStatus('in_progress');
                // Start polling for completion
                setTimeout(checkMorphometryStatus, 5000);
              }
            } else if (morphResponse.status === 404) {
              console.log('No morphometry data or process found on load');
              setDataLoadStatus('idle');
              setMorphometryInProgress(false);
            } else {
              console.log('Error checking morphometry:', morphResponse.statusText);
            }
          } catch (morphError) {
            console.error('Error checking morphometry data:', morphError);
          }
          
          // Check for Alzheimer prediction (still using general scan endpoint)
          try {
            const response = await fetch(`${API_BASE_URL}/mri-scans/${fileId}/`);
            
            if (response.ok) {
              const result = await response.json();
              const scanData = result.data || result;
              
              // Check for Alzheimer prediction (independent of morphometry)
              if (scanData.alzheimer_prediction) {
                setAlzPrediction({
                  result: scanData.alzheimer_prediction,
                  confidence: scanData.prediction_confidence || 'N/A'
                });
              }
            }
          } catch (error) {
            console.error('Error checking Alzheimer data:', error);
          }
          
        } catch (error) {
          console.error('Error checking existing data:', error);
          setDataLoadStatus('error');
          setError('Error during initial data check: ' + error.message);
        }
      };
      
      checkExistingData();
    }
  }, [fileId]); // Remove currentSlice dependency to prevent double fetching

  useEffect(() => {
    if (!data || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const [depth, height, width] = data.shape;

    canvas.width = Math.floor(width);
    canvas.height = Math.floor(height);

    try {
      const sliceData = data.data[0];
      
      if (!sliceData) {
        throw new Error(`No data found for slice ${currentSlice}`);
      }

      if (isLoading) {
        // Keep previous image instead of black rectangle
        if (previousImageDataRef.current) {
          ctx.putImageData(previousImageDataRef.current, 0, 0);
        }
        return;
      }

      const imageData = ctx.createImageData(
        Math.floor(width), 
        Math.floor(height)
      );

      let minVal = Infinity;
      let maxVal = -Infinity;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const value = sliceData[y][x];
          minVal = Math.min(minVal, value);
          maxVal = Math.max(maxVal, value);
        }
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const value = sliceData[y][x];
          const i = (y * width + x) * 4;
          
          const intensity = Math.floor(
            ((value - minVal) / (maxVal - minVal)) * 255
          );
          
          imageData.data[i] = intensity;     // R
          imageData.data[i + 1] = intensity; // G
          imageData.data[i + 2] = intensity; // B
          imageData.data[i + 3] = 255;       // A
        }
      }

      ctx.putImageData(imageData, 0, 0);
      // Store current image data for next loading state
      previousImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    } catch (error) {
      console.error('Error rendering image:', error);
      setError('Error rendering image: ' + error.message);
    }
  }, [data, isLoading]);

  // Add notification for when morphometry data is available
  useEffect(() => {
    if (morphometryData && onMorphometryData) {
      onMorphometryData(morphometryData);
    }
  }, [morphometryData, onMorphometryData]);

  if (error) {
    return <div className="image-viewer-error">Error: {error}</div>;
  }

  if (!data) {
    return <div className="image-viewer-loading">Initializing viewer...</div>;
  }

  // Render morphometry data as a formatted table
  const renderMorphometryData = () => {
    console.log('Rendering morphometry data:', { morphometryData });
    
    if (!morphometryData) {
      console.log('No morphometry data available');
      return null;
    }
    
    try {
      // If morphometryData is a string, try to parse it
      const data = typeof morphometryData === 'string' 
        ? JSON.parse(morphometryData) 
        : morphometryData;

      console.log('Parsed morphometry data:', data);
      
      // Group brain regions by categories for better organization
      const categories = {
        'Lobes': Object.entries(data).filter(([key]) => key.includes('lobe')),
        'Cortex Regions': Object.entries(data).filter(([key]) => key.includes('cortex')),
        'Deep Structures': Object.entries(data).filter(([key]) => 
          key.includes('thalamus') || key.includes('pallidum') || 
          key.includes('putamen') || key.includes('caudate') || 
          key.includes('hippocampus') || key.includes('amygdala')
        ),
        'Other Regions': Object.entries(data).filter(([key]) => 
          !key.includes('lobe') && 
          !key.includes('cortex') && 
          !key.includes('thalamus') && 
          !key.includes('pallidum') && 
          !key.includes('putamen') && 
          !key.includes('caudate') && 
          !key.includes('hippocampus') && 
          !key.includes('amygdala')
        )
      };
      
      return (
        <div className="morphometry-data">
          <div className="morphometry-header">
            <h4>Brain Morphometry Data</h4>
            <div className="morphometry-status success">
              <span className="status-icon">✓</span>
              <span>Data Available</span>
            </div>
          </div>
          
          {Object.entries(categories).map(([category, regions], index) => {
            // Only render categories that have regions
            if (regions.length === 0) return null;
            
            return (
              <div key={category} className="morphometry-category" style={{"--index": index}}>
                <h5>{category}</h5>
                <div className="morphometry-table">
                  <table>
                    <tbody>
                      {regions.map(([region, value]) => (
                        <tr key={region}>
                          <td>{region.split('_').join(' ')}</td>
                          <td>{typeof value === 'number' ? value.toFixed(2) : value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          
          <div className="morphometry-actions">
            <button 
              onClick={handleSendToChat}
              className="futuristic-button"
            >
              <span className="button-icon">🤖</span>
              Ask GPT to Analyze Morphometry Data
            </button>
          </div>
        </div>
      );
    } catch (error) {
      console.error('Error rendering morphometry data:', error);
      return <div>Error displaying morphometry data</div>;
    }
  };

  // Render status indicator for morphometry data loading
  const renderMorphometryStatus = () => {
    if (dataLoadStatus === 'checking') {
      return (
        <div className="morphometry-status loading">
          <div className="loading-spinner"></div>
          <span>Checking for existing morphometry data...</span>
        </div>
      );
    }
    
    if (dataLoadStatus === 'in_progress' || morphometryInProgress) {
      return (
        <div className="morphometry-status loading">
          <div className="loading-spinner"></div>
          <span>Processing morphometry data for {fileId}... (this may take several minutes)</span>
          <div className="status-note">
            This is a computationally intensive process that continues in the background.
            You can leave this page and check back later.
          </div>
        </div>
      );
    }
    
    if (dataLoadStatus === 'error') {
      return (
        <div className="morphometry-status error">
          <span className="status-icon">⚠️</span>
          <span>Error: {error || 'Unknown error occurred'}</span>
          <div className="status-note">
            There might still be data available. Click the button below to check.
          </div>
          <button 
            onClick={checkMorphometryStatus} 
            className="retry-button"
          >
            Check For Data
          </button>
        </div>
      );
    }
    
    if (dataLoadStatus === 'idle' && !morphometryData) {
      return (
        <div className="morphometry-status idle">
          <div className="status-message">Morphometric analysis has not been started yet</div>
          <button
            onClick={startMorphometryAnalysis}
            disabled={morphometryInProgress}
            className="analyze-button analyze-morphometry"
          >
            Start Morphometry Analysis
          </button>
          <div className="status-note">
            Note: This analysis may take 5-10 minutes to complete. 
            The process will continue in the background even if you navigate away.
          </div>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="image-viewer">
      <div className="image-viewer-controls">
        <div className="control-group">
          <label>Slice:</label>
          <input
            type="range"
            min="0"
            max={totalSlices-1}
            value={currentSlice}
            onChange={(e) => {
              const newSlice = Number(e.target.value);
              setCurrentSlice(newSlice);
              fetchData(newSlice); // Fetch new slice data when slider changes
            }}
          />
          <span>{currentSlice + 1}/{totalSlices}</span>
        </div>
        <div className="control-group">
          <label>Brain Age:</label>
          <span>
            {alzPrediction ? 
              `${alzPrediction.result} years` : 
              alzAnalysisInProgress ? 
                'Analyzing...' : 
                'Not analyzed'
            }
          </span>
          {!alzPrediction && !alzAnalysisInProgress && (
            <button 
              onClick={startAlzheimerAnalysis}
              disabled={alzAnalysisInProgress || predictionLoading}
              className="analyze-button"
            >
              {predictionLoading ? 'Starting...' : 'Analyze Age'}
            </button>
          )}
        </div>
      </div>
      
      <div className="canvas-container">
        <canvas ref={canvasRef} />
        {isLoading}
      </div>
      
      {/* Morphometry section with enhanced rendering */}
      <div className="morphometry-section">
        {renderMorphometryStatus()}
        {morphometryData && renderMorphometryData()}
      </div>
    </div>
  );
};

export default ImageViewer;