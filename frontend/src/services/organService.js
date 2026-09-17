import npyjs from 'npyjs';

const API_URL = `/api`;

// Generate a unique ID for each file
const generateUID = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomStr}`;
};

const getFileExtension = (fileName) => {
  // Special handling for .nii.gz files
  if (fileName.toLowerCase().endsWith('.nii.gz')) {
    return 'nii.gz';
  }
  return fileName.split('.').pop().toLowerCase();
};

export const getFileTypeInfo = (fileName) => {
  const extension = getFileExtension(fileName);
  const fileTypes = {
    'nii.gz': 'NIfTI compressed format - Standard format for neuroimaging data',
    'dcm': 'DICOM (Digital Imaging and Communications in Medicine) - Standard format for medical imaging',
    'jpg': 'JPEG image format - Commonly used for compressed medical images',
    'jpeg': 'JPEG image format - Commonly used for compressed medical images',
    'png': 'PNG image format - Lossless compression, good for medical screenshots',
    'pdf': 'PDF document - May contain medical reports or scanned images'
  }
  return fileTypes[extension] || 'Unknown file type'
}


const loadNPZFile = async (filePath) => {
  try {
    // Extract scan ID and type from the file path
    const fileName = filePath.split('/').pop();
    const scanId = fileName.split('_')[0];
    const type = fileName.split('_')[1].split('.')[0]; // 'segmentation' or 'output'
    
    const fileUrl = `${API_URL}/results/${scanId}/${type}/`;
    console.log('Loading NPZ from:', fileUrl);
    
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch NPZ file: ${response.status}`);
    }
    
    // Get the array buffer
    const arrayBuffer = await response.arrayBuffer();
    console.log('Received array buffer of size:', arrayBuffer.byteLength);

    const npy = new npyjs();
    const parsed = npy.parse(arrayBuffer);

    const shape = parsed.shape;
    const [channels, depth, height, width] = shape;

    // // Create a Uint8Array view of the buffer
    // const uint8Array = new Uint8Array(arrayBuffer);

    // // Create a Float32Array view for the actual data (assuming float32 data type)
    // // Each float32 number takes 4 bytes
    // const float32Array = new Float32Array(arrayBuffer);
    
    

    return {
      data: parsed,
      shape: [channels, depth, height, width]
    };
  } catch (error) {
    console.error('Error loading NPY file:', error);
    throw error;
  }
};

export const handleOrganClassification = async (organName, file) => {
  try {
    const uid = generateUID();
    const extension = getFileExtension(file.name);
    const fileName = `${uid}.${extension}`;

    // Send both file and analysis data in one request
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify({
      uid,
      fileName,
      organ: organName.toLowerCase().trim(),
      originalFileName: file.name
    }));

    const response = await fetch(`${API_URL}/analyze/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Analysis request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success && data.data && data.data.id) {
      // Start polling for results
      return pollForResults(data.data.id, organName);
    }

    return {
      success: false,
      message: data.message || "Failed to process the scan. No scan ID received."
    };
  } catch (error) {
    console.error('API error:', error);
    return {
      success: false,
      message: error.message || "Sorry, I couldn't process the image analysis. Please try again or check if the server is running."
    };
  }
}

const pollForResults = async (scanId, organName, attempts = 0) => {
  try {
    console.log(`Polling for results of scan ${scanId}, attempt ${attempts + 1}`);
    const response = await fetch(`${API_URL}/analyze/${scanId}/status/`);
    
    if (!response.ok) {
      throw new Error(`Failed to get status: ${response.status}`);
    }

    const data = await response.json();

    if (data.processing_complete) {
      // Load NPZ files directly
      let segmentationData = null;
      let outputData = null;

      if (data.segmentation_file_path) {
        try {
          segmentationData = await loadNPZFile(data.segmentation_file_path);
        } catch (error) {
          console.warn('Failed to load segmentation data:', error);
        }
      }

      if (data.output_file_path) {
        try {
          outputData = await loadNPZFile(data.output_file_path);
        } catch (error) {
          console.warn('Failed to load output data:', error);
        }
      }

      return {
        success: true,
        message: `Analysis of ${organName} scan is complete. Here are the results:`,
        segmentation: segmentationData,
        output: outputData
      };
    }

    if (attempts >= 30) { // Stop after 30 attempts (5 minutes)
      return {
        success: false,
        message: "Processing is taking longer than expected. Please check back later."
      };
    }

    // Wait 10 seconds before next attempt
    await new Promise(resolve => setTimeout(resolve, 10000));
    return pollForResults(scanId, organName, attempts + 1);

  } catch (error) {
    console.error('Polling error:', error);
    return {
      success: false,
      message: `Error checking analysis status: ${error.message}`
    };
  }
};