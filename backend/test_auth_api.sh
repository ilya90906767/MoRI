#!/bin/bash

# Test script for User Authentication API
# This script tests the registration, login, user profile, and logout endpoints

# Set the base URL - can be overridden by environment variable
API_HOST=${API_HOST:-"localhost"}
API_PORT=${API_PORT:-"8000"}
BASE_URL="http://${API_HOST}:${API_PORT}/api"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print section headers
print_header() {
    echo -e "\n${YELLOW}==== $1 ====${NC}\n"
}

# Function to check if jq is installed
check_jq() {
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is not installed. Please install it to parse JSON responses.${NC}"
        echo "On macOS: brew install jq"
        echo "On Ubuntu/Debian: sudo apt-get install jq"
        exit 1
    fi
}

# Check for jq
check_jq

# Store tokens and user data
ACCESS_TOKEN=""
REFRESH_TOKEN=""
USER_ID=""

# Test 1: Register a new user
test_register() {
    print_header "TESTING USER REGISTRATION"
    
    # Generate a random username to avoid conflicts
    RANDOM_SUFFIX=$(date +%s)
    USERNAME="testuser_${RANDOM_SUFFIX}"
    EMAIL="test_${RANDOM_SUFFIX}@example.com"
    
    echo "Creating user: ${USERNAME} with email: ${EMAIL}"
    
    # Make the registration request
    RESPONSE=$(curl -s -X POST "${BASE_URL}/register/" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "'${USERNAME}'",
            "email": "'${EMAIL}'",
            "password": "TestPassword123",
            "first_name": "Test",
            "last_name": "User"
        }')
    
    # Check if registration was successful
    if echo "$RESPONSE" | jq -e '.access' > /dev/null; then
        echo -e "${GREEN}✓ Registration successful${NC}"
        
        # Extract tokens and user ID
        ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access')
        REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh')
        USER_ID=$(echo "$RESPONSE" | jq -r '.user.id')
        
        echo "User ID: $USER_ID"
        echo "Access Token: ${ACCESS_TOKEN:0:20}..."
        echo "Refresh Token: ${REFRESH_TOKEN:0:20}..."
        
        return 0
    else
        echo -e "${RED}✗ Registration failed${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Test 2: Test registration with missing fields
test_register_missing_fields() {
    print_header "TESTING REGISTRATION WITH MISSING FIELDS"
    
    # Test missing username
    echo "Testing registration without username..."
    RESPONSE=$(curl -s -X POST "${BASE_URL}/register/" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "incomplete@example.com",
            "password": "TestPassword123"
        }')
    
    if [[ $(echo "$RESPONSE" | jq -e 'has("username")') == "true" ]]; then
        echo -e "${GREEN}✓ Server correctly rejected registration without username${NC}"
    else
        echo -e "${RED}✗ Server did not properly validate missing username${NC}"
        echo "Response: $RESPONSE"
    fi
    
    # Test missing email
    echo -e "\nTesting registration without email..."
    RESPONSE=$(curl -s -X POST "${BASE_URL}/register/" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "incomplete_user",
            "password": "TestPassword123"
        }')
    
    if [[ $(echo "$RESPONSE" | jq -e 'has("email")') == "true" ]]; then
        echo -e "${GREEN}✓ Server correctly rejected registration without email${NC}"
    else
        echo -e "${RED}✗ Server did not properly validate missing email${NC}"
        echo "Response: $RESPONSE"
    fi
    
    # Test missing password
    echo -e "\nTesting registration without password..."
    RESPONSE=$(curl -s -X POST "${BASE_URL}/register/" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "incomplete_user",
            "email": "incomplete@example.com"
        }')
    
    if [[ $(echo "$RESPONSE" | jq -e 'has("password")') == "true" ]]; then
        echo -e "${GREEN}✓ Server correctly rejected registration without password${NC}"
    else
        echo -e "${RED}✗ Server did not properly validate missing password${NC}"
        echo "Response: $RESPONSE"
    fi
}

# Test 3: Test registration with duplicate user
test_register_duplicate() {
    print_header "TESTING REGISTRATION WITH DUPLICATE USER"
    
    # Only run this test if we have a valid username from previous test
    if [[ -z "$USERNAME" ]]; then
        echo -e "${YELLOW}Skipping duplicate user test as no user was created${NC}"
        return
    fi
    
    echo "Attempting to register the same user again: $USERNAME"
    
    # Try to register the same user again
    RESPONSE=$(curl -s -X POST "${BASE_URL}/register/" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "'${USERNAME}'",
            "email": "'${EMAIL}'",
            "password": "TestPassword123",
            "first_name": "Test",
            "last_name": "User"
        }')
    
    # Check if registration was rejected
    if ! echo "$RESPONSE" | jq -e '.access' > /dev/null; then
        echo -e "${GREEN}✓ Server correctly rejected duplicate registration${NC}"
        echo "Error message: $(echo "$RESPONSE" | jq -r '.username // .email // .non_field_errors // "No specific error message"')"
    else
        echo -e "${RED}✗ Server allowed duplicate registration${NC}"
        echo "Response: $RESPONSE"
    fi
}

# Test 4: Login with the created user
test_login() {
    print_header "TESTING USER LOGIN"
    
    # Only run this test if we have a valid username from previous test
    if [[ -z "$USERNAME" ]]; then
        echo -e "${YELLOW}Creating a new user for login test${NC}"
        test_register
    fi
    
    echo "Logging in with username: $USERNAME"
    
    # Make the login request
    RESPONSE=$(curl -s -X POST "${BASE_URL}/login/" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "'${USERNAME}'",
            "password": "TestPassword123"
        }')
    
    # Check if login was successful
    if echo "$RESPONSE" | jq -e '.access' > /dev/null; then
        echo -e "${GREEN}✓ Login successful${NC}"
        
        # Update tokens
        ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access')
        REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh')
        
        echo "Access Token: ${ACCESS_TOKEN:0:20}..."
        echo "Refresh Token: ${REFRESH_TOKEN:0:20}..."
        
        return 0
    else
        echo -e "${RED}✗ Login failed${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Test 5: Login with invalid credentials
test_login_invalid() {
    print_header "TESTING LOGIN WITH INVALID CREDENTIALS"
    
    echo "Attempting login with wrong password..."
    
    # Make the login request with wrong password
    RESPONSE=$(curl -s -X POST "${BASE_URL}/login/" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "'${USERNAME}'",
            "password": "WrongPassword123"
        }')
    
    # Check if login was rejected
    if ! echo "$RESPONSE" | jq -e '.access' > /dev/null; then
        echo -e "${GREEN}✓ Server correctly rejected invalid credentials${NC}"
    else
        echo -e "${RED}✗ Server allowed login with wrong password${NC}"
        echo "Response: $RESPONSE"
    fi
    
    echo -e "\nAttempting login with non-existent user..."
    
    # Make the login request with non-existent user
    RESPONSE=$(curl -s -X POST "${BASE_URL}/login/" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "nonexistentuser",
            "password": "TestPassword123"
        }')
    
    # Check if login was rejected
    if ! echo "$RESPONSE" | jq -e '.access' > /dev/null; then
        echo -e "${GREEN}✓ Server correctly rejected non-existent user${NC}"
    else
        echo -e "${RED}✗ Server allowed login with non-existent user${NC}"
        echo "Response: $RESPONSE"
    fi
}

# Test 6: Get user profile
test_user_profile() {
    print_header "TESTING USER PROFILE"
    
    # Only run this test if we have a valid access token
    if [[ -z "$ACCESS_TOKEN" ]]; then
        echo -e "${YELLOW}No access token available. Running login test first...${NC}"
        test_login
        if [[ $? -ne 0 ]]; then
            echo -e "${RED}Cannot proceed with profile test without valid token${NC}"
            return 1
        fi
    fi
    
    echo "Fetching user profile with token"
    
    # Make the profile request
    RESPONSE=$(curl -s -X GET "${BASE_URL}/user/" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")
    
    # Check if profile fetch was successful
    if echo "$RESPONSE" | jq -e '.username' > /dev/null; then
        echo -e "${GREEN}✓ Profile fetch successful${NC}"
        echo "Username: $(echo "$RESPONSE" | jq -r '.username')"
        echo "Email: $(echo "$RESPONSE" | jq -r '.email')"
        echo "First Name: $(echo "$RESPONSE" | jq -r '.first_name')"
        echo "Last Name: $(echo "$RESPONSE" | jq -r '.last_name')"
        return 0
    else
        echo -e "${RED}✗ Profile fetch failed${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Test 7: Access profile without authentication
test_profile_unauthenticated() {
    print_header "TESTING PROFILE ACCESS WITHOUT AUTHENTICATION"
    
    echo "Attempting to access profile without token..."
    
    # Make the profile request without token
    RESPONSE=$(curl -s -X GET "${BASE_URL}/user/")
    
    # Check if access was denied
    if [[ $(echo "$RESPONSE" | jq -e '.detail') == "true" ]]; then
        echo -e "${GREEN}✓ Server correctly denied access without authentication${NC}"
        echo "Error message: $(echo "$RESPONSE" | jq -r '.detail')"
    else
        echo -e "${RED}✗ Server allowed access without authentication${NC}"
        echo "Response: $RESPONSE"
    fi
}

# Test 8: Logout
test_logout() {
    print_header "TESTING USER LOGOUT"
    
    # Only run this test if we have a valid refresh token
    if [[ -z "$REFRESH_TOKEN" ]]; then
        echo -e "${YELLOW}No refresh token available. Running login test first...${NC}"
        test_login
        if [[ $? -ne 0 ]]; then
            echo -e "${RED}Cannot proceed with logout test without valid token${NC}"
            return 1
        fi
    fi
    
    echo "Logging out user"
    
    # Make the logout request
    RESPONSE=$(curl -s -X POST "${BASE_URL}/logout/" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -d '{
            "refresh": "'${REFRESH_TOKEN}'"
        }')
    
    # Check if logout was successful
    if echo "$RESPONSE" | jq -e '.success' > /dev/null; then
        echo -e "${GREEN}✓ Logout successful${NC}"
        
        # Clear tokens
        ACCESS_TOKEN=""
        REFRESH_TOKEN=""
        
        return 0
    else
        echo -e "${RED}✗ Logout failed${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Test 9: Access profile after logout
test_profile_after_logout() {
    print_header "TESTING PROFILE ACCESS AFTER LOGOUT"
    
    # Only run this test if we performed a logout
    if [[ ! -z "$ACCESS_TOKEN" ]]; then
        echo -e "${YELLOW}Logout wasn't performed or tokens weren't cleared. Skipping test.${NC}"
        return
    fi
    
    echo "Attempting to access profile with expired token..."
    
    # Make the profile request with the old token
    RESPONSE=$(curl -s -X GET "${BASE_URL}/user/" \
        -H "Authorization: Bearer ${OLD_ACCESS_TOKEN}")
    
    # Check if access was denied
    if [[ $(echo "$RESPONSE" | jq -e '.detail') == "true" ]]; then
        echo -e "${GREEN}✓ Server correctly denied access with expired token${NC}"
        echo "Error message: $(echo "$RESPONSE" | jq -r '.detail')"
    else
        echo -e "${RED}✗ Server allowed access with expired token${NC}"
        echo "Response: $RESPONSE"
    fi
}

# Run all tests
run_all_tests() {
    test_register
    test_register_missing_fields
    test_register_duplicate
    test_login
    test_login_invalid
    test_user_profile
    test_profile_unauthenticated
    
    # Save the access token before logout for later test
    OLD_ACCESS_TOKEN=$ACCESS_TOKEN
    
    test_logout
    test_profile_after_logout
    
    print_header "ALL TESTS COMPLETED"
}

# Run the tests
run_all_tests