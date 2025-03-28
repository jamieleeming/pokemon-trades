import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { logWithTimestamp } from '../lib/logging';

interface UserData {
  name: string;
  username: string;
  friend_code?: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{
    error: any | null;
    success: boolean;
  }>;
  signUp: (email: string, password: string, userData: UserData) => Promise<{
    error: any | null;
    success: boolean;
  }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<{
    error: any | null;
    success: boolean;
  }>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signIn: async () => ({ error: null, success: false }),
  signUp: async () => ({ error: null, success: false }),
  signOut: async () => {},
  refreshSession: async () => false,
  resetPassword: async () => ({ error: null, success: false }),
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Function to update the user profile or create it if needed
  const ensureUserProfile = useCallback(async (user: User) => {
    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
        
      if (!existingUser) {
        const metadata = user.user_metadata;
        await supabase.from('users').insert({
          id: user.id,
          email: user.email || '',
          name: metadata?.name || 'User',
          username: metadata?.username || `user_${user.id.substring(0, 8)}`,
          friend_code: metadata?.friend_code || null
        });
        logWithTimestamp('Created new user profile', { userId: user.id });
      }
    } catch (error) {
      console.error('Error managing user profile:', error);
    }
  }, []);

  // Function to handle session updates
  const handleSessionChange = useCallback((newSession: Session | null) => {
    setSession(newSession);
    
    // Ensure user profile exists if we have a session
    if (newSession?.user) {
      ensureUserProfile(newSession.user);
    }
  }, [ensureUserProfile]);

  // Function to manually refresh the session
  const refreshSession = async (): Promise<boolean> => {
    try {
      logWithTimestamp('Manually refreshing session');
      
      // Use Supabase's built-in refresh mechanism
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        logWithTimestamp('Session refresh failed', { error: error.message });
        return false;
      }
      
      if (data.session) {
        handleSessionChange(data.session);
        return true;
      }
      
      return false;
    } catch (err) {
      logWithTimestamp('Session refresh error', { error: err });
      return false;
    }
  };

  // Initialize auth state on component mount
  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        logWithTimestamp('Initializing auth state');
        const { data } = await supabase.auth.getSession();
        handleSessionChange(data.session);
      } catch (err) {
        console.error('Error getting initial session:', err);
      } finally {
        setLoading(false);
      }
    };
    
    initializeAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // No longer logging every auth state change
      handleSessionChange(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [handleSessionChange]);

  // Add tab visibility handler
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && session) {
        // No longer logging visibility changes
        
        // Simply check if our current session is still valid
        const { data } = await supabase.auth.getSession();
        
        if (!data.session && session) {
          // Our stored session doesn't match Supabase's session
          await refreshSession();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error, data } = await supabase.auth.signInWithPassword({ email, password });
      return { error, success: !error };
    } catch (error) {
      return { error, success: false };
    }
  };

  const signUp = async (email: string, password: string, userData: UserData) => {
    try {
      // Check if username is taken
      const { data: existingUser } = await supabase
        .from('users')
        .select('username')
        .eq('username', userData.username)
        .single();

      if (existingUser) {
        return {
          error: { message: 'Username already taken' },
          success: false,
        };
      }

      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: { data: userData }
      });

      return { error, success: !error && !!data.user };
    } catch (error) {
      return { error, success: false };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error, success: !error };
    } catch (error) {
      return { error, success: false };
    }
  };

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signIn,
    signUp,
    signOut,
    refreshSession,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider; 