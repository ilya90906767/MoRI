import os
import logging
import requests
from celery import shared_task
import csv
import subprocess
from django.conf import settings


logger = logging.getLogger(__name__)

@shared_task
def predict_alzheimer(file_path, scan_id):
    logger = logging.getLogger('mori')
    logger.info(f"Starting Alzheimer's prediction for scan ID: {scan_id}")
    
    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        input_dir = os.path.join(settings.MRI_FILES_PATH, 'alzheimer_inputs', str(scan_id))
        output_dir = os.path.join(settings.MRI_FILES_PATH, 'results')
        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        input_file = os.path.join(input_dir, os.path.basename(file_path))
        if file_path != input_file:
            subprocess.run(['cp', file_path, input_file], check=True)

        logger.info(f"Prepared input file at: {input_file}")

        docker_container_path = os.path.join(os.path.dirname(__file__), '..', 'SynthBA', 'synthba')
        cmd = [
            docker_container_path,
            input_dir,
            output_dir,
            '-m', 'g',
            '-b', '50',
            '-t', 'T1w_1mm',
        ]

        logger.info(f"Executing command: {' '.join(cmd)}")
        process = subprocess.run(cmd, capture_output=True, text=True)
        
        if process.returncode != 0:
            logger.error(f"Docker command failed: {process.stderr}")
            raise Exception(f"Docker execution failed: {process.stderr}")
            
        logger.info("Docker container execution completed")
        
        predictions_file = os.path.join(output_dir, 'predictions.csv')
        if not os.path.exists(predictions_file):
            raise FileNotFoundError(f"Predictions file not found: {predictions_file}")

        prediction_results = parse_predictions_csv(predictions_file, scan_id, file_path)
        alzheimer_prediction = prediction_results.get('prediction', 'Unknown')
        prediction_confidence = prediction_results.get('confidence', 0.0)

        logger.info(f"Prediction results: {prediction_results}")

        webhook_data = {
            'scan_id': scan_id,
            'process_type': 'alzheimer',
            'process_complete': True,
            'prediction_result': alzheimer_prediction,
            'prediction_confidence': prediction_confidence,
            'results': prediction_results
        }
        
        webhook_url = f"http://{settings.HOST}:{settings.PORT}/api/processing-webhook/"
        logger.info("Sending prediction results to webhook...")
        response = requests.post(
            webhook_url,
            json=webhook_data,
            headers={'Content-Type': 'application/json'}
        )
        
        if not response.ok:
            logger.error(f"Failed to send webhook: {response.status_code} - {response.text}")
            return False
            
        logger.info("Successfully processed Alzheimer's prediction and sent results")
        return True

    except Exception as e:
        logger.error(f"Error in Alzheimer's prediction: {e}")

        webhook_data = {
            'scan_id': scan_id,
            'process_type': 'alzheimer',
            'process_complete': False,
            'error': str(e)
        }
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


def parse_predictions_csv(csv_file, scan_id, file_path):
    try:
        with open(csv_file, 'r') as f:
            csv_reader = csv.DictReader(f)
            for row in csv_reader:
                if 'input_id' in row and os.path.basename(row['input_id']) == os.path.basename(file_path):
                    brain_age = round(float(row['brainage']), 1)
                    return {
                        'prediction': str(brain_age),
                        'confidence': 1.0,
                    }

            logger.warning(f"No matching entry found in predictions.csv for scan_id: {scan_id}")
            return {
                'prediction': 'Unknown',
                'confidence': 0.0,
                'error': 'No matching entry found in predictions CSV'
            }
            
    except Exception as e:
        logger.error(f"Error parsing predictions CSV: {e}")
        return {
            'prediction': 'Error', 
            'confidence': 0.0,
            'error': str(e)
        }