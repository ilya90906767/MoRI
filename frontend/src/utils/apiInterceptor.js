import authService from '../services/authService';

/**
 * Creates a fetch interceptor that adds auth headers and handles token refresh
 * @param {Function} originalFetch - The original fetch function
 * @returns {Function} - The intercepted fetch function
 */
const createFetchInterceptor = (originalFetch) => {
  return async (...args) => {
    const [resource, config = {}] = args;
    
    // Clone the config to avoid modifying the original
    const newConfig = { ...config };
    
    // If headers not set, initialize them
    if (!newConfig.headers) {
      newConfig.headers = {};
    }
    
    // For DeepSeek API calls, only add Authorization header from config
    if (resource.includes('api.deepseek.com')) {
      return originalFetch(resource, newConfig);
    }

    // Add Authorization header if user is authenticated
    if (authService.isAuthenticated()) {
      const authHeader = authService.getAuthHeader();
      newConfig.headers = {
        ...newConfig.headers,
        ...authHeader
      };
    }
    
    // Execute the fetch with updated config
    try {
      const response = await originalFetch(resource, newConfig);
      
      // Handle 401 Unauthorized - token might be expired
      if (response.status === 401 && !resource.includes('api.deepseek.com')) {
        // Try to refresh the token
        const refreshSuccess = await authService.refreshToken();
        
        if (refreshSuccess) {
          // If refresh was successful, retry with the new token
          const newAuthHeader = authService.getAuthHeader();
          newConfig.headers = {
            ...newConfig.headers,
            ...newAuthHeader
          };
          
          // Retry the original request with the new token
          return originalFetch(resource, newConfig);
        } else {
          // If refresh failed, user needs to login again
          // Return the original 401 response
          return response;
        }
      }
      
      return response;
    } catch (error) {
      console.error('Fetch interceptor error:', error);
      throw error;
    }
  };
};

/**
 * Install the fetch interceptor globally
 */
export const installFetchInterceptor = () => {
  // Save the original fetch function
  const originalFetch = window.fetch;
  
  // Replace with our intercepted version
  window.fetch = createFetchInterceptor(originalFetch);
};

export default installFetchInterceptor;