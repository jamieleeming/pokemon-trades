import React, { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Requests from './pages/Requests';
import Offers from './pages/Offers';
import Cards from './pages/Cards';
import { useAuth } from './contexts/AuthContext';
import './styles/globals.css';

// Define ProtectedRoute interface
interface ProtectedRouteProps {
  element: ReactNode;
}

// Protected route component
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ element }) => {
  const { user, loading } = useAuth();
  
  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }
  
  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Render the protected component if authenticated
  return <>{element}</>;
};

// Login route component - redirects to requests if already authenticated
const LoginRoute: React.FC = () => {
  const { user, loading } = useAuth();
  
  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }
  
  // Redirect to requests if already authenticated
  if (user) {
    return <Navigate to="/requests" replace />;
  }
  
  // Render the login component if not authenticated
  return <Login />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Public routes */}
          <Route path="login" element={<LoginRoute />} />
          <Route path="reset-password" element={<ResetPassword />} />
          
          {/* Protected routes */}
          <Route path="/" element={<ProtectedRoute element={<Navigate to="/requests" replace />} />} />
          <Route path="requests" element={<ProtectedRoute element={<Requests />} />} />
          <Route path="offers" element={<ProtectedRoute element={<Offers />} />} />
          <Route path="cards" element={<ProtectedRoute element={<Cards />} />} />
          
          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App; 