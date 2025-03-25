import { supabase } from '../lib/supabase';

/**
 * Checks if the required tables exist and creates sample data if needed
 * This is for development purposes only
 */
export const initDatabase = async () => {
  try {
    console.log('Checking database setup...');

    // Check if cards table exists and has data
    const { count: cardsCount, error: cardsError } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true });

    if (cardsError) {
      console.error('Error checking cards table:', cardsError.message);
      return { success: false, error: cardsError.message };
    }

    // If no cards exist, create sample data
    if (cardsCount === 0) {
      console.log('No cards found. Creating sample data...');
      
      // Insert sample card data
      const sampleCards = [
        {
          pack: 'Base Set',
          card_number: 1,
          card_name: 'Bulbasaur',
          card_type: 'Grass',
          card_rarity: 'Common',
          tradeable: true
        },
        {
          pack: 'Base Set',
          card_number: 4,
          card_name: 'Charmander',
          card_type: 'Fire',
          card_rarity: 'Common',
          tradeable: true
        },
        {
          pack: 'Base Set',
          card_number: 7,
          card_name: 'Squirtle',
          card_type: 'Water',
          card_rarity: 'Common',
          tradeable: true
        },
        {
          pack: 'Base Set',
          card_number: 25,
          card_name: 'Pikachu',
          card_type: 'Electric',
          card_rarity: 'Common',
          tradeable: true
        },
        {
          pack: 'Base Set',
          card_number: 94,
          card_name: 'Gengar',
          card_type: 'Psychic',
          card_rarity: 'Rare',
          tradeable: false
        },
        {
          pack: 'Jungle',
          card_number: 12,
          card_name: 'Flareon',
          card_type: 'Fire',
          card_rarity: 'Rare',
          tradeable: true
        },
        {
          pack: 'Jungle',
          card_number: 19,
          card_name: 'Jigglypuff',
          card_type: 'Normal',
          card_rarity: 'Common',
          tradeable: true
        },
        {
          pack: 'Fossil',
          card_number: 1,
          card_name: 'Aerodactyl',
          card_type: 'Rock',
          card_rarity: 'Rare',
          tradeable: false
        }
      ];

      const { error: insertCardsError } = await supabase
        .from('cards')
        .insert(sampleCards);

      if (insertCardsError) {
        console.error('Error inserting sample cards:', insertCardsError.message);
        return { success: false, error: insertCardsError.message };
      }

      console.log('Sample cards created successfully');
    } else {
      console.log(`Cards table exists with ${cardsCount} records`);
    }

    // Check if users table has the current user's data
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error('Error getting current user:', userError.message);
      return { success: false, error: userError.message };
    }

    if (userData.user) {
      // Check if user exists in users table
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error checking user profile:', profileError.message);
        return { success: false, error: profileError.message };
      }

      // If user doesn't exist in users table, add them
      if (!profileData) {
        const { error: insertUserError } = await supabase
          .from('users')
          .insert({
            id: userData.user.id,
            email: userData.user.email,
            name: userData.user.user_metadata?.name || 'User',
            username: userData.user.user_metadata?.username || `user_${userData.user.id.substring(0, 8)}`,
            friend_code: userData.user.user_metadata?.friend_code || null
          });

        if (insertUserError) {
          console.error('Error inserting user profile:', insertUserError.message);
          return { success: false, error: insertUserError.message };
        }

        console.log('User profile created successfully');
      } else {
        console.log('User profile already exists');
      }
    }

    console.log('Database check completed successfully');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error during database initialization:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during database initialization' 
    };
  }
}; 