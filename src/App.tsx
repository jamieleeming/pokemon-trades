import React, { ReactNode } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
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

// Create router with future flags
const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      // Public routes
      {
        path: "login",
        element: <LoginRoute />
      },
      {
        path: "reset-password",
        element: <ResetPassword />
      },
      
      // Protected routes
      {
        path: "/",
        element: <ProtectedRoute element={<Navigate to="/requests" replace />} />
      },
      {
        path: "requests",
        element: <ProtectedRoute element={<Requests />} />
      },
      {
        path: "offers",
        element: <ProtectedRoute element={<Offers />} />
      },
      {
        path: "cards",
        element: <ProtectedRoute element={<Cards />} />
      },
      
      // Fallback route
      {
        path: "*",
        element: <Navigate to="/" replace />
      }
    ]
  }
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App; 