import os
import json
import logging
import numpy as np
from datetime import datetime
from django.conf import settings
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from .models import MRIScan
from .serializers import MRIScanDetailSerializer, MRIScanSerializer
from .nii_pipeline import process_mri_data
from .alzheimer import predict_alzheimer
from .morphometry import process_brain_morphometry
from django.http import StreamingHttpResponse, Http404, HttpResponse

logger = logging.getLogger(__name__)

def get_file_extension(filename):
    """Get the correct file extension, with special handling for .nii.gz files."""
    if filename.lower().endswith('.nii.gz'):
        return 'nii.gz'
    return filename.split('.')[-1].lower()

def save_data_to_file(data, base_path, uid, data_type):
    """Save data to a file and return the file path."""
    filename = f"{uid}_{data_type}.npz"
    file_path = os.path.join(base_path, filename)
    
    try:
        # Convert data to numpy array and save with compression
        np.savez_compressed(file_path, data=data)
        return file_path
    except Exception as e:
        logger.error(f"Failed to save {data_type} data: {e}")
        return None

class LoadMRI(APIView):
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        """Upload file with metadata without immediate processing"""
        try:
            # Get the authenticated user
            user = request.user
            
            # Get the uploaded file
            file = request.FILES.get('file')
            if not file:
                return Response(
                    {'error': 'No file provided'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Validate file extension
            extension = get_file_extension(file.name)
            allowed_extensions = ['nii.gz', 'dcm', 'jpg', 'jpeg', 'png', 'pdf']
            if extension not in allowed_extensions:
                return Response({
                    'error': f'Invalid file type. Allowed types are: {", ".join(allowed_extensions)}'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Get metadata from the request
            try:
                metadata = json.loads(request.POST.get('metadata', '{}'))
                logger.info(f"Received metadata: {metadata}")

                # Validate required metadata fields
                required_fields = ['date', 'organ']
                missing_fields = [field for field in required_fields if not metadata.get(field)]
                if missing_fields:
                    return Response({
                        'error': f'Missing required metadata: {", ".join(missing_fields)}'
                    }, status=status.HTTP_400_BAD_REQUEST)

                # Parse and validate date
                try:
                    scan_date = datetime.strptime(metadata['date'], '%Y-%m-%d').date()
                except ValueError:
                    return Response({
                        'error': 'Invalid date format. Use YYYY-MM-DD'
                    }, status=status.HTTP_400_BAD_REQUEST)

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse metadata: {e}")
                return Response(
                    {'error': 'Invalid metadata format'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Generate unique filename
            file_uid = datetime.now().strftime('%Y%m%d_%H%M%S')
            file_extension = get_file_extension(file.name)
            new_filename = f"{file_uid}.{file_extension}"
            
            # Create the mri_files directory if it doesn't exist
            try:
                mri_files_path = settings.MRI_FILES_PATH
                os.makedirs(mri_files_path, exist_ok=True)
                logger.info(f"Ensuring directory exists: {mri_files_path}")
            except Exception as e:
                logger.error(f"Failed to create directory: {e}")
                return Response(
                    {'error': 'Failed to create storage directory'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Save the file
            try:
                file_path = os.path.join(mri_files_path, new_filename)
                logger.info(f"Saving file to: {file_path}")
                with open(file_path, 'wb+') as destination:
                    for chunk in file.chunks():
                        destination.write(chunk)
            except Exception as e:
                logger.error(f"Failed to save file: {e}")
                return Response(
                    {'error': 'Failed to save file'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Create MRIScan record
            try:
                mri_scan = MRIScan.objects.create(
                    user=user,  # Associate with authenticated user
                    uid=file_uid,
                    file_name=new_filename,
                    original_file_name=file.name,
                    organ=metadata['organ'],
                    scan_date=scan_date,
                    file_path=file_path
                )
                logger.info(f"Created MRIScan record with ID: {mri_scan.id}")
            except Exception as e:
                logger.error(f"Failed to create MRIScan record: {e}")
                # Clean up the saved file
                if os.path.exists(file_path):
                    os.remove(file_path)
                return Response(
                    {'error': 'Failed to create database record'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Serialize and return the response
            serializer = MRIScanSerializer(mri_scan)
            return Response({
                'success': True,
                'message': f"Successfully uploaded {metadata['organ']} scan.",
                'data': serializer.data
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Unexpected error in AnalyzeMRIView: {e}")
            return Response({
                    'success': False,
                    'message': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def get(self, request, *args, **kwargs):
        """Get all MRI scans for the file panel or a specific scan by ID."""
        try:
            # Get the authenticated user
            user = request.user
            
            # If scan_id is provided in kwargs, return that specific scan
            scan_id = kwargs.get('scan_id')
            if scan_id:
                try:
                    # Filter by both ID and user
                    scan = MRIScan.objects.get(id=scan_id, user=user)
                    serializer = MRIScanSerializer(scan)
                    return Response({
                        'success': True,
                        'data': serializer.data
                    })
                except MRIScan.DoesNotExist:
                    return Response({
                        'success': False,
                        'message': f'MRI scan with ID {scan_id} not found'
                    }, status=status.HTTP_404_NOT_FOUND)
            
            # Otherwise, return all scans for this user
            scans = MRIScan.objects.filter(user=user).order_by('-created_at')
            serializer = MRIScanSerializer(scans, many=True)
            return Response({
                'success': True,
                'data': serializer.data
            })
        except Exception as e:
            logger.error(f"Failed to fetch MRI scans: {e}")
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ProcessMRIView(APIView):
    """Endpoint to start processing a previously uploaded MRI scan"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request, scan_id, *args, **kwargs):
        try:
            # Get the authenticated user
            user = request.user
            
            # Get the scan and verify it belongs to the user
            mri_scan = MRIScan.objects.get(id=scan_id, user=user)
            
            if not os.path.exists(mri_scan.file_path):
                return Response({
                    'error': 'Original file not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Start processing
            try:
                process_mri_data(mri_scan.file_path, mri_scan.id)
                logger.info(f"Started processing MRI data for scan ID: {mri_scan.id}")
            except Exception as e:
                logger.error(f"Failed to start processing: {e}")
                return Response({
                    'error': 'Failed to start processing'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            return Response({
                'success': True,
                'message': 'Processing started successfully',
                'data': MRIScanSerializer(mri_scan).data
            })
            
        except MRIScan.DoesNotExist:
            return Response({
                'error': 'MRI scan not found or access denied'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in ProcessMRIView: {e}")
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class AlzheimerPredictionView(APIView):
    """Endpoint to start Alzheimer's prediction analysis"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request, scan_id, *args, **kwargs):
        try:
            # Get the authenticated user
            user = request.user
            
            # Get the scan and verify it belongs to the user
            mri_scan = MRIScan.objects.get(id=scan_id, user=user)
            
            if not os.path.exists(mri_scan.file_path):
                return Response({
                    'error': 'Original file not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Start Alzheimer's prediction
            try:
                # Check if Celery is available, otherwise run synchronously
                try:
                    # Try to run as Celery task
                    predict_alzheimer(mri_scan.file_path, mri_scan.id)
    
                except ConnectionError as ce:
                    # If Celery isn't running, execute the function directly
                    logger.warning(f"Celery connection failed, running prediction synchronously: {ce}")
            except Exception as e:
                logger.error(f"Failed to start Alzheimer's prediction: {e}")
                return Response({
                    'error': f'Failed to start prediction: {str(e)}'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            return Response({
                'success': True,
                'message': 'Alzheimer prediction started successfully',
                'data': MRIScanSerializer(mri_scan).data
            })
            
        except MRIScan.DoesNotExist:
            return Response({
                'error': 'MRI scan not found or access denied'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in AlzheimerPredictionView: {e}")
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
class MorphometryAnalysisView(APIView):
    """Endpoint to start brain morphometry analysis"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request, scan_id, *args, **kwargs):
        try:
            # Get the authenticated user
            user = request.user
            
            # Get the MRIScan instance
            try:
                scan = MRIScan.objects.get(id=scan_id, user=user)
            except MRIScan.DoesNotExist:
                return Response(
                    {"error": "MRI scan not found or access denied"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Check if segmentation has been completed
            if not scan.processing_complete:
                return Response(
                    {"error": "MRI segmentation must be completed before morphometry analysis"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Determine which file to use for morphometry (use segmentation if available, otherwise use original)
            if scan.segmentation_file_path and os.path.exists(scan.segmentation_file_path):
                file_path = scan.segmentation_file_path
            elif scan.output_file_path and os.path.exists(scan.output_file_path):
                file_path = scan.output_file_path
            else:
                file_path = scan.file_path

            if not os.path.exists(file_path):
                return Response(
                    {"error": "Required scan file not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
                
            # Start the brain morphometry analysis
            logger.info(f"Starting brain morphometry analysis for scan ID: {scan_id}")
            try:
                scan.morphometry_status = "Processing"
                scan.save()
                success = process_brain_morphometry(file_path, scan_id)
                if not success:
                    return Response(
                        {"error": "Failed to complete morphometry analysis"},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )
            except ConnectionError as ce:
                logger.error(f"Connection error during morphometry: {ce}")
                return Response(
                    {"error": "Service connection failed"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )
            except Exception as e:
                logger.error(f"Error during morphometry processing: {e}")
                return Response(
                    {"error": str(e)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            return Response(
                {"message": "Brain morphometry analysis completed successfully"},
                status=status.HTTP_200_OK
            )
            
        except Exception as e:
            logger.error(f"Error starting brain morphometry: {e}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class MorphometryStatusView(APIView):
    """Endpoint to get a specific MRI scan by ID"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, scan_id, *args, **kwargs):
        try: 
            user = request.user
            scan = MRIScan.objects.get(id=scan_id, user=user)
            serializer = MRIScanDetailSerializer(scan)
            return Response({
                "data": serializer.data
            })
        except MRIScan.DoesNotExist:
            return Response(
                {"error": "MRI scan not found or access denied"},
                status=status.HTTP_404_NOT_FOUND
            )


class ProcessingWebhookView(APIView):
    """Unified webhook endpoint for all processing types"""
    
    def post(self, request, *args, **kwargs):
        try:
            data = request.data
            logger.info(f"Received webhook data: {data}")
            
            # Extract data from the webhook
            scan_id = data.get('scan_id')
            process_type = data.get('process_type')
            process_complete = data.get('process_complete', False)
            
            # Validate the required fields
            if not scan_id:
                return Response(
                    {"error": "Missing scan_id in webhook data"},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
            # Get the MRIScan instance
            try:
                scan = MRIScan.objects.get(id=scan_id)
            except MRIScan.DoesNotExist:
                return Response(
                    {"error": f"MRI scan not found with ID: {scan_id}"},
                    status=status.HTTP_404_NOT_FOUND
                )
                
            # Process based on the process type
            if process_type == 'segmentation':
                scan.processing_complete = process_complete
                
                if process_complete:
                    # Update file paths if provided
                    if data.get('segmentation_file_path'):
                        scan.segmentation_file_path = data.get('segmentation_file_path')
                    if data.get('output_file_path'):
                        scan.output_file_path = data.get('output_file_path')
                        
            elif process_type == 'alzheimer':
                scan.prediction_complete = process_complete
                
                if process_complete and 'prediction_result' in data:
                    scan.alzheimer_prediction = data.get('prediction_result')
                    
            elif process_type == 'morphometry':
                scan.morphometry_complete = process_complete
                
                if process_complete:
                    # Update morphometry file path and results if provided
                    if data.get('morphometry_file_path'):
                        scan.morphometry_file_path = data.get('morphometry_file_path')
                    if data.get('morphometry_results'):
                        scan.morphometry_results = data.get('morphometry_results')
                        scan.morphometry_status = "Completed"
            
            # Save the updated scan
            scan.save()
            
            return Response(
                {"message": "Webhook processed successfully"},
                status=status.HTTP_200_OK
            )
                
        except Exception as e:
            logger.error(f"Error processing webhook: {e}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class AnalyzeStatusView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, scan_id, *args, **kwargs):
        try:
            # Get the authenticated user
            user = request.user
            
            # Get the MRIScan instance
            try:
                scan = MRIScan.objects.get(id=scan_id, user=user)
            except MRIScan.DoesNotExist:
                return Response(
                    {"error": "MRI scan not found or access denied"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Return the status
            status_response = {
                "scan_id": scan.id,
                "uid": scan.uid,
                "processing_complete": scan.processing_complete,
                "prediction_complete": scan.prediction_complete,
                "morphometry_complete": scan.morphometry_complete
            }
            
            # Include results if available
            if scan.alzheimer_prediction:
                status_response["alzheimer_prediction"] = scan.alzheimer_prediction
                
            if scan.morphometry_results:
                status_response["morphometry_results"] = scan.morphometry_results
                
            return Response(status_response)
            
        except Exception as e:
            logger.error(f"Error getting analysis status: {e}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class MorphometryDataView(APIView):
    """Dedicated endpoint to fetch morphometry data for a specific scan"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, scan_id, *args, **kwargs):
        try:
            # Get the authenticated user
            user = request.user
            
            # Get the MRIScan instance
            try:
                scan = MRIScan.objects.get(id=scan_id, user=user)
            except MRIScan.DoesNotExist:
                return Response(
                    {"error": "MRI scan not found or access denied"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Check if morphometry data exists
            if not scan.morphometry_results:
                # Check if morphometry is in progress
                if scan.morphometry_complete is False and scan.morphometry_status == "Processing":
                    return Response({
                        "status": "in_progress",
                        "message": "Morphometry analysis is still in progress"
                    }, status=status.HTTP_202_ACCEPTED)
                # No morphometry has been started
                return Response({
                    "status": "not_started",
                    "message": "No morphometry data available for this scan"
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Return the morphometry data
            return Response({
                "status": "success",
                "scan_id": scan.id,
                "uid": scan.uid,
                "morphometry_complete": scan.morphometry_complete,
                "morphometry_data": scan.morphometry_results
            })
            
        except Exception as e:
            logger.error(f"Error fetching morphometry data: {e}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class ResultsView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, scan_id, result_type, start_slice, *args, **kwargs):
        try:
            # Get the authenticated user
            user = request.user
            
            logger.info(f"Fetching results for scan_id: {scan_id}, type: {result_type}")
            
            # Default slice count to 1 since frontend requests single slices
            slice_count = 1
            
            try:
                start_slice = int(start_slice)
                logger.info(f"Requested slice: {start_slice}")
            except ValueError:
                return Response({
                    'error': 'Invalid slice parameter'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the scan and verify it belongs to the user
            mri_scan = MRIScan.objects.get(id=scan_id, user=user)
            
            # Get the appropriate file path based on result type
            if result_type == 'segmentation':
                file_path = mri_scan.segmentation_file_path
            elif result_type == 'output':
                file_path = mri_scan.output_file_path
            else:
                logger.error(f"Invalid result type: {result_type}")
                return Response({
                    'error': 'Invalid result type'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            logger.info(f"Looking for file at path: {file_path}")
            if not file_path or not os.path.exists(file_path):
                logger.error(f"File not found at path: {file_path}")
                return Response({
                    'error': 'Result file not found'
                }, status=status.HTTP_404_NOT_FOUND)
            try:
                # Load the NPY file
                data = np.load(file_path)
                logger.info(f"Loaded data from file with shape: {data.shape}")
                
                # Handle 4D data by taking first channel if needed
                if len(data.shape) == 4:
                    min_dim = min(data.shape)
                    min_axis = data.shape.index(min_dim)
                    if min_axis == 0:
                        # If minimum dimension is channels, take first channel
                        data = data[0]
                    else:
                        # Move minimum axis to front and take first slice
                        data = np.moveaxis(data, min_axis, 0)[0]
                
                # Now data should be 3D
                slices, height, width = data.shape
                logger.info(f"Working with 3D data of shape: {slices}x{height}x{width}")
                
                # Validate slice range
                if start_slice < 0 or start_slice >= slices:
                    return Response({
                        'error': 'Invalid start_slice parameter'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                # Adjust slice_count if it would exceed available slices
                end_slice = min(start_slice + slice_count, slices)
                actual_slices = data[start_slice:end_slice]
                
                # Create response data structure
                response_data = {
                    'success': True,
                    'data': {
                        'shape': actual_slices.shape,
                        'dtype': str(data.dtype),
                        'data': {str(i): actual_slices[i].tolist() 
                                for i in range(len(actual_slices))},
                        'total_slices': slices,
                        'start_slice': start_slice,
                        'end_slice': end_slice
                    }
                }
                
                logger.info(f"Sending slices {start_slice} to {end_slice} of total {slices} slices")
                return Response(response_data)
                
            except Exception as e:
                logger.error(f"Error loading file {file_path}: {str(e)}")
                return Response({
                    'error': 'Failed to load result file',
                    'detail': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except MRIScan.DoesNotExist:
            logger.error(f"MRI scan not found with ID: {scan_id}")
            return Response({
                'error': 'MRI scan not found or access denied'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error serving result file: {str(e)}")
            return Response({
                'error': 'Failed to serve result file',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)