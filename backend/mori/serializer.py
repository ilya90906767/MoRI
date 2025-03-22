from rest_framework import serializers
from .models import MRI

class MRISerializer(serializers.ModelSerializer):
    class Meta:
        model = MRI
        fields = '__all__'
