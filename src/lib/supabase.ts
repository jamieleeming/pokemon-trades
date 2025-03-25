import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anonymous Key is missing!');
}

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Initialize database interfaces based on the schema
export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  friend_code: string | null;
  created_at: string;
}

export interface Card {
  id: number;
  pack: string;
  card_number: string;
  card_name: string;
  card_type: string;
  card_rarity: string;
  tradeable: boolean;
}

export interface Trade {
  id: number;
  user_id: string;
  card_id: number;
  offered_by: string | null;
  requested_date: string;
  card?: Card;
  user?: User;
  offered_by_user?: User;
} 