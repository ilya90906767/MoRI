import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Auth.css';

/**
 * Login component for user authentication with futuristic design
 */
const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get the redirect path from location state or default to home
  const from = location.state?.from?.pathname || '/';

  /**
   * Handle input change
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field-specific error when user types
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: '' }));
    }
    // Clear API error when user changes form
    if (apiError) {
      setApiError('');
    }
  };

  /**
   * Validate form data
   */
  const validateForm = () => {
    const errors = {};
    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    }
    if (!formData.password) {
      errors.password = 'Password is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    setApiError('');
    
    try {
      // Call login from auth context
      await login(formData.username, formData.password);
      
      // Redirect to the page the user was trying to access or home
      navigate(from, { replace: true });
    } catch (error) {
      console.error('Login error:', error);
      setApiError(error.message || 'Login failed. Please check your credentials and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>MRI Analysis Access</h2>
        
        {apiError && <div className="auth-error">{apiError}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className={formErrors.username ? 'error' : ''}
              disabled={isSubmitting}
              autoComplete="username"
              placeholder="Enter your username"
            />
            {formErrors.username && <span className="error-message">{formErrors.username}</span>}
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={formErrors.password ? 'error' : ''}
              disabled={isSubmitting}
              autoComplete="current-password"
              placeholder="Enter your password"
            />
            {formErrors.password && <span className="error-message">{formErrors.password}</span>}
          </div>
          
          <button 
            type="submit" 
            className="auth-button" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Authenticating...' : 'Log In'}
          </button>
        </form>
        
        <div className="auth-links">
          <p>
            Don't have an account? <Link to="/register">Create Account</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login; 