import { supabase } from './supabase';

export async function initializeDatabase() {
  try {
    // Create users table
    await supabase.rpc('create_users_table');
    
    // Create cards table
    await supabase.rpc('create_cards_table');
    
    // Create trades table
    await supabase.rpc('create_trades_table');
    
    console.log('Database initialized successfully');
    return { success: true, error: null };
  } catch (error) {
    console.error('Error initializing database:', error);
    return { success: false, error };
  }
} 