import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  
  // Auth state from context
  const { signIn, signUp, resetPassword } = useAuth();
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [friendCode, setFriendCode] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (isForgotPassword) {
        const { error } = await resetPassword(email);
        
        if (error) {
          setError(error.message);
        } else {
          setSuccessMessage('Password reset instructions have been sent to your email address.');
          setIsForgotPassword(false);
        }
      } else if (isSignUp) {
        const { error, success } = await signUp(email, password, {
          name,
          username,
          friend_code: friendCode
        });
        
        if (error) {
          setError(error.message);
        } else if (success) {
          setSuccessMessage(`Your account has been created! Please check your email (${email}) to confirm your account before signing in.`);
          // Reset the form and switch back to sign-in mode
          setName('');
          setUsername('');
          setFriendCode('');
          setPassword('');
          setIsSignUp(false);
        }
      } else {
        const { error } = await signIn(email, password);
        
        if (error) {
          setError(error.message);
        } else {
          navigate('/trades');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleForgotPassword = () => {
    setIsForgotPassword(!isForgotPassword);
    setIsSignUp(false);
    setError(null);
    setSuccessMessage(null);
  };

  const toggleSignUp = () => {
    setIsSignUp(!isSignUp);
    setIsForgotPassword(false);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md flex flex-col">
        <div className="mb-3 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            {isForgotPassword 
              ? 'Reset your password' 
              : (isSignUp ? 'Create your account' : 'Welcome back')}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {isForgotPassword 
              ? 'Enter your email to receive reset instructions'
              : (isSignUp ? 'Start your trading journey' : 'Sign in to continue trading')}
          </p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-lg ring-1 ring-gray-200">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-3">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="you@example.com"
                />
              </div>
              
              {isSignUp && (
                <>
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Choose a username"
                    />
                  </div>
                  <div>
                    <label htmlFor="friendCode" className="block text-sm font-medium text-gray-700 mb-1">
                      Pokemon TCG Pocket Friend Code
                    </label>
                    <input
                      id="friendCode"
                      name="friendCode"
                      type="text"
                      required
                      value={friendCode}
                      onChange={(e) => setFriendCode(e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Enter your friend code"
                    />
                  </div>
                </>
              )}
              
              {!isForgotPassword && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
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
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 border border-red-200">
                <div className="text-sm text-red-800">{error}</div>
              </div>
            )}

            {successMessage && (
              <div className="rounded-lg bg-green-50 p-3 border border-green-200">
                <div className="text-sm text-green-800">{successMessage}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors ${
                loading ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              {loading ? 'Processing...' : (
                isForgotPassword 
                  ? 'Send reset instructions'
                  : (isSignUp ? 'Create account' : 'Sign in')
              )}
            </button>
          </form>

          <div className="mt-3 text-center pb-1">
            {!isForgotPassword && (
              <button
                type="button"
                onClick={toggleSignUp}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            )}
            
            {!isSignUp && (
              <button
                type="button"
                onClick={toggleForgotPassword}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors ml-4"
              >
                {isForgotPassword ? 'Back to sign in' : 'Forgot your password?'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login; 