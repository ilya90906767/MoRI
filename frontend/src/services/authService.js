// Authentication service for handling user login, registration, and session management

// API endpoints
const API_URL = `/api/auth`;
const LOGIN_URL = `${API_URL}/login/`;
const REGISTER_URL = `${API_URL}/register/`;
const USER_URL = `${API_URL}/user/`;
const LOGOUT_URL = `${API_URL}/logout/`;
const REFRESH_URL = `${API_URL}/token/refresh/`;

// Local storage keys
const TOKEN_KEY = import.meta.env.VITE_TOKEN_KEY || 'auth_tokens';
const USER_KEY = import.meta.env.VITE_USER_KEY || 'user_info';

/**
 * Auth service containing methods for authentication
 */
const authService = {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise} - Promise with registration response
   */
  register: async (userData) => {
    try {
      const response = await fetch(REGISTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      // Save tokens and user data
      localStorage.setItem(TOKEN_KEY, JSON.stringify({
        access: data.access,
        refresh: data.refresh,
      }));
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      return data;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  },

  /**
   * Login user
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise} - Promise with login response
   */
  login: async (username, password) => {
    try {
      const response = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Save tokens and user data
      localStorage.setItem(TOKEN_KEY, JSON.stringify({
        access: data.access,
        refresh: data.refresh,
      }));
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  /**
   * Logout user
   * @returns {Promise} - Promise with logout response
   */
  logout: async () => {
    try {
      const tokens = authService.getTokens();
      
      if (tokens?.refresh) {
        // Call logout API to blacklist the token
        await fetch(LOGOUT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokens.access}`,
          },
          body: JSON.stringify({ refresh: tokens.refresh }),
        });
      }
      
      // Clear local storage
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local storage even if API call fails
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return { success: true };
    }
  },

  /**
   * Get current user data
   * @returns {Promise} - Promise with user data
   */
  getCurrentUser: async () => {
    try {
      const tokens = authService.getTokens();
      if (!tokens?.access) {
        throw new Error('No access token found');
      }

      const response = await fetch(USER_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokens.access}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try to refresh
          const refreshed = await authService.refreshToken();
          if (refreshed) {
            return authService.getCurrentUser();
          } else {
            throw new Error('Session expired');
          }
        }
        throw new Error('Failed to get user data');
      }

      const data = await response.json();
      // Update stored user data
      localStorage.setItem(USER_KEY, JSON.stringify(data));
      return data;
    } catch (error) {
      console.error('Get current user error:', error);
      throw error;
    }
  },

  /**
   * Refresh the access token
   * @returns {boolean} - Whether refresh was successful
   */
  refreshToken: async () => {
    try {
      const tokens = authService.getTokens();
      if (!tokens?.refresh) {
        return false;
      }

      const response = await fetch(REFRESH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: tokens.refresh }),
      });

      if (!response.ok) {
        // If refresh fails, log the user out
        authService.logout();
        return false;
      }

      const data = await response.json();
      
      // Update tokens in storage
      localStorage.setItem(TOKEN_KEY, JSON.stringify({
        access: data.access,
        refresh: tokens.refresh,
      }));

      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      authService.logout();
      return false;
    }
  },

  /**
   * Get tokens from local storage
   * @returns {Object|null} - Token object or null
   */
  getTokens: () => {
    const tokensStr = localStorage.getItem(TOKEN_KEY);
    return tokensStr ? JSON.parse(tokensStr) : null;
  },

  /**
   * Get user from local storage
   * @returns {Object|null} - User object or null
   */
  getUser: () => {
    const userStr = localStorage.getItem(USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * Check if user is authenticated
   * @returns {boolean} - Whether user is authenticated
   */
  isAuthenticated: () => {
    return !!authService.getTokens()?.access;
  },

  /**
   * Get auth header for API requests
   * @returns {Object} - Headers object with Authorization
   */
  getAuthHeader: () => {
    const tokens = authService.getTokens();
    return tokens?.access ? { 'Authorization': `Bearer ${tokens.access}` } : {};
  },
};

export default authService; 