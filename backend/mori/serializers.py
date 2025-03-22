from rest_framework import serializers
from .models import MRIScan

class MRIScanSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    
    class Meta:
        model = MRIScan
        fields = [
            'id', 'uid', 'username', 'file_name', 'original_file_name', 'organ', 
            'scan_date', 'file_path', 'created_at', 'updated_at',
            'processing_complete', 'segmentation_file_path', 
            'output_file_path', 'alzheimer_prediction', 
            'prediction_complete', 'morphometry_complete', 
            'morphometry_file_path', 'morphometry_results'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_username(self, obj):
        return obj.user.username if obj.user else None 