import os
import logging
import nibabel as nib
import numpy as np
import torch
from monai.transforms import ResizeWithPadOrCrop
import requests
from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)

# Initialize device and transform once
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
resize_transform = ResizeWithPadOrCrop(spatial_size=(4, 160, 256, 256))

def get_nii(nii_file):
    try:
        img = nib.load(nii_file)
        data = img.get_fdata()
        return data
    except Exception as e:
        logger.error(f"Error loading NIfTI file {nii_file}: {e}")
        raise
def save_data_to_npy(data, file_path, chunk_size=10):
    """Save numpy array data to NPY file."""
    try:
        # Get the shape information
        shape = data.shape
        logger.info(f"Original data shape: {shape}")

        # Create the base directory if it doesn't exist
        base_dir = os.path.dirname(file_path)
        if not os.path.exists(base_dir):
            os.makedirs(base_dir)

        # Save data to NPY file
        np.save(file_path, data)
            
        logger.info(f"Successfully saved data to {file_path}")
        return True
    
    except Exception as e:
        logger.error(f"Error saving data to NPY file: {e}")
        return False

@shared_task
def process_mri_data(file_path, scan_id):
    """
    Process MRI data from a NIfTI file.
    
    Args:
        file_path: Path to the NIfTI file
        scan_id: ID of the scan for tracking
        
    Returns:
        bool: True if processing was successful, False otherwise
    """
    logger = logging.getLogger('mori')
    logger.info(f"Starting MRI processing for scan ID: {scan_id}")
    
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Load and process the MRI data
        logger.info("Loading NIfTI file...")
        mri_volume = get_nii(file_path)
        logger.info(f"MRI volume shape before moving: {mri_volume.shape}")
        shape = mri_volume.shape
        min_axis = shape.index(min(shape))
        if len(shape) == 4:
            # Delete the minimum axis from the MRI volume
            mri_volume = np.delete(mri_volume, min_axis, axis=0)
            mri_volume = np.moveaxis(mri_volume, min_axis, 0)
            logger.info(f"MRI volume shape after moving: {mri_volume.shape}")
        else:
            mri_volume = np.moveaxis(mri_volume, min_axis, 0)
            logger.info("Data is 3D, skipping axis movement")
        
        # # Prepare input tensor
        # logger.info("Preparing input tensor...")
        # input_tensor = torch.tensor(mri_volume, dtype=torch.float32)
        
        # # Check if the tensor needs permuting (depends on your data format)
        # if len(input_tensor.shape) == 4:
        #     input_tensor = input_tensor.permute(3, 0, 1, 2)
        
        # input_tensor = input_tensor.unsqueeze(0)
        # input_tensor = resize_transform(input_tensor)
        # input_tensor = input_tensor.to(device)
        
        # logger.info(f"Input tensor shape: {input_tensor.shape}")

        # model = unet.to(device)

        # with torch.no_grad():
        #     output = model(input_tensor)  # Segmentation output
        #     segmentation = output.squeeze().cpu().numpy()

        # def normalize_multichannel(data):
        #     # If data is 4D (channels, depth, height, width)
        #     if len(data.shape) == 4:
        #         normalized = np.zeros_like(data)
        #         for c in range(data.shape[0]):
        #             channel = data[c]
        #             min_val = np.min(channel)
        #             max_val = np.max(channel)
        #             if max_val > min_val:
        #                 normalized[c] = (channel - min_val) / (max_val - min_val)
        #             else:
        #                 normalized[c] = np.zeros_like(channel)
        #         return normalized
        #     # If data is 3D (depth, height, width)
        #     else:
        #         min_val = np.min(data)
        #         max_val = np.max(data)
        #         if max_val > min_val:
        #             return (data - min_val) / (max_val - min_val)
        #         else:
        #             return np.zeros_like(data)

        # mri_volume_normalized = normalize_multichannel(mri_volume)
        # segmentation_normalized = normalize_multichannel(segmentation)

        # target_shape = mri_volume_normalized.shape
        
        # # Calculate scale factors for each dimension
        # scale_factors = []
        # for i in range(len(segmentation_normalized.shape)):
        #     if i < len(target_shape):
        #         scale_factors.append(target_shape[i] / segmentation_normalized.shape[i])
        #     else:
        #         scale_factors.append(1.0)

        # segmentation_resized = zoom(segmentation_normalized, scale_factors, order=1)

        # Save results to files
        results_dir = os.path.join(settings.MRI_FILES_PATH, 'results')
        os.makedirs(results_dir, exist_ok=True)

        # Save segmentation data
        segmentation_file = f"{scan_id}_segmentation.npy"
        segmentation_path = os.path.join(results_dir, segmentation_file)
        save_data_to_npy(mri_volume, segmentation_path)

        # Save MRI data 
        mri_stock_file = f"{scan_id}_mri.npy"
        mri_stock_path = os.path.join(results_dir, mri_stock_file)
        save_data_to_npy(mri_volume, mri_stock_path)

        webhook_data = {
            'scan_id': scan_id,
            'process_type': 'segmentation',
            'process_complete': True,
            'segmentation_file_path': segmentation_path,
            'output_file_path': mri_stock_path
        }

        # Base URL from settings that uses environment variables
        webhook_url = f"http://{settings.HOST}:{settings.PORT}/api/processing-webhook/"
        
        logger.info("Sending processing status to webhook...")
        response = requests.post(
            webhook_url,
            json=webhook_data,
            headers={'Content-Type': 'application/json'}
        )

        if not response.ok:
            logger.error(f"Failed to send webhook: {response.status_code}")
            return False

        logger.info("Successfully processed MRI data and sent results")
        return True

    except Exception as e:
        logger.error(f"Error processing MRI data: {e}")
        # Send error status to webhook
        webhook_data = {
            'scan_id': scan_id,
            'process_type': 'segmentation',
            'process_complete': False,
            'error': str(e)
        }
        
        # Base URL from settings that uses environment variables
        webhook_url = f"http://{settings.HOST}:{settings.PORT}/api/processing-webhook/"
        
        try:
            requests.post(
                webhook_url,
                json=webhook_data,
                headers={'Content-Type': 'application/json'}
            )
        except Exception as webhook_error:
            logger.error(f"Failed to send error webhook: {webhook_error}")
        
        return False
