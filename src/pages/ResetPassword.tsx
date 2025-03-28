import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isResetMode, setIsResetMode] = useState(false);

  // Check if there's a hash fragment in the URL which indicates we're in a valid reset flow
  useEffect(() => {
    // Supabase automatically handles the hash fragment and auth state
    // Just check if we're in an appropriate context for password reset
    const checkResetContext = async () => {
      // Check current session - if we have one with access_token but no refresh_token
      // it could be a recovery session 
      const { data } = await supabase.auth.getSession();
      
      if (data.session?.access_token && !data.session?.refresh_token) {
        setIsResetMode(true);
      } else {
        // Not in reset mode
        setMessage('Invalid or expired password reset link. Please request a new password reset.');
      }
    };
    
    checkResetContext();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) {
        throw error;
      }
      
      setMessage('Your password has been successfully reset! Redirecting to login...');
      
      // Redirect to login after a brief delay
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Reset Your Password
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Enter a new password for your account
          </p>
        </div>

        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          {isResetMode ? (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="••••••••"
                  />
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              {message && (
                <div className="rounded-lg bg-green-50 p-4">
                  <div className="text-sm text-green-700">{message}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors ${
                  loading ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                {loading ? 'Processing...' : 'Reset Password'}
              </button>
            </form>
          ) : (
            <div className="text-center">
              {message && (
                <div className="rounded-lg bg-yellow-50 p-4 mb-4">
                  <div className="text-sm text-yellow-700">{message}</div>
                </div>
              )}
              
              <button
                onClick={() => navigate('/login')}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Return to login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword; 