import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { trackAuth } from '../lib/analytics';

// Debounce delay for username check (300ms)
const USERNAME_CHECK_DEBOUNCE = 300;

const Login = () => {
  const navigate = useNavigate();
  
  // Auth state from context
  const { signIn, signUp, resetPassword, checkUsername } = useAuth();
  
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
  
  // Username availability state
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const usernameTimeoutRef = useRef<NodeJS.Timeout>();

  // Helper function to determine button disabled state
  const isButtonDisabled = useCallback((): boolean => {
    if (loading) return true;
    if (isSignUp && username) {
      return isUsernameAvailable === false || isUsernameAvailable === null;
    }
    return false;
  }, [loading, isSignUp, username, isUsernameAvailable]);

  // Check username availability with debouncing
  const checkUsernameAvailability = useCallback(async (value: string) => {
    if (!value) {
      setIsUsernameAvailable(null);
      return;
    }

    setIsCheckingUsername(true);
    try {
      const isAvailable = await checkUsername(value);
      setIsUsernameAvailable(isAvailable);
    } catch (err) {
      setIsUsernameAvailable(null);
    } finally {
      setIsCheckingUsername(false);
    }
  }, [checkUsername]);

  // Handle username change with debouncing
  const handleUsernameChange = useCallback((value: string) => {
    setUsername(value);
    setIsUsernameAvailable(null);

    if (usernameTimeoutRef.current) {
      clearTimeout(usernameTimeoutRef.current);
    }

    if (value) {
      usernameTimeoutRef.current = setTimeout(() => {
        checkUsernameAvailability(value);
      }, USERNAME_CHECK_DEBOUNCE);
    }
  }, [checkUsernameAvailability]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (usernameTimeoutRef.current) {
        clearTimeout(usernameTimeoutRef.current);
      }
    };
  }, []);

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
          trackAuth.passwordReset();
          setSuccessMessage('Password reset instructions have been sent to your email address.');
          setIsForgotPassword(false);
        }
      } else if (isSignUp) {
        // Check username availability one last time before submitting
        const isAvailable = await checkUsername(username);
        if (!isAvailable) {
          setError('Username is no longer available. Please choose another.');
          return;
        }

        const { error, success } = await signUp(email, password, {
          name,
          username,
          friend_code: friendCode
        });
        
        if (error) {
          setError(error.message);
        } else if (success) {
          trackAuth.signUp();
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
          trackAuth.signIn();
          navigate('/requests');
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
    setIsUsernameAvailable(null);
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
                    <div className="relative">
                      <input
                        id="username"
                        name="username"
                        type="text"
                        required
                        value={username}
                        onChange={(e) => handleUsernameChange(e.target.value)}
                        className={`block w-full rounded-lg border px-3 py-2 shadow-sm focus:ring-indigo-500 sm:text-sm ${
                          isUsernameAvailable === null
                            ? 'border-gray-300 focus:border-indigo-500'
                            : isUsernameAvailable
                              ? 'border-green-500 focus:border-green-500'
                              : 'border-red-500 focus:border-red-500'
                        }`}
                        placeholder="Choose a username"
                      />
                      {username && (
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                          {isCheckingUsername ? (
                            <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : isUsernameAvailable !== null && (
                            <span className={isUsernameAvailable ? 'text-green-500' : 'text-red-500'}>
                              {isUsernameAvailable ? '✓' : '✗'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {username && isUsernameAvailable === false && (
                      <p className="mt-1 text-sm text-red-600">
                        This username is already taken
                      </p>
                    )}
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
              disabled={isButtonDisabled()}
              className="flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Processing...' : (
                isForgotPassword 
                  ? 'Send reset instructions'
                  : (isSignUp ? 'Create account' : 'Sign in')
              )}
            </button>

            <div className="mt-4 text-center text-sm">
              {isForgotPassword ? (
                <button
                  type="button"
                  onClick={toggleForgotPassword}
                  className="text-indigo-600 hover:text-indigo-500"
                >
                  Back to sign in
                </button>
              ) : (
                <div className="space-x-4">
                  <button
                    type="button"
                    onClick={toggleSignUp}
                    className="text-indigo-600 hover:text-indigo-500"
                  >
                    {isSignUp ? 'Already have an account?' : 'Need an account?'}
                  </button>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={toggleForgotPassword}
                      className="text-indigo-600 hover:text-indigo-500"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login; 