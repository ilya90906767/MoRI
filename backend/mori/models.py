from django.db import models
from datetime import datetime
from django.contrib.auth import get_user_model
from django.db.models import JSONField

User = get_user_model()
 
class MRIScan(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='mri_scans')
    uid = models.CharField(max_length=100, unique=True)
    file_name = models.CharField(max_length=255)
    original_file_name = models.CharField(max_length=255)
    organ = models.CharField(max_length=100)
    scan_date = models.DateField(default=datetime.now().date())  # Date when the scan was taken
    file_path = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    processing_complete = models.BooleanField(default=False)
    
    # File paths instead of storing data directly
    segmentation_file_path = models.CharField(max_length=500, null=True, blank=True)
    output_file_path = models.CharField(max_length=500, null=True, blank=True)

    # Alzheimer's prediction related fields
    alzheimer_prediction = models.CharField(max_length=100, null=True, blank=True)
    prediction_complete = models.BooleanField(default=False)
    
    # Brain morphometry related fields
    morphometry_complete = models.BooleanField(default=False)
    morphometry_file_path = models.CharField(max_length=500, null=True, blank=True)
    morphometry_results = JSONField(null=True, blank=True)
    morphometry_status = models.CharField(max_length=100, default="None")
    
    def __str__(self):
        return f"{self.organ} scan - {self.original_file_name} ({self.scan_date})"