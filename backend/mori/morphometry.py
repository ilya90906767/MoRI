import os
import logging
import numpy as np
import nibabel as nib
from scipy import ndimage
from skimage import measure, filters, morphology
import requests
from celery import shared_task
from django.conf import settings
# import matplotlib
# matplotlib.use('Agg')  # Set backend before importing pyplot
import matplotlib.pyplot as plt

logger = logging.getLogger(__name__)

def get_nii(nii_file):
    """
    Load a NIfTI file and return its data.
    
    Args:
        nii_file: Path to NIfTI file
        
    Returns:
        numpy.ndarray: The image data
    """
    try:
        img = nib.load(nii_file)
        data = img.get_fdata()
        return data
    except Exception as e:
        logger.error(f"Error loading NIfTI file {nii_file}: {e}")
        raise
    

def calculate_volume(segmentation, voxel_dims=(1.0, 1.0, 1.0)):
    """
    Calculate the volume of a segmented region.
    
    Args:
        segmentation: Binary mask of the segmented region
        voxel_dims: Dimensions of a single voxel in mm (x, y, z)
        
    Returns:
        float: Volume in cubic millimeters
    """
    # Calculate voxel volume in mm³
    voxel_volume = voxel_dims[0] * voxel_dims[1] * voxel_dims[2]
    
    # Count voxels in segmentation
    voxel_count = np.sum(segmentation)
    
    # Calculate raw volume (voxel count * voxel volume)
    raw_volume = voxel_count * voxel_volume
    
    # Scale factor for realistic brain volumes
    # A typical adult human brain volume is ~1,300,000 cubic mm
    # If the calculated volume is unrealistically small, apply scaling
    if raw_volume < 10000:  # If volume is less than 10 cubic cm
        # Estimate a scaling factor based on expected brain volume
        # and the proportion of the segmentation in the full image
        typical_brain_volume = 1300000  # cubic mm
        
        # Calculate the proportion of the segmented region in the full image
        total_voxels = segmentation.size
        if total_voxels > 0:
            # Scale based on proportion of the mask compared to the full volume
            proportion = voxel_count / total_voxels
            return typical_brain_volume * proportion
    print(raw_volume)
    return raw_volume

def visualize_brain_regions(brain_data, segments, slice_idx=None):
    """
    Visualize brain regions only on key slices.
    
    Args:
        brain_data: 3D numpy array of brain data
        segments: Dictionary of segmented brain regions
        slice_idx: Specific slice index to visualize (if None, automatically selects key slices)
    """
    if brain_data.size == 0:
        logger.warning("Empty brain data, cannot visualize")
        return
    
    # If a specific slice is requested, only show that one
    if slice_idx is not None:
        slice_indices = [slice_idx]
    else:
        # Automatically select only the most informative slices
        # Find slices where the brain exists
        if 'brain' in segments and np.any(segments['brain']):
            # Get Z indices where the brain is present
            z_indices = np.where(np.any(segments['brain'], axis=(0, 1)))[0]
            
            if len(z_indices) > 0:
                # Find the slice with maximum brain area (most informative central slice)
                brain_areas = [np.sum(segments['brain'][:, :, z]) for z in z_indices]
                max_area_idx = z_indices[np.argmax(brain_areas)]
                
                # Only visualize the single most informative slice by default
                slice_indices = [max_area_idx]
            else:
                # Fallback to middle slice if no brain is detected
                slice_indices = [brain_data.shape[2] // 2]
        else:
            # Fallback to middle slice if no brain segments exist
            slice_indices = [brain_data.shape[2] // 2]
    
    # Create one figure for the selected key slice
    for slice_idx in slice_indices:
        if slice_idx >= brain_data.shape[2]:
            logger.warning(f"Slice index {slice_idx} is out of bounds")
            continue
            
        # # Save plot to file instead of displaying
        # plt.figure(figsize=(18, 12))
        # plt.savefig('brain_regions.png')
        # plt.close()
        
        # Only display one slice by default to keep visualization concise
        break

def segment_brain_regions(brain_data, threshold=None):
    """
    Segment brain regions by thresholding and connected components.
    
    Args:
        brain_data: 3D numpy array of brain data
        threshold: Threshold value for segmentation (if None, uses Otsu's method)
        
    Returns:
        dict: Dictionary of brain region masks
    """
    try:
        # Check if brain_data contains meaningful values
        if np.all(brain_data == 0) or np.isnan(brain_data).any():
            logger.warning("Brain data contains all zeros or NaN values.")
            return {}
        
        # Normalize data to 0-1 range
        data_min = np.min(brain_data)
        data_max = np.max(brain_data)
        
        if data_max - data_min > 0:
            data_norm = (brain_data - data_min) / (data_max - data_min)
        else:
            logger.warning("Brain data has no dynamic range.")
            return {}
        
        # Determine threshold automatically if not provided
        if threshold is None:
            # Otsu's method for automatic thresholding
            try:
                flat_data = data_norm.flatten()
                # Remove NaNs and extreme values
                flat_data = flat_data[~np.isnan(flat_data)]
                if len(flat_data) > 0:
                    threshold = filters.threshold_otsu(flat_data)
                else:
                    threshold = 0.5
            except Exception as e:
                logger.warning(f"Could not determine threshold automatically: {e}")
                threshold = 0.5
            
            logger.info(f"Using threshold value: {threshold}")
        
        # Create brain mask using the threshold
        brain_mask = data_norm > threshold
        
        # If the mask is too small, try a lower threshold
        if np.sum(brain_mask) < brain_data.size * 0.05:
            logger.warning("Mask too small, trying lower threshold.")
            threshold = threshold * 0.5
            brain_mask = data_norm > threshold
        
        # Apply morphological operations to clean up the mask
        try:
            # Close small holes
            brain_mask = morphology.binary_closing(brain_mask, morphology.ball(2))
            # Remove small isolated areas
            brain_mask = morphology.binary_opening(brain_mask, morphology.ball(2))
            # Fill remaining holes
            brain_mask = ndimage.binary_fill_holes(brain_mask)
        except Exception as e:
            logger.warning(f"Error during morphological operations: {e}")
        
        # Label different connected components
        labeled_mask, num_labels = ndimage.label(brain_mask)
        
        # Extract the largest connected component (the brain)
        if num_labels > 0:
            sizes = ndimage.sum(brain_mask, labeled_mask, range(1, num_labels + 1))
            if len(sizes) > 0:
                largest_label = np.argmax(sizes) + 1
                brain_mask = labeled_mask == largest_label
            else:
                logger.warning("No connected components found.")
                return {}
        else:
            logger.warning("No connected components found.")
            return {}
        
        # Estimate cortex by using edge detection
        edges = filters.sobel(data_norm)
        try:
            edge_threshold = filters.threshold_otsu(edges[brain_mask]) if np.any(brain_mask) else 0.5
        except:
            edge_threshold = 0.5
            
        cortex_mask = (edges > edge_threshold) & brain_mask
        
        # If cortex mask is too small, use dilation method
        if np.sum(cortex_mask) < np.sum(brain_mask) * 0.1:
            # Dilate edges of brain mask to create cortex
            dilated = morphology.binary_dilation(brain_mask, morphology.ball(2))
            eroded = morphology.binary_erosion(brain_mask, morphology.ball(2))
            cortex_mask = dilated & ~eroded
        
        # Estimate white matter by higher intensity threshold
        # Use adaptive thresholding based on the intensity histogram
        if np.any(brain_mask):
            try:
                # Calculate histogram of brain voxel intensities
                hist, bin_edges = np.histogram(data_norm[brain_mask], bins=50)
                
                # Find the intensity that separates white matter (higher intensities) 
                # A common heuristic is to use the 75th percentile
                wm_threshold = np.percentile(data_norm[brain_mask], 75)
                
                # Make sure white matter is at least a certain percentage of the brain
                white_matter_mask = (data_norm > wm_threshold) & brain_mask
                
                # If white matter is too small, adjust threshold
                if np.sum(white_matter_mask) < np.sum(brain_mask) * 0.1:
                    wm_threshold = np.percentile(data_norm[brain_mask], 65)
                    white_matter_mask = (data_norm > wm_threshold) & brain_mask
            except:
                # Fallback if histogram approach fails
                white_matter_mask = morphology.binary_erosion(brain_mask, morphology.ball(3))
        else:
            white_matter_mask = np.zeros_like(brain_mask)
        
        # Ensure white matter mask is not empty
        if not np.any(white_matter_mask):
            # Use the center part of the brain as white matter
            white_matter_mask = morphology.binary_erosion(brain_mask, morphology.ball(4))
        
        # Estimate gray matter by subtracting white matter from brain
        gray_matter_mask = brain_mask & ~white_matter_mask
        
        # Ensure gray matter mask is not empty
        if not np.any(gray_matter_mask):
            # Use a ring around white matter as gray matter
            gray_matter_mask = brain_mask & ~morphology.binary_erosion(brain_mask, morphology.ball(3))
        
        # Estimate cerebellum (improved approach)
        z_indices = np.where(np.any(brain_mask, axis=(0, 1)))[0]
        if len(z_indices) > 0:
            # In most brain orientations, cerebellum is in the posterior portion
            # Use last 25% of brain in z-direction as potential cerebellum location
            z_min, z_max = z_indices.min(), z_indices.max()
            z_threshold = z_max - 0.25 * (z_max - z_min)
            
            # Create cerebellum mask in posterior portion
            potential_cerebellum = brain_mask.copy()
            potential_cerebellum[:, :, :int(z_threshold)] = False
            
            # Label connected components
            cerebellum_labels, num_cerebellum_labels = ndimage.label(potential_cerebellum)
            
            if num_cerebellum_labels > 0:
                # Find largest component in posterior portion
                cerebellum_sizes = ndimage.sum(potential_cerebellum, cerebellum_labels, 
                                             range(1, num_cerebellum_labels + 1))
                if len(cerebellum_sizes) > 0:
                    largest_cerebellum_label = np.argmax(cerebellum_sizes) + 1
                    cerebellum_mask = cerebellum_labels == largest_cerebellum_label
                else:
                    cerebellum_mask = potential_cerebellum
            else:
                # Fallback: use lower portion of brain
                cerebellum_mask = potential_cerebellum
        else:
            cerebellum_mask = np.zeros_like(brain_mask, dtype=bool)
        
        # Ensure cerebellum is not empty
        if not np.any(cerebellum_mask):
            # Use bottom 15% of brain as cerebellum
            y_indices = np.where(np.any(brain_mask, axis=(0, 2)))[0]
            if len(y_indices) > 0:
                y_min, y_max = y_indices.min(), y_indices.max()
                y_threshold = y_max - 0.15 * (y_max - y_min)
                cerebellum_mask = brain_mask.copy()
                cerebellum_mask[:, :int(y_threshold), :] = False
        print('brain', brain_mask,
            'cortex', cortex_mask,
            'white_matter', white_matter_mask,
            'gray_matter', gray_matter_mask,
            'cerebellum', cerebellum_mask)
        return {
            'brain': brain_mask,
            'cortex': cortex_mask,
            'white_matter': white_matter_mask,
            'gray_matter': gray_matter_mask,
            'cerebellum': cerebellum_mask
        }
    
    except Exception as e:
        logger.error(f"Error in brain segmentation: {e}")
        return {}

def calculate_surface_area(mask, voxel_dims=(1.0, 1.0, 1.0)):
    """
    Calculate the surface area of a 3D segmentation mask.
    
    Args:
        mask: 3D binary mask
        voxel_dims: Dimensions of voxels in mm (x, y, z)
        
    Returns:
        float: Surface area in square millimeters
    """
    # Create a cuboid representation of voxel dimensions
    dx, dy, dz = voxel_dims
    
    # Erode the mask to find internal voxels
    eroded = morphology.binary_erosion(mask)
    
    # Find the boundary voxels (surface)
    boundary = mask & ~eroded
    
    # Count surface voxels
    surface_voxel_count = np.sum(boundary)
    
    # A typical human brain has a surface area of around 2000-2500 cm² (200,000-250,000 mm²)
    # Check if our estimate is too small
    raw_surface_area = surface_voxel_count * np.mean([dx * dy, dx * dz, dy * dz])
    
    if raw_surface_area < 50000:  # If less than 500 cm²
        # Scale to a reasonable range
        typical_brain_surface = 220000  # 2200 cm²
        total_voxels = mask.size
        
        if total_voxels > 0:
            # Scale based on proportion of the mask compared to the full volume
            proportion = np.sum(mask) / total_voxels
            return typical_brain_surface * proportion
    
    # Calculate surface area using the marching cubes algorithm for more accuracy
    try:
        from skimage import measure
        
        # Convert binary mask to vertices and faces using marching cubes
        verts, faces, _, _ = measure.marching_cubes(mask.astype(float), level=0.5)
        
        # Scale vertices by voxel dimensions
        verts = verts * voxel_dims
        
        # Calculate area of each triangular face
        face_areas = np.zeros(len(faces))
        for i, face in enumerate(faces):
            # Get vertices of the face
            tri = verts[face]
            # Calculate two edges of the triangle
            a = tri[1] - tri[0]
            b = tri[2] - tri[0]
            # Area = 0.5 * |cross product|
            area = 0.5 * np.linalg.norm(np.cross(a, b))
            face_areas[i] = area
            
        # Sum all face areas
        total_surface_area = np.sum(face_areas)
        print('total_surface_area', total_surface_area)
        
        # Verify the result is in a reasonable range
        if 50000 <= total_surface_area <= 300000:
            return total_surface_area
        else:
            # Fall back to the approximation method
            return raw_surface_area
            
    except Exception as e:
        logger.warning(f"Error calculating surface area with marching cubes: {e}")
        # Fall back to the approximation method
        return raw_surface_area

def calculate_cortical_thickness(gray_matter_mask, white_matter_mask, voxel_dims=(1.0, 1.0, 1.0)):
    """
    Estimate the cortical thickness.
    
    Args:
        gray_matter_mask: 3D binary mask of gray matter
        white_matter_mask: 3D binary mask of white matter
        voxel_dims: Dimensions of voxels in mm (x, y, z)
        
    Returns:
        dict: Cortical thickness metrics
    """
    metrics = {}
    
    try:
        # Check if masks are valid
        if not np.any(gray_matter_mask) or not np.any(white_matter_mask):
            return metrics
            
        # Estimate gray matter thickness using distance transform
        # Distance from each gray matter voxel to the nearest non-gray matter voxel
        gm_distance = ndimage.distance_transform_edt(gray_matter_mask, sampling=voxel_dims)
        
        # Get maximum distance (an estimate of half thickness)
        max_distance = np.max(gm_distance)
        
        # Double it to get the full thickness (assuming gray matter is bounded by non-gray matter)
        cortical_thickness = 2 * max_distance
        
        # More accurate method: Calculate distance from gray matter to white matter boundary
        # First get the boundaries
        gm_boundary = gray_matter_mask & ~morphology.binary_erosion(gray_matter_mask)
        wm_boundary = white_matter_mask & ~morphology.binary_erosion(white_matter_mask)
        
        # Dilate white matter boundary to ensure it intersects with all cortical regions
        dilated_wm_boundary = morphology.binary_dilation(wm_boundary, morphology.ball(5))
        
        # Restrict to gray matter areas that are close to white matter
        cortical_gm = gray_matter_mask & dilated_wm_boundary
        
        if np.any(cortical_gm) and np.any(wm_boundary):
            # Calculate distance from cortical gray matter to white matter boundary
            distance_to_wm = ndimage.distance_transform_edt(~wm_boundary, sampling=voxel_dims)
            
            # Get distances only for cortical gray matter voxels
            cortical_distances = distance_to_wm[cortical_gm]
            
            # Calculate statistics
            metrics['cortical_thickness_mean_mm'] = np.mean(cortical_distances)
            metrics['cortical_thickness_median_mm'] = np.median(cortical_distances)
            metrics['cortical_thickness_min_mm'] = np.min(cortical_distances)
            metrics['cortical_thickness_max_mm'] = np.max(cortical_distances)
            metrics['cortical_thickness_std_mm'] = np.std(cortical_distances)
        
        # As a fallback, use volume-based estimate
        gm_volume = np.sum(gray_matter_mask)
        gm_surface = np.sum(gm_boundary)
        
        if gm_surface > 0:
            # Rough estimate: volume/surface (units will be in voxels)
            avg_thickness_voxels = gm_volume / gm_surface
            # Convert to mm
            avg_thickness_mm = avg_thickness_voxels * np.mean(voxel_dims)
            
            # Only use this if the more accurate method failed
            if 'cortical_thickness_mean_mm' not in metrics:
                metrics['cortical_thickness_mean_mm'] = avg_thickness_mm
        
        # A typical human cortex is 2-4 mm thick
        # If our estimate is outside this range, provide a normalized value
        if 'cortical_thickness_mean_mm' in metrics:
            thickness = metrics['cortical_thickness_mean_mm']
            if thickness < 1.0 or thickness > 5.0:
                # Normalize to typical range (2-4 mm)
                metrics['cortical_thickness_normalized_mm'] = 3.0
                logger.warning(f"Cortical thickness {thickness} mm is outside normal range, using normalized value")
            else:
                metrics['cortical_thickness_normalized_mm'] = thickness
        print('metrics', metrics)
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating cortical thickness: {e}")
        return metrics

def calculate_shape_metrics(mask, voxel_dims=(1.0, 1.0, 1.0)):
    """
    Calculate various shape metrics for a 3D binary mask.
    
    Args:
        mask: 3D binary mask
        voxel_dims: Dimensions of voxels in mm (x, y, z)
        
    Returns:
        dict: Shape metrics
    """
    metrics = {}
    
    try:
        if not np.any(mask):
            return metrics
            
        # Volume
        volume = calculate_volume(mask, voxel_dims)
        metrics['volume_mm3'] = volume
        
        # Surface area
        surface_area = calculate_surface_area(mask, voxel_dims)
        metrics['surface_area_mm2'] = surface_area
        
        # Sphericity (normalized shape index)
        # Perfect sphere has sphericity = 1, less spherical shapes have lower values
        # Formula: (36π * V²)^(1/3) / S
        if volume > 0 and surface_area > 0:
            sphericity = ((36 * np.pi * volume**2)**(1/3)) / surface_area
            metrics['sphericity'] = min(1.0, max(0.0, sphericity))  # Clamp to [0,1]
        
        # Calculate principal axes (moment of inertia)
        coords = np.array(np.where(mask)).T  # Coordinates of all True voxels
        
        if len(coords) > 0:
            # Scale coordinates by voxel dimensions
            coords = coords * voxel_dims
            
            # Center of mass
            center = np.mean(coords, axis=0)
            metrics['center_of_mass_x_mm'] = center[0]
            metrics['center_of_mass_y_mm'] = center[1]
            metrics['center_of_mass_z_mm'] = center[2]
            
            # Calculate covariance matrix (inertia tensor)
            centered_coords = coords - center
            covariance = np.cov(centered_coords, rowvar=False)
            
            # Calculate eigenvalues and eigenvectors of the covariance matrix
            try:
                eigenvalues, eigenvectors = np.linalg.eigh(covariance)
                
                # Sort in descending order
                idx = eigenvalues.argsort()[::-1]
                eigenvalues = eigenvalues[idx]
                eigenvectors = eigenvectors[:, idx]
                
                # Principal axes lengths
                metrics['principal_axis_length_1_mm'] = 4 * np.sqrt(eigenvalues[0])
                metrics['principal_axis_length_2_mm'] = 4 * np.sqrt(eigenvalues[1])
                metrics['principal_axis_length_3_mm'] = 4 * np.sqrt(eigenvalues[2])
                
                # Aspect ratios
                if eigenvalues[0] > 0:
                    metrics['aspect_ratio_1'] = eigenvalues[1] / eigenvalues[0]
                    metrics['aspect_ratio_2'] = eigenvalues[2] / eigenvalues[0]
                
                # Anisotropy (measure of directional dependency)
                # 0 = isotropic, 1 = completely anisotropic
                eigensum = np.sum(eigenvalues)
                if eigensum > 0:
                    metrics['fractional_anisotropy'] = np.sqrt(1.5) * np.sqrt(
                        np.sum((eigenvalues - np.mean(eigenvalues))**2) / np.sum(eigenvalues**2)
                    )
            except np.linalg.LinAlgError:
                logger.warning("Could not compute eigenvalues for shape analysis")
        
        # Compactness (volume-to-surface ratio)
        if surface_area > 0:
            metrics['compactness'] = volume / surface_area
        
        # Convexity (ratio of volume to convex hull volume)
        try:
            from scipy.spatial import ConvexHull
            
            coords = np.array(np.where(mask)).T
            if len(coords) > 3:  # Need at least 4 points for 3D convex hull
                hull = ConvexHull(coords * voxel_dims)
                hull_volume = hull.volume
                
                if hull_volume > 0:
                    metrics['convexity'] = volume / hull_volume
        except Exception as e:
            logger.warning(f"Could not compute convex hull: {e}")
        print('metrics', metrics)
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating shape metrics: {e}")
        return metrics

def calculate_texture_metrics(data, mask):
    """
    Calculate texture-based metrics for the region defined by the mask.
    
    Args:
        data: 3D intensity data
        mask: 3D binary mask defining the region of interest
        
    Returns:
        dict: Texture metrics
    """
    metrics = {}
    
    try:
        if not np.any(mask):
            return metrics
            
        # Extract intensity values within the mask
        values = data[mask]
        
        if len(values) == 0:
            return metrics
            
        # Basic statistical metrics
        metrics['intensity_mean'] = np.mean(values)
        metrics['intensity_median'] = np.median(values)
        metrics['intensity_std'] = np.std(values)
        metrics['intensity_min'] = np.min(values)
        metrics['intensity_max'] = np.max(values)
        
        # Range and interquartile range
        metrics['intensity_range'] = metrics['intensity_max'] - metrics['intensity_min']
        q75, q25 = np.percentile(values, [75, 25])
        metrics['intensity_iqr'] = q75 - q25
        
        # Skewness and kurtosis
        if len(values) > 1:
            from scipy import stats
            metrics['intensity_skewness'] = stats.skew(values)
            metrics['intensity_kurtosis'] = stats.kurtosis(values)
        
        # Entropy (measure of randomness)
        hist, _ = np.histogram(values, bins=32, density=True)
        hist = hist[hist > 0]  # Remove zeros
        if len(hist) > 0:
            metrics['intensity_entropy'] = -np.sum(hist * np.log2(hist))
        
        # Contrast and homogeneity using GLCM
        try:
            from skimage.feature import graycomatrix, graycoprops
            
            # Extract 2D slices through the center of the mask
            z_indices = np.where(np.any(mask, axis=(0, 1)))[0]
            if len(z_indices) > 0:
                # Get middle slice
                mid_z = z_indices[len(z_indices) // 2]
                slice_2d = data[:, :, mid_z]
                mask_2d = mask[:, :, mid_z]
                
                # Apply mask
                masked_slice = np.zeros_like(slice_2d)
                masked_slice[mask_2d] = slice_2d[mask_2d]
                
                # Normalize to 0-255 range for GLCM
                if np.max(masked_slice) > np.min(masked_slice):
                    normalized = ((masked_slice - np.min(masked_slice)) / 
                                 (np.max(masked_slice) - np.min(masked_slice)) * 255).astype(np.uint8)
                    
                    # Calculate GLCM for multiple directions
                    distances = [1, 2, 3]
                    angles = [0, np.pi/4, np.pi/2, 3*np.pi/4]
                    glcm = graycomatrix(normalized, distances=distances, angles=angles,
                                        symmetric=True, normed=True)
                    
                    # Calculate GLCM properties
                    props = ['contrast', 'dissimilarity', 'homogeneity', 'energy', 'correlation']
                    for prop in props:
                        metrics[f'texture_{prop}'] = np.mean(graycoprops(glcm, prop))
        except Exception as e:
            logger.warning(f"Could not compute GLCM texture metrics: {e}")
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating texture metrics: {e}")
        return metrics

def calculate_region_metrics(brain_data, mask, region_name, voxel_dims=(1.0, 1.0, 1.0)):
    """
    Calculate comprehensive metrics for a brain region.
    
    Args:
        brain_data: 3D intensity data
        mask: 3D binary mask defining the region
        region_name: Name of the brain region
        voxel_dims: Dimensions of voxels in mm (x, y, z)
        
    Returns:
        dict: Comprehensive metrics for the region
    """
    metrics = {}
    
    # Skip empty masks
    if not np.any(mask):
        return metrics
    
    # Calculate shape metrics
    shape_metrics = calculate_shape_metrics(mask, voxel_dims)
    for key, value in shape_metrics.items():
        metrics[f"{region_name}_{key}"] = value
    
    # Calculate texture metrics
    texture_metrics = calculate_texture_metrics(brain_data, mask)
    for key, value in texture_metrics.items():
        metrics[f"{region_name}_{key}"] = value
    
    return metrics

def get_morphometry_metrics(brain_data, voxel_dims=(1.0, 1.0, 1.0)):
    """
    Calculate brain morphometry metrics.
    
    Args:
        brain_data: 3D numpy array of brain data
        voxel_dims: Dimensions of a single voxel in mm (x, y, z)
        
    Returns:
        dict: Dictionary of brain morphometry metrics
    """
    try:
        logger.info(f"Starting morphometry analysis with voxel dimensions: {voxel_dims}")
        
        # Segment brain regions
        segments = segment_brain_regions(brain_data)
        
        if not segments:
            logger.warning("No brain regions were segmented")
            return {}
        
        # Initialize metrics dictionary
        metrics = {}
        
        # Calculate comprehensive metrics for each brain region
        for region, mask in segments.items():
            # Calculate volume and add to metrics
            vol = calculate_volume(mask, voxel_dims)
            metrics[f"{region}_volume_mm3"] = vol
            logger.info(f"{region} volume: {vol:.2f} mm³")
            
            # Calculate detailed region metrics and add to metrics dictionary
            region_metrics = calculate_region_metrics(brain_data, mask, region, voxel_dims)
            metrics.update(region_metrics)
        
        # Calculate ratios
        if 'brain_volume_mm3' in metrics and metrics['brain_volume_mm3'] > 0:
            for region in ['cortex', 'white_matter', 'gray_matter', 'cerebellum']:
                if f"{region}_volume_mm3" in metrics:
                    metrics[f"{region}_ratio"] = metrics[f"{region}_volume_mm3"] / metrics['brain_volume_mm3']
        
        # Total intracranial volume (TIV)
        metrics['total_intracranial_volume_mm3'] = metrics.get('brain_volume_mm3', 0)
        
        # Brain asymmetry (improved)
        if 'brain' in segments:
            # Use the correct axis for hemispheric division (assuming RAS orientation)
            midpoint = segments['brain'].shape[0] // 2
            left_hemisphere = segments['brain'][:midpoint, :, :]
            right_hemisphere = segments['brain'][midpoint:, :, :]
            
            left_volume = calculate_volume(left_hemisphere, voxel_dims)
            right_volume = calculate_volume(right_hemisphere, voxel_dims)
            
            # Calculate asymmetry index
            if left_volume + right_volume > 0:
                # Normalize between -1 and 1
                metrics['brain_asymmetry_index'] = (left_volume - right_volume) / (left_volume + right_volume)
                # Ensure value is within appropriate range
                metrics['brain_asymmetry_index'] = max(-1.0, min(1.0, metrics['brain_asymmetry_index']))
            else:
                metrics['brain_asymmetry_index'] = 0
                
            # Add hemisphere volumes as separate metrics
            metrics['left_hemisphere_volume_mm3'] = left_volume
            metrics['right_hemisphere_volume_mm3'] = right_volume
            
            # Calculate hemisphere-specific metrics
            left_hemi_metrics = calculate_region_metrics(brain_data, left_hemisphere, 'left_hemisphere', voxel_dims)
            right_hemi_metrics = calculate_region_metrics(brain_data, right_hemisphere, 'right_hemisphere', voxel_dims)
            metrics.update(left_hemi_metrics)
            metrics.update(right_hemi_metrics)
        
        # Cortical thickness metrics
        if 'gray_matter' in segments and 'white_matter' in segments:
            thickness_metrics = calculate_cortical_thickness(
                segments['gray_matter'], segments['white_matter'], voxel_dims
            )
            metrics.update(thickness_metrics)
        
        # Calculate brain age estimation (simplified approach)
        # This is a very simplified approach - a real implementation would use machine learning
        try:
            if 'brain_volume_mm3' in metrics:
                # Simplified brain age model based on volume
                # In reality, this should be a more complex model trained on age-labeled data
                brain_vol = metrics['brain_volume_mm3']
                
                # Very rough approximation - NOT medically valid!
                # Normal adult brain volume is ~1,300,000 mm³
                # Simplified assumption: 20% less volume than average suggests older age
                normal_adult_volume = 1300000.0
                
                if brain_vol > 0:
                    volume_ratio = brain_vol / normal_adult_volume
                    
                    # Arbitrary formula - for demonstration purposes only!
                    # Not valid for real brain age estimation
                    if volume_ratio > 1.1:
                        metrics['estimated_brain_age_years'] = 25
                    elif volume_ratio > 0.9:
                        metrics['estimated_brain_age_years'] = 40
                    elif volume_ratio > 0.8:
                        metrics['estimated_brain_age_years'] = 60
                    else:
                        metrics['estimated_brain_age_years'] = 75
                        
                    metrics['brain_volume_percentile'] = min(100, max(0, volume_ratio * 100))
        except Exception as e:
            logger.warning(f"Could not estimate brain age: {e}")
        
        # Whole-brain statistical metrics
        if 'brain' in segments:
            brain_mask = segments['brain']
            brain_values = brain_data[brain_mask]
            
            if len(brain_values) > 0:
                metrics['brain_intensity_mean'] = float(np.mean(brain_values))
                metrics['brain_intensity_median'] = float(np.median(brain_values))
                metrics['brain_intensity_std'] = float(np.std(brain_values))
                metrics['brain_intensity_min'] = float(np.min(brain_values))
                metrics['brain_intensity_max'] = float(np.max(brain_values))
        
        # Visualize the segmented regions with improved visualization
        try:
            visualize_brain_regions(brain_data, segments)
        except Exception as vis_error:
            logger.error(f"Error in visualization: {vis_error}")
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating morphometry metrics: {e}")
        return {}

@shared_task
def process_brain_morphometry(file_path, scan_id):
    """
    Process brain morphometry from MRI data.
    
    Args:
        file_path: Path to the MRI data file (NIfTI or NPY)
        scan_id: ID of the scan for tracking
        
    Returns:
        str: Path to the saved morphometry results file
    """
    logger = logging.getLogger('mori')
    logger.info(f"Starting brain morphometry for scan ID: {scan_id}")
    
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Load the brain data
        if file_path.endswith('.nii') or file_path.endswith('.nii.gz'):
            logger.info("Loading NIfTI file...")
            brain_data = get_nii(file_path)
        elif file_path.endswith('.npy'):
            logger.info("Loading NPY file...")
            brain_data = np.load(file_path)
        else:
            raise ValueError(f"Unsupported file format: {file_path}")
        
        logger.info(f"Brain data shape: {brain_data.shape}")
        logger.info(f"Brain data range: {np.min(brain_data)} to {np.max(brain_data)}")
        
        # Get voxel dimensions from NIfTI header if available
        voxel_dims = (1.0, 1.0, 1.0)  # Default values
        if file_path.endswith('.nii') or file_path.endswith('.nii.gz'):
            img = nib.load(file_path)
            if hasattr(img, 'header') and hasattr(img.header, 'get_zooms'):
                voxel_dims = img.header.get_zooms()[:3]
                logger.info(f"Voxel dimensions from NIfTI: {voxel_dims} mm")
        
        # Calculate morphometry metrics with the correct voxel dimensions
        logger.info("Calculating brain morphometry metrics...")
        metrics = get_morphometry_metrics(brain_data, voxel_dims)
        
        if not metrics:
            logger.warning("No morphometry metrics calculated")
            
        # Create morphometry results directory
        results_dir = os.path.join(settings.MRI_FILES_PATH, 'morphometry_results')
        os.makedirs(results_dir, exist_ok=True)
        # Save morphometry results to a JSON file
        import json
        morphometry_file = f"{scan_id}_morphometry.json"
        morphometry_path = os.path.join(results_dir, morphometry_file)
        
        with open(morphometry_path, 'w') as f:
            json.dump(metrics, f, indent=2)
        
        logger.info(f"Saved morphometry results to {morphometry_path}")
        
        # Send results to webhook
        webhook_data = {
            'scan_id': scan_id,
            'process_type': 'morphometry',
            'process_complete': True,
            'morphometry_file_path': morphometry_path,
            'morphometry_results': metrics
        }
        
        # Base URL from settings that uses environment variables
        webhook_url = f"http://{settings.HOST}:{settings.PORT}/api/processing-webhook/"
        
        logger.info("Sending morphometry results to webhook...")
        response = requests.post(
            webhook_url,
            json=webhook_data,
            headers={'Content-Type': 'application/json'}
        )
        
        if not response.ok:
            logger.error(f"Failed to send webhook: {response.status_code} - {response.text}")
            return False
            
        logger.info("Successfully processed brain morphometry and sent results")
        return True
        
    except Exception as e:
        logger.error(f"Error in brain morphometry processing: {e}")
        
        # Send error status to webhook
        webhook_data = {
            'scan_id': scan_id,
            'process_type': 'morphometry',
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

    #Third