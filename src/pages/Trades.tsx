import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Trade, User } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DbSetupGuide from '../components/DbSetupGuide';
import Notification from '../components/Notification';

const Trades = () => {
  const [trades, setTrades] = useState<any[]>([]);
  const [packs, setPacks] = useState<string[]>([]);
  const [rarities, setRarities] = useState<string[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [packFilter, setPackFilter] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [tradeableOnly, setTradeableOnly] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
  
  // Notification state
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
    isVisible: boolean;
  }>({
    message: '',
    type: 'success',
    isVisible: false,
  });
  
  const { user } = useAuth();

  // Helper to show notifications
  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({
      message,
      type,
      isVisible: true,
    });
  };

  // Close notification
  const hideNotification = () => {
    setNotification(prev => ({
      ...prev,
      isVisible: false,
    }));
  };

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        setLoading(true);
        setError(null);
        setDebug(null);
        
        // Check if the user is authenticated
        if (!user && process.env.NODE_ENV === 'development') {
          console.log('No user is authenticated. Some features may be limited.');
        }
        
        // First check if the cards table exists
        const { data: tableInfo, error: tableError } = await supabase
          .from('cards')
          .select('*', { count: 'exact', head: true });
        
        if (tableError) {
          setDebug(`Table check error: ${tableError.message}`);
          throw new Error(`Database error: ${tableError.message}`);
        }
        
        // Fetch unique packs for filters
        const { data: packsData, error: packsError } = await supabase
          .from('cards')
          .select('pack')
          .order('pack');
        
        if (packsError) {
          setDebug(`Packs error: ${packsError.message}`);
          throw new Error(`Failed to fetch packs: ${packsError.message}`);
        }
        
        // Fetch unique rarities for filters
        const { data: raritiesData, error: raritiesError } = await supabase
          .from('cards')
          .select('card_rarity')
          .order('card_rarity');
        
        if (raritiesError) {
          setDebug(`Rarities error: ${raritiesError.message}`);
          throw new Error(`Failed to fetch rarities: ${raritiesError.message}`);
        }
        
        if (packsData) {
          const uniquePacks = Array.from(new Set(packsData.map(item => item.pack)));
          
          // Custom sort to ensure "Promo A" appears last
          uniquePacks.sort((a, b) => {
            // If "Promo A" is being compared, it should always be placed last
            if (a === 'Promo A') return 1;
            if (b === 'Promo A') return -1;
            // Otherwise, use standard alphabetical sorting
            return a.localeCompare(b);
          });
          
          setPacks(uniquePacks);
        }
        
        if (raritiesData) {
          const uniqueRarities = Array.from(new Set(raritiesData.map(item => item.card_rarity)));
          setRarities(uniqueRarities);
        }
        
        // Fetch trades with cards and user info
        const { data: tradesData, error: tradesError } = await supabase
          .from('trades')
          .select(`
            id,
            card_id,
            user_id,
            offered_by,
            requested_date,
            card:card_id(
              id, 
              pack, 
              card_number, 
              card_name, 
              card_type, 
              card_rarity,
              tradeable
            ),
            user:user_id(
              id,
              username,
              friend_code
            )
          `)
          .order('requested_date', { ascending: false });
        
        if (tradesError) {
          setDebug(`Trades query error: ${tradesError.message}`);
          throw new Error(`Failed to fetch trades: ${tradesError.message}`);
        }
        
        if (tradesData) {
          setTrades(tradesData);
        } else {
          // No error but also no data
          setTrades([]);
          setDebug('No trades found in the database');
        }
      } catch (error) {
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError('An unexpected error occurred');
          setDebug('Error is not an instance of Error class');
        }
        console.error('Trades fetch error:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTrades();
  }, [user]);

  const handleOfferTrade = async (tradeId: number) => {
    if (!user) return;
    
    try {
      // First, log the values to help with debugging
      console.log(`Offering trade ID: ${tradeId}, User ID: ${user.id}`);
      
      // Disable the button during processing to prevent double clicks
      setLoading(true);
      
      // Make sure the user exists in the users table
      // This is needed because of the foreign key constraint
      const { data: existingUser, error: userCheckError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
        
      // If user doesn't exist or there's an error, create or update the user
      if (userCheckError || !existingUser) {
        console.log('User not found in database, creating/updating user record');
        
        // Get user details from auth context
        const userData = {
          id: user.id,
          email: user.email,
          username: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          // Add any other fields required by your users table
        };
        
        // Upsert the user (insert if not exists, update if exists)
        const { error: upsertError } = await supabase
          .from('users')
          .upsert(userData, { onConflict: 'id' });
          
        if (upsertError) {
          console.error('Error creating/updating user:', upsertError);
          throw new Error(`Failed to create user record: ${upsertError.message}`);
        }
      }
      
      // First check if the trade is still available (not already offered by someone else)
      const { data: checkData, error: checkError } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .is('offered_by', null)
        .single();
      
      if (checkError) {
        console.error('Error checking trade availability:', checkError);
        throw new Error(`Trade validation error: ${checkError.message}`);
      }
      
      if (!checkData) {
        throw new Error('This trade is no longer available');
      }
      
      // Log the trade details to help debug
      console.log('Trade details before update:', checkData);
      
      // If we get here, the trade is available to be offered
      const { data, error, status, statusText } = await supabase
        .from('trades')
        .update({ offered_by: user.id })
        .eq('id', tradeId)
        .select();
      
      // Log more detailed response information
      console.log('Update response:', { data, status, statusText });
      
      if (error) {
        console.error('Error updating trade:', error);
        setDebug(`Trade update error: ${error.message}`);
        throw error;
      }
      
      // Log the returned data for debugging
      console.log('Update result:', data);
      
      if (data && data.length > 0) {
        // Update the local state
        setTrades(prevTrades => 
          prevTrades.map(trade => 
            trade.id === tradeId ? { ...trade, offered_by: user.id } : trade
          )
        );
        
        // Show success notification
        showNotification('Trade offer submitted successfully!', 'success');
      } else {
        // The update query ran successfully but no rows were affected
        // Let's try to get the current state of the trade to see what happened
        const { data: currentTrade } = await supabase
          .from('trades')
          .select('*')
          .eq('id', tradeId)
          .single();
          
        console.log('Current trade state:', currentTrade);
        
        if (currentTrade && currentTrade.offered_by) {
          throw new Error('This trade has been claimed by another user. Please refresh the page.');
        } else if (currentTrade && currentTrade.user_id === user.id) {
          throw new Error('You cannot offer a trade for your own request.');
        } else {
          // Generic case for when we don't know exactly what happened
          throw new Error('Unable to update the trade. You may not have permission to offer this trade.');
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Trade offer error:', error);
        showNotification(error.message, 'error');
      } else {
        showNotification('An error occurred while offering the trade', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredTrades = trades.filter(trade => {
    const matchesSearch = searchQuery === '' || 
      trade.card.card_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(trade.card.card_number).includes(searchQuery);
    
    const matchesPack = packFilter === '' || trade.card.pack === packFilter;
    
    const matchesRarity = rarityFilter === '' || trade.card.card_rarity === rarityFilter;
    
    const matchesTradeable = !tradeableOnly || trade.card.tradeable;
    
    return matchesSearch && matchesPack && matchesRarity && matchesTradeable;
  });

  // Determine if the error is likely a database setup issue
  const isDbSetupIssue = error && (
    error.includes('Database error') || 
    error.includes('relation') || 
    error.includes('does not exist') ||
    error.includes('Failed to fetch')
  );

  return (
    <div className="container py-8">
      <h1 className="mb-8 text-3xl font-bold">Community Trades</h1>
      
      {error && (
        isDbSetupIssue ? (
          <DbSetupGuide error={error} />
        ) : (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
            {debug && process.env.NODE_ENV === 'development' && (
              <div className="mt-2 text-xs border-t border-red-200 pt-2">
                <strong>Debug info:</strong> {debug}
              </div>
            )}
          </div>
        )
      )}
      
      <div className="mb-6 rounded-lg bg-white p-4 shadow-md">
        <h2 className="mb-4 text-xl font-semibold">Filters</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="search" className="mb-1 block text-sm font-medium text-gray-700">
              Search
            </label>
            <input
              id="search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Card name or number"
              className="form-input"
            />
          </div>
          
          <div>
            <label htmlFor="pack" className="mb-1 block text-sm font-medium text-gray-700">
              Booster Pack
            </label>
            <select
              id="pack"
              value={packFilter}
              onChange={(e) => setPackFilter(e.target.value)}
              className="form-input"
            >
              <option value="">All Packs</option>
              {packs.map((pack) => (
                <option key={pack} value={pack}>
                  {pack}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="rarity" className="mb-1 block text-sm font-medium text-gray-700">
              Rarity
            </label>
            <select
              id="rarity"
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value)}
              className="form-input"
            >
              <option value="">All Rarities</option>
              {rarities.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={tradeableOnly}
                onChange={(e) => setTradeableOnly(e.target.checked)}
                className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Tradeable Only</span>
            </label>
          </div>
        </div>
      </div>
      
      {loading ? (
        <div className="text-center text-gray-600">Loading trades...</div>
      ) : filteredTrades.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-md">
          <p className="text-lg text-gray-600">No trades found matching your criteria</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-md">
          <table className="w-full table-auto">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
              <tr>
                <th className="px-6 py-3">Card</th>
                <th className="px-6 py-3">Pack</th>
                <th className="px-6 py-3">Rarity</th>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Date Requested</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTrades.map((trade) => (
                <tr key={trade.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{trade.card.card_name}</div>
                    <div className="text-sm text-gray-500">#{String(trade.card.card_number).padStart(3, '0')}</div>
                  </td>
                  <td className="px-6 py-4">{trade.card.pack}</td>
                  <td className="px-6 py-4">{trade.card.card_rarity}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{trade.user.username}</div>
                    <div className="text-sm text-gray-500">{trade.user.friend_code || 'No friend code'}</div>
                  </td>
                  <td className="px-6 py-4">
                    {new Date(trade.requested_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    {trade.offered_by ? (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                        Offer Available
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
                        Searching
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {!trade.offered_by && trade.user_id !== user?.id && (
                      <button
                        onClick={() => handleOfferTrade(trade.id)}
                        className="btn btn-primary text-xs"
                      >
                        Offer Trade
                      </button>
                    )}
                    {trade.offered_by === user?.id && (
                      <span className="text-sm font-medium text-blue-600">You offered this trade</span>
                    )}
                    {trade.user_id === user?.id && (
                      <span className="text-sm font-medium text-gray-500">Your request</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <Notification
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
      />
    </div>
  );
};

export default Trades; 