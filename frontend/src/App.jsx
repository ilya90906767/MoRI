import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import './App.css'
import Header from './components/Header/Header'
import Chat from './components/Chat/Chat'
import Login from './components/Auth/Login'
import Register from './components/Auth/Register'
import Profile from './components/Auth/Profile'
import Landing from './components/Landing/Landing'
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import installFetchInterceptor from './utils/apiInterceptor'

// Component to conditionally render header
const AppLayout = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated } = useAuth || {};
  const isAuthPage = ['/login', '/register', '/profile'].includes(location.pathname);
  const isLandingPage = location.pathname === '/landing' || (location.pathname === '/' && !isAuthenticated);
  
  return (
    <>
      <div className="grid-overlay" />
      <div className="floating-elements" />
      <div className={`app-container ${isAuthPage || isLandingPage ? 'fullscreen' : ''}`}>
        {!isAuthPage && !isLandingPage && <Header />}
        {children}
      </div>
    </>
  );
};

// Component to handle public and private routes
const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public home - shows landing for non-authenticated users */}
      <Route path="/" element={
        isAuthenticated ? 
          <Navigate to="/dashboard" replace /> : 
          <Landing />
      } />
      
      {/* Explicit landing page route */}
      <Route path="/landing" element={<Landing />} />
      
      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/profile" element={
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      } />
      
      {/* Protected app routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Chat />
        </ProtectedRoute>
      } />
      
      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  // Install fetch interceptor for auth headers
  useEffect(() => {
    installFetchInterceptor();
  }, []);

  return (
    <AuthProvider>
      <Router>
        <AppLayout>
          <AppRoutes />
        </AppLayout>
      </Router>
    </AuthProvider>
  )
}

export default App
