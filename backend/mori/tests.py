from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from datetime import datetime
import json
import os
import tempfile
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch, MagicMock

from .models import MRIScan

User = get_user_model()

class MRIScanAuthorizationTestCase(APITestCase):
    """Test suite for MRIScan API with authorization"""
    
    def setUp(self):
        self.client = APIClient()
        
        # Create test users
        self.user1 = User.objects.create_user(
            username='user1',
            email='user1@example.com',
            password='Password123'
        )
        
        self.user2 = User.objects.create_user(
            username='user2',
            email='user2@example.com',
            password='Password123'
        )
        
        # Create test MRI scans for each user
        self.scan1 = MRIScan.objects.create(
            user=self.user1,
            uid="user1_scan",
            file_name="user1_scan.nii.gz",
            original_file_name="user1_original.nii.gz",
            organ="brain",
            scan_date=datetime.now().date(),
            file_path="/tmp/user1_scan.nii.gz",
            processing_complete=False
        )
        
        self.scan2 = MRIScan.objects.create(
            user=self.user2,
            uid="user2_scan",
            file_name="user2_scan.nii.gz",
            original_file_name="user2_original.nii.gz",
            organ="brain",
            scan_date=datetime.now().date(),
            file_path="/tmp/user2_scan.nii.gz",
            processing_complete=False
        )
        
        # URL endpoints
        self.all_scans_url = reverse('analyze_mri')
        self.scan1_url = reverse('get_mri_scan', kwargs={'scan_id': self.scan1.id})
        self.scan2_url = reverse('get_mri_scan', kwargs={'scan_id': self.scan2.id})
        self.process_url1 = reverse('process_mri', kwargs={'scan_id': self.scan1.id})
        self.process_url2 = reverse('process_mri', kwargs={'scan_id': self.scan2.id})
    
    def get_auth_token_for_user(self, user):
        """Helper method to get authentication token directly from user object"""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def test_unauthenticated_access_denied(self):
        """Test that unauthenticated users cannot access any MRI scan endpoints"""
        
        # Try to get all scans without authentication
        response = self.client.get(self.all_scans_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
        # Try to get specific scan without authentication
        response = self.client.get(self.scan1_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
        # Try to process scan without authentication
        response = self.client.post(self.process_url1)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_user_can_access_own_scans(self):
        """Test that a user can access their own MRI scans"""
        
        # Authenticate as user1
        token = self.get_auth_token_for_user(self.user1)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Get all scans (should only see user1's scans)
        response = self.client.get(self.all_scans_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['data']), 1)
        self.assertEqual(response.data['data'][0]['id'], self.scan1.id)
        
        # Get specific scan
        response = self.client.get(self.scan1_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['id'], self.scan1.id)
    
    def test_user_cannot_access_other_user_scans(self):
        """Test that a user cannot access another user's MRI scans"""
        
        # Authenticate as user1
        token = self.get_auth_token_for_user(self.user1)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        # Try to get user2's scan
        response = self.client.get(self.scan2_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
        # Try to process user2's scan
        response = self.client.post(self.process_url2)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
    
    @patch('mori.views.process_mri_data')
    def test_user_can_process_own_scan(self, mock_process):
        """Test that a user can process their own MRI scan"""
        
        # Patch the file check to return True
        with patch('os.path.exists', return_value=True):
            # Authenticate as user1
            token = self.get_auth_token_for_user(self.user1)
            self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
            
            # Process user1's scan
            response = self.client.post(self.process_url1)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            mock_process.assert_called_once_with(self.scan1.file_path, self.scan1.id)
    
    @patch('mori.views.process_mri_data')
    def test_switching_users(self, mock_process):
        """Test that switching users properly restricts access"""
        
        with patch('os.path.exists', return_value=True):
            # First authenticate as user1
            token1 = self.get_auth_token_for_user(self.user1)
            self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token1}')
            
            # Verify user1 can access their scan
            response = self.client.get(self.scan1_url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            
            # User1 cannot access user2's scan
            response = self.client.get(self.scan2_url)
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
            
            # Now switch to user2
            token2 = self.get_auth_token_for_user(self.user2)
            self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token2}')
            
            # Verify user2 can access their scan
            response = self.client.get(self.scan2_url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            
            # User2 cannot access user1's scan
            response = self.client.get(self.scan1_url)
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
