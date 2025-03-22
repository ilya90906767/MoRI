from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model."""
    
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name')
        read_only_fields = ('id',)


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer for user registration."""
    
    password = serializers.CharField(write_only=True, min_length=8)
    username = serializers.CharField(required=True)
    email = serializers.EmailField(required=True)
    
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password', 'first_name', 'last_name')
        extra_kwargs = {
            'password': {'write_only': True},
            'username': {'required': True},
            'email': {'required': True}
        }
    
    def validate_username(self, value):
        """Validate that the username is provided and unique."""
        if not value:
            raise serializers.ValidationError("Username is required.")
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value
    
    def validate_email(self, value):
        """Validate that the email is provided and unique."""
        if not value:
            raise serializers.ValidationError("Email is required.")
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("This email is already registered.")
        return value
    
    def create(self, validated_data):
        """Create and return a user with encrypted password."""
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    """Serializer for user login."""
    
    username = serializers.CharField()
    password = serializers.CharField()
    
    def validate(self, attrs):
        user = authenticate(**attrs)
        if user and user.is_active:
            return user
        raise serializers.ValidationError("Incorrect credentials. Please try again.")