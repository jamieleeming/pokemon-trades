import { createClient } from '@supabase/supabase-js';
import { logWithTimestamp } from './logging';
import { TRADE_STATUS } from '../types';

if (!process.env.REACT_APP_SUPABASE_URL) {
  throw new Error('Missing env.REACT_APP_SUPABASE_URL');
}

if (!process.env.REACT_APP_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.REACT_APP_SUPABASE_ANON_KEY');
}

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

logWithTimestamp('Initializing Supabase client');

// Create a simple Supabase client with minimal configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: localStorage,
    storageKey: 'pokemon-trades-auth',
  },
  // Disable realtime subscriptions since we don't use them
  realtime: {
    params: {
      eventsPerSecond: 0
    }
  }
});

// Keep track of the last time we checked our connection
let lastConnectionCheck = Date.now();

// Check connection status and authentication
export const checkConnection = async (): Promise<boolean> => {
  try {
    // Throttle checks to once every 30 seconds
    if (Date.now() - lastConnectionCheck < 30000) {
      return true;
    }
    
    lastConnectionCheck = Date.now();
    
    // Check authentication with session call
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !sessionData.session) {
      logWithTimestamp('Auth session check failed', { 
        error: sessionError?.message || 'No session found'
      });
      return false;
    }
    
    return true;
  } catch (err) {
    logWithTimestamp('Connection check error', { error: err });
    return false;
  }
};

// Log auth state changes with less verbosity
supabase.auth.onAuthStateChange((event, session) => {
  // Only log meaningful events
  if (event !== 'TOKEN_REFRESHED') {
    logWithTimestamp('Auth state changed', { event, sessionExists: !!session });
  }
});

// Track tab visibility changes
document.addEventListener('visibilitychange', () => {
  // No longer logging tab visibility changes
});

// Export interface types from types.ts instead of duplicating them here

// Add a simplified fetch wrapper that handles common errors
export const fetchWithErrorHandling = async <T>(
  query: () => Promise<{ data: T; error: any }>, 
  errorMessage: string = 'An error occurred'
) => {
  try {
    const response = await query();
    
    if (response.error) {
      console.error(`${errorMessage}:`, response.error);
      return { data: null, error: response.error };
    }
    
    return { data: response.data, error: null };
  } catch (err) {
    console.error(errorMessage, err);
    // Check connection on error
    return { data: null, error: err };
  }
};

// Database interface types
export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  friend_code: string | null;
  created_at: string;
}

export interface Card {
  id: string;
  pack: string;
  card_number: string;
  card_name: string;
  card_type: string;
  card_rarity: string;
  tradeable: boolean;
  image_url: string;
  card_element: string;
  wishlisted?: boolean;
}

export interface Trade {
  id: number;
  card_id: string;
  user_id: string;
  offered_by: string | null;
  requested_date: string;
  status: TRADE_STATUS;
  wishlist_id: string | null;
} 