import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Auth.css';

/**
 * User Profile component with futuristic design
 */
const Profile = () => {
  const { user, logout, updateUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const navigate = useNavigate();

  /**
   * Handle navigation back to previous page
   */
  const handleBack = () => {
    navigate('/');
  };

  /**
   * Handle user logout
   */
  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await logout();
      // Redirect happens automatically via ProtectedRoute
    } catch (error) {
      console.error('Logout error:', error);
      setMessage({
        text: 'Failed to log out. Please try again.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card profile-card">
        <h2>MORI - User Profile</h2>
        
        {message.text && (
          <div className={`auth-message ${message.type}`}>
            {message.text}
          </div>
        )}
        
        <div className="profile-info">
          <div className="profile-avatar">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          
          <div className="profile-details">
            <div className="profile-field">
              <span className="field-label">Username</span>
              <span className="field-value">{user?.username || 'Not specified'}</span>
            </div>
            
            <div className="profile-field">
              <span className="field-label">Email</span>
              <span className="field-value">{user?.email || 'Not specified'}</span>
            </div>
            
            <div className="profile-field">
              <span className="field-label">First Name</span>
              <span className="field-value">{user?.first_name || 'Not specified'}</span>
            </div>
            
            <div className="profile-field">
              <span className="field-label">Last Name</span>
              <span className="field-value">{user?.last_name || 'Not specified'}</span>
            </div>
          </div>
        </div>
        
        <div className="profile-actions">
          <button 
            onClick={handleBack}
            className="auth-button back-button"
          >
            <span className="arrow">←</span>
            <span>RETURN</span>
          </button>
          <button 
            onClick={handleLogout}
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading ? 'Terminating Session...' : 'LOG OUT'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile; 