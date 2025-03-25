import React, { useState, FormEvent, ChangeEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// Login form component
export const Login = () => {
  // Navigation
  const navigate = useNavigate();
  
  // Auth state from context
  const { signIn, signUp, resetPassword } = useAuth();
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [friendCode, setFriendCode] = useState('');
  
  // UI state
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // For development mode - display helpful tips
  const isDev = process.env.NODE_ENV === 'development';
  
  // Handle form submission
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    
    try {
      if (activeTab === 'login') {
        // Handle login
        const { error, success } = await signIn(email, password);
        if (error) {
          setError(error.message);
        } else if (success) {
          // Redirect to trades page on successful login
          navigate('/trades');
        }
      } else if (activeTab === 'signup') {
        // Handle signup
        const { error, success } = await signUp(email, password, {
          name,
          username,
          friend_code: friendCode
        });
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Account created! Check your email to verify your account.');
          setActiveTab('login');
        }
      } else if (activeTab === 'reset') {
        // Handle password reset
        const { error } = await resetPassword(email);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Password reset instructions sent to your email.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {isDev && (
          <div className="mb-4 rounded-lg bg-blue-50 p-4 text-sm text-blue-700 border border-blue-200">
            <h3 className="font-semibold mb-1">Development Mode Tips</h3>
            <p className="mb-2">
              This app requires a Supabase backend. For testing, you can create an account with any email and password.
            </p>
            <p>
              <strong>Test credentials:</strong> email: <code className="bg-blue-100 px-1">test@example.com</code>, password: <code className="bg-blue-100 px-1">password123</code>
            </p>
          </div>
        )}
        
        <div className="rounded-lg bg-white p-8 shadow-md">
          <h2 className="mb-6 text-center text-2xl font-bold text-gray-900">Pocket Trades</h2>
          
          {/* Tabs */}
          <div className="mb-6 flex border-b">
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-2 text-center font-medium ${
                activeTab === 'login'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setActiveTab('signup')}
              className={`flex-1 py-2 text-center font-medium ${
                activeTab === 'signup'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => setActiveTab('reset')}
              className={`flex-1 py-2 text-center font-medium ${
                activeTab === 'reset'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Reset Password
            </button>
          </div>
          
          {/* Error and success messages */}
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mb-4 rounded-md bg-green-50 p-4 text-sm text-green-700">
              {success}
            </div>
          )}
          
          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Login form */}
            {activeTab === 'login' && (
              <>
                <div className="mb-4">
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    className="form-input"
                    required
                  />
                </div>
                <div className="mb-6">
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    className="form-input"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </>
            )}

            {/* Signup form */}
            {activeTab === 'signup' && (
              <>
                <div className="mb-4">
                  <label htmlFor="name" className="mb-2 block text-sm font-medium text-gray-700">
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    className="form-input"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="username" className="mb-2 block text-sm font-medium text-gray-700">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                    className="form-input"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="friendCode" className="mb-2 block text-sm font-medium text-gray-700">
                    Friend Code
                  </label>
                  <input
                    id="friendCode"
                    type="text"
                    value={friendCode}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFriendCode(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="signup-email" className="mb-2 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    className="form-input"
                    required
                  />
                </div>
                <div className="mb-6">
                  <label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    className="form-input"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </>
            )}

            {/* Reset password form */}
            {activeTab === 'reset' && (
              <div className="mb-6">
                <label htmlFor="reset-email" className="mb-2 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  className="form-input"
                  required
                />
              </div>
            )}
            
            {/* Submit button */}
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading}
            >
              {loading ? 'Loading...' : activeTab === 'login' ? 'Sign In' : activeTab === 'signup' ? 'Create Account' : 'Reset Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login; 