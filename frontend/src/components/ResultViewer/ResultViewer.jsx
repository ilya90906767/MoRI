import React, { useEffect, useRef, useState } from 'react';
import './ResultViewer.css';

const ResultViewer = ({ segmentationData, outputData }) => {
  const canvasRef = useRef(null);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [channelIndex, setChannelIndex] = useState(0);
  const [viewMode, setViewMode] = useState('segmentation');
  const [dimensions, setDimensions] = useState({ 
    channels: 4,
    depth: 160,
    height: 256,
    width: 256 
  });

  useEffect(() => {
    const data = viewMode === 'segmentation' ? segmentationData : outputData;
    console.log('Current data:', {
      viewMode,
      data,
      shape: data?.shape,
      hasData: Boolean(data?.data)
    });

    if (!data || !data.data) {
      console.log('No data available for', viewMode);
      return;
    }

    // Set dimensions from shape or use defaults
    if (data.shape && Array.isArray(data.shape) && data.shape.length === 4) {
      const [channels, depth, height, width] = data.shape;
      console.log('Setting dimensions from shape:', { channels, depth, height, width });
      setDimensions({ channels, depth, height, width });
    } else {
      console.log('Using default dimensions:', dimensions);
    }
  }, [segmentationData, outputData, viewMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('Canvas not found');
      return;
    }

    const ctx = canvas.getContext('2d');
    const data = viewMode === 'segmentation' ? segmentationData : outputData;
    
    if (!data?.data || !Array.isArray(data.data)) {
      console.log('Drawing no-data message');
      canvas.width = 400;
      canvas.height = 300;
      ctx.fillStyle = '#eee';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#666';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
      return;
    }

    // Ensure valid dimensions
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      console.error('Invalid dimensions:', dimensions);
      return;
    }

    // Set canvas dimensions
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    console.log('Canvas dimensions set to:', { width: canvas.width, height: canvas.height });

    try {
      // Get the current slice from the selected channel
      const channelData = data.data[channelIndex];
      if (!channelData || !channelData[sliceIndex]) {
        console.error('Invalid channel or slice data:', { channelIndex, sliceIndex });
        return;
      }

      const slice = channelData[sliceIndex];
      console.log('Slice dimensions:', { 
        height: slice.length, 
        width: slice[0]?.length 
      });

      // Create image data
      const imageData = ctx.createImageData(dimensions.width, dimensions.height);
      
      // Fill image data
      for (let y = 0; y < dimensions.height; y++) {
        for (let x = 0; x < dimensions.width; x++) {
          if (!slice[y] || typeof slice[y][x] === 'undefined') {
            console.error('Invalid pixel data at:', { x, y });
            continue;
          }

          const value = slice[y][x];
          const index = (y * dimensions.width + x) * 4;
          
          // Normalize value to 0-255 range
          const normalizedValue = Math.min(255, Math.max(0, value * 255));
          
          imageData.data[index] = normalizedValue;     // R
          imageData.data[index + 1] = normalizedValue; // G
          imageData.data[index + 2] = normalizedValue; // B
          imageData.data[index + 3] = 255;            // A
        }
      }

      // Draw the image
      ctx.putImageData(imageData, 0, 0);
      
      // Add information overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 200, 80);
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`Mode: ${viewMode}`, 20, 30);
      ctx.fillText(`Channel: ${channelIndex + 1}/${dimensions.channels}`, 20, 50);
      ctx.fillText(`Slice: ${sliceIndex + 1}/${dimensions.depth}`, 20, 70);

    } catch (error) {
      console.error('Error drawing slice:', error);
    }
  }, [segmentationData, outputData, sliceIndex, channelIndex, viewMode, dimensions]);

  return (
    <div className="result-viewer">
      <div className="controls">
        <div className="view-controls">
          <label>
            <input
              type="radio"
              value="segmentation"
              checked={viewMode === 'segmentation'}
              onChange={(e) => setViewMode(e.target.value)}
            />
            Segmentation
          </label>
          <label>
            <input
              type="radio"
              value="output"
              checked={viewMode === 'output'}
              onChange={(e) => setViewMode(e.target.value)}
            />
            Output
          </label>
        </div>
        <div className="channel-controls">
          <label>
            Channel: {channelIndex + 1}/{dimensions.channels}
            <input
              type="range"
              min="0"
              max={Math.max(0, dimensions.channels - 1)}
              value={channelIndex}
              onChange={(e) => setChannelIndex(parseInt(e.target.value))}
              disabled={dimensions.channels <= 1}
            />
          </label>
        </div>
        <div className="slice-controls">
          <label>
            Slice: {sliceIndex + 1}/{dimensions.depth}
            <input
              type="range"
              min="0"
              max={Math.max(0, dimensions.depth - 1)}
              value={sliceIndex}
              onChange={(e) => setSliceIndex(parseInt(e.target.value))}
              disabled={dimensions.depth <= 1}
            />
          </label>
        </div>
      </div>
      <div className="viewer">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};

export default ResultViewer; 