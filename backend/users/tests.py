from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
import json

User = get_user_model()

class RegistrationTestCase(APITestCase):
    """Test suite for user registration API"""
    
    def setUp(self):
        self.client = APIClient()
        self.register_url = reverse('register')
        self.valid_payload = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'TestPassword123',
            'first_name': 'Test',
            'last_name': 'User'
        }
    
    def test_successful_registration(self):
        """Test user can register with valid data"""
        response = self.client.post(
            self.register_url,
            data=self.valid_payload,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)
        
        # Check that user was created in the database
        user_exists = User.objects.filter(email=self.valid_payload['email']).exists()
        self.assertTrue(user_exists)
        
        # Check user data
        user = User.objects.get(email=self.valid_payload['email'])
        self.assertEqual(user.username, self.valid_payload['username'])
        self.assertEqual(user.first_name, self.valid_payload['first_name'])
        self.assertEqual(user.last_name, self.valid_payload['last_name'])
    
    def test_registration_missing_fields(self):
        """Test registration fails when required fields are missing"""
        
        # Test missing username
        invalid_payload = self.valid_payload.copy()
        invalid_payload.pop('username')
        response = self.client.post(
            self.register_url,
            data=invalid_payload,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Test missing email
        invalid_payload = self.valid_payload.copy()
        invalid_payload.pop('email')
        response = self.client.post(
            self.register_url,
            data=invalid_payload,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Test missing password
        invalid_payload = self.valid_payload.copy()
        invalid_payload.pop('password')
        response = self.client.post(
            self.register_url,
            data=invalid_payload,
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_registration_invalid_email(self):
        """Test registration fails with invalid email format"""
        invalid_payload = self.valid_payload.copy()
        invalid_payload['email'] = 'invalid-email'
        
        response = self.client.post(
            self.register_url,
            data=invalid_payload,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_registration_short_password(self):
        """Test registration fails with short password"""
        invalid_payload = self.valid_payload.copy()
        invalid_payload['password'] = 'short'
        
        response = self.client.post(
            self.register_url,
            data=invalid_payload,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_registration_duplicate_user(self):
        """Test registration fails if user already exists"""
        # Create the user first
        User.objects.create_user(
            username=self.valid_payload['username'],
            email=self.valid_payload['email'],
            password=self.valid_payload['password']
        )
        
        # Try to register the same user again
        response = self.client.post(
            self.register_url,
            data=self.valid_payload,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LoginTestCase(APITestCase):
    """Test suite for user login API"""
    
    def setUp(self):
        self.client = APIClient()
        self.login_url = reverse('login')
        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'TestPassword123'
        }
        
        # Create a user for testing login
        self.user = User.objects.create_user(
            username=self.user_data['username'],
            email=self.user_data['email'],
            password=self.user_data['password']
        )
    
    def test_successful_login(self):
        """Test user can login with valid credentials"""
        payload = {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }
        
        response = self.client.post(
            self.login_url,
            data=payload,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)
    
    def test_login_invalid_credentials(self):
        """Test login fails with invalid credentials"""
        
        # Test with wrong password
        payload = {
            'username': self.user_data['username'],
            'password': 'WrongPassword123'
        }
        
        response = self.client.post(
            self.login_url,
            data=payload,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Test with non-existent user
        payload = {
            'username': 'nonexistentuser',
            'password': self.user_data['password']
        }
        
        response = self.client.post(
            self.login_url,
            data=payload,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class UserAPITestCase(APITestCase):
    """Test suite for user profile API"""
    
    def setUp(self):
        self.client = APIClient()
        self.user_url = reverse('user')
        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'TestPassword123',
            'first_name': 'Test',
            'last_name': 'User'
        }
        
        # Create a user for testing
        self.user = User.objects.create_user(
            username=self.user_data['username'],
            email=self.user_data['email'],
            password=self.user_data['password'],
            first_name=self.user_data['first_name'],
            last_name=self.user_data['last_name']
        )
    
    def get_tokens(self):
        """Helper method to get authentication tokens directly"""
        refresh = RefreshToken.for_user(self.user)
        return str(refresh.access_token), str(refresh)
    
    def test_user_api_authenticated(self):
        """Test authenticated users can access their profile"""
        
        # Get authentication token directly without going through login
        access_token, _ = self.get_tokens()
        
        # Set token in the Authorization header
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        
        # Get user profile
        response = self.client.get(self.user_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], self.user_data['username'])
        self.assertEqual(response.data['email'], self.user_data['email'])
        self.assertEqual(response.data['first_name'], self.user_data['first_name'])
        self.assertEqual(response.data['last_name'], self.user_data['last_name'])
    
    def test_user_api_unauthenticated(self):
        """Test unauthenticated users cannot access profile"""
        
        # Try to access user profile without authentication
        response = self.client.get(self.user_url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
