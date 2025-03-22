import { createContext, useState, useContext, useEffect } from 'react';
import authService from '../services/authService';

// Create context
const AuthContext = createContext(null);

/**
 * Auth Provider component for managing authentication state
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth state on component mount
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        if (authService.isAuthenticated()) {
          const userData = await authService.getCurrentUser();
          setUser(userData);
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
        // If we can't get the user, clear auth state
        authService.logout();
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  /**
   * Register a new user
   */
  const register = async (userData) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.register(userData);
      setUser(result.user);
      setIsAuthenticated(true);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Login user
   */
  const login = async (username, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.login(username, password);
      setUser(result.user);
      setIsAuthenticated(true);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Logout user
   */
  const logout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
      setIsAuthenticated(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Update user data in context
   */
  const updateUser = (userData) => {
    setUser(userData);
  };

  // Context value
  const value = {
    user,
    isAuthenticated,
    isLoading,
    error,
    register,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook for using auth context
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext; 