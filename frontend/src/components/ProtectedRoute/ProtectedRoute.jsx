import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * ProtectedRoute component to secure routes that require authentication
 * Redirects to login if user is not authenticated
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // If still loading auth state, show loading indicator
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Save the location the user was trying to access for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If authenticated, render the protected content
  return children;
};

export default ProtectedRoute; 