import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { logWithTimestamp } from '../lib/logging';

// Cache duration for session refresh (1 minute)
const SESSION_CACHE_DURATION = 60 * 1000;
// Debounce delay for visibility changes (500ms)
const VISIBILITY_DEBOUNCE = 500;

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
  checkUsername: (username: string) => Promise<boolean>;
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
  checkUsername: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  // Refs for caching and debouncing
  const lastSessionRefreshRef = useRef(0);
  const visibilityTimeoutRef = useRef<NodeJS.Timeout>();
  const profileCheckedRef = useRef(new Set<string>());

  // Function to check if session needs refresh
  const needsSessionRefresh = useCallback(() => {
    const now = Date.now();
    return now - lastSessionRefreshRef.current > SESSION_CACHE_DURATION;
  }, []);

  // Function to update the user profile or create it if needed
  const ensureUserProfile = useCallback(async (user: User) => {
    // Skip if we've already checked this user's profile in this session
    if (profileCheckedRef.current.has(user.id)) return;

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
      
      // Mark this user's profile as checked
      profileCheckedRef.current.add(user.id);
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
    
    // Update last refresh time
    lastSessionRefreshRef.current = Date.now();
  }, [ensureUserProfile]);

  // Function to refresh the session
  const refreshSession = useCallback(async (force = false): Promise<boolean> => {
    if (!force && !needsSessionRefresh()) return true;

    try {
      const { data: { session: newSession } } = await supabase.auth.getSession();
      handleSessionChange(newSession);
      return true;
    } catch (error) {
      console.error('Error refreshing session:', error);
      return false;
    }
  }, [handleSessionChange, needsSessionRefresh]);

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
        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
        case 'USER_UPDATED':
          handleSessionChange(session);
          break;
        case 'SIGNED_OUT':
          handleSessionChange(null);
          // Clear profile check cache on sign out
          profileCheckedRef.current.clear();
          break;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [handleSessionChange]);

  // Add tab visibility handler with debouncing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (visibilityTimeoutRef.current) {
          clearTimeout(visibilityTimeoutRef.current);
        }
        
        visibilityTimeoutRef.current = setTimeout(() => {
          refreshSession();
        }, VISIBILITY_DEBOUNCE);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
      }
    };
  }, [refreshSession]);

  // Username availability check with caching
  const usernameCache = useRef(new Map<string, { result: boolean; timestamp: number }>());
  
  const checkUsername = useCallback(async (username: string): Promise<boolean> => {
    // Check cache first
    const cached = usernameCache.current.get(username);
    if (cached && Date.now() - cached.timestamp < SESSION_CACHE_DURATION) {
      return cached.result;
    }

    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('username')
        .eq('username', username)
        .single();

      const result = !existingUser;
      // Cache the result
      usernameCache.current.set(username, {
        result,
        timestamp: Date.now()
      });
      return result;
    } catch {
      return false;
    }
  }, []);

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
      // Check if username is taken using cached function
      const isAvailable = await checkUsername(userData.username);
      if (!isAvailable) {
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
    // Clear caches
    usernameCache.current.clear();
    profileCheckedRef.current.clear();
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
    checkUsername,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider; 