import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

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
  traded?: boolean;
}

export interface Trade {
  id: number;
  card_id: string;
  user_id: string;
  offered_by: string | null;
  requested_date: string;
} 