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
  const [user, setUser] = useState<User | null>(null);

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
    setUser(newSession?.user ?? null);
    
    // Ensure user profile exists if we have a session
    if (newSession?.user) {
      ensureUserProfile(newSession.user);
    }
  }, [ensureUserProfile]);

  // Function to refresh the session
  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session: newSession } } = await supabase.auth.getSession();
      handleSessionChange(newSession);
      return true;
    } catch (error) {
      console.error('Error refreshing session:', error);
      return false;
    }
  }, [handleSessionChange]);

  // Set up auth state listener
  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        handleSessionChange(initialSession);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      logWithTimestamp('Auth state changed', { event, sessionExists: !!session });

      switch (event) {
        case 'INITIAL_SESSION':
          handleSessionChange(session);
          break;
        case 'SIGNED_IN':
          handleSessionChange(session);
          break;
        case 'SIGNED_OUT':
          handleSessionChange(null);
          break;
        case 'TOKEN_REFRESHED':
          handleSessionChange(session);
          break;
        case 'USER_UPDATED':
          handleSessionChange(session);
          break;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [handleSessionChange]);

  // Add tab visibility handler
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Use setTimeout to avoid potential deadlocks with auth state changes
        setTimeout(async () => {
          await refreshSession();
        }, 0);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshSession]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
        redirectTo: `${window.location.origin}/reset-password#`,
      });
      return { error, success: !error };
    } catch (error) {
      return { error, success: false };
    }
  };

  const value = {
    session,
    user,
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