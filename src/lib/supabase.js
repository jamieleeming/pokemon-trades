import { createClient } from '@supabase/supabase-js';
import { logWithTimestamp } from './logging';
import env from './env';

// Log Supabase setup for debugging
console.log('Initializing Supabase client');

// Initialize the Supabase client with values from env.js
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

logWithTimestamp('Supabase client initialized'); 