import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Header.css'

const Header = () => {
  const { user, isAuthenticated } = useAuth();
  
  return (
    <div className="header">
      <div className="header-content">
        <div className="header-left">
          <h1><Link to="/">iMoRI</Link></h1>
          <p>Upload your MRI scans and get instant AI-powered analysis</p>
        </div>
        
        <div className="header-right">
          {isAuthenticated ? (
            <div className="auth-menu">
              <Link to="/profile" className="auth-link">Profile</Link>
            </div>
          ) : (
            <div className="auth-menu">
              <Link to="/login" className="auth-link">Login</Link>
              <Link to="/register" className="auth-link register-link">Register</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Header 