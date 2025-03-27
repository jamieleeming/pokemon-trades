import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, Trade, User } from '../types';
import DbSetupGuide from '../components/DbSetupGuide';
import Notification from '../components/Notification';

// Define specific types for the trade details we need for notifications
interface TradeDetailsForNotification {
  card_name: string;
  username: string;
}

const Trades = () => {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [processingTradeId, setProcessingTradeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [packFilter, setPackFilter] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [elementFilter, setElementFilter] = useState('');
  const [tradeableOnly, setTradeableOnly] = useState(false);
  
  // Filter options
  const [packs, setPacks] = useState<string[]>([]);
  const [rarities, setRarities] = useState<string[]>([]);
  const [elements, setElements] = useState<string[]>([]);

  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
    isVisible: boolean;
  }>({
    message: '',
    type: 'success',
    isVisible: false,
  });

  // Helper to show notifications
  const showNotification = useCallback((message: string, type: 'success' | 'error') => {
    setNotification({
      message,
      type,
      isVisible: true,
    });
  }, []);

  // Close notification
  const hideNotification = useCallback(() => {
    setNotification(prev => ({
      ...prev,
      isVisible: false,
    }));
  }, []);

  // Load filter data
  const loadFilterData = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data: cardsData, error } = await supabase
        .from('cards')
        .select('pack, card_rarity, card_element');
      
      if (error) throw error;
      
      if (cardsData) {
        const uniquePacks = Array.from(new Set(cardsData.map(card => card.pack))).filter(Boolean);
        const uniqueRarities = Array.from(new Set(cardsData.map(card => card.card_rarity))).filter(Boolean);
        const uniqueElements = Array.from(new Set(cardsData.map(card => card.card_element))).filter(Boolean);
        
        setPacks(uniquePacks);
        setRarities(uniqueRarities);
        setElements(uniqueElements);
      }
    } catch (err) {
      console.error('Error loading filter data:', err);
    }
  }, [user]);

  // Load trades data
  const loadData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select(`
          *,
          cards:card_id (*),
          users:user_id (*),
          offerers:offered_by (*)
        `)
        .order('requested_date', { ascending: false });

      if (tradesError) throw tradesError;

      // Filter out trades with missing required data
      const validTrades = (tradesData || []).filter(trade => 
        trade && trade.cards && trade.users
      );

      setTrades(validTrades);
      loadFilterData();
    } catch (err) {
      console.error('Error loading trades:', err);
      setError('Failed to load trades. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, loadFilterData]);

  // Initialize component
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Handle offering a trade
  const handleOfferTrade = async (tradeId: number) => {
    if (!user) return;

    try {
      setProcessingTradeId(tradeId);
      setActionLoading(true);

      const { error } = await supabase
        .from('trades')
        .update({ offered_by: user.id })
        .eq('id', tradeId);

      if (error) throw error;

      showNotification('Trade offer sent successfully!', 'success');
      loadData();
    } catch (err) {
      console.error('Error offering trade:', err);
      showNotification('Failed to offer trade', 'error');
    } finally {
      setProcessingTradeId(null);
      setActionLoading(false);
    }
  };

  // Handle rescinding a trade offer
  const handleRescindOffer = async (tradeId: number) => {
    if (!user) return;

    try {
      setProcessingTradeId(tradeId);
      setActionLoading(true);

      const { error } = await supabase
        .from('trades')
        .update({ offered_by: null })
        .eq('id', tradeId)
        .eq('offered_by', user.id);

      if (error) throw error;

      showNotification('Trade offer rescinded successfully!', 'success');
      loadData();
    } catch (err) {
      console.error('Error rescinding trade:', err);
      showNotification('Failed to rescind trade offer', 'error');
    } finally {
      setProcessingTradeId(null);
      setActionLoading(false);
    }
  };

  // Memoize filtered trades
  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      if (!trade.cards) return false;
      
      const matchesSearch = searchQuery === '' || 
        trade.cards.card_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(trade.cards.card_number).includes(searchQuery);
      
      const matchesPack = packFilter === '' || trade.cards.pack === packFilter;
      const matchesRarity = rarityFilter === '' || trade.cards.card_rarity === rarityFilter;
      const matchesElement = elementFilter === '' || trade.cards.card_element === elementFilter;
      const matchesTradeable = !tradeableOnly || trade.cards.tradeable === true;
      
      return matchesSearch && matchesPack && matchesRarity && matchesElement && matchesTradeable;
    });
  }, [trades, searchQuery, packFilter, rarityFilter, elementFilter, tradeableOnly]);

  // Show database setup guide if there's a database error
  if (error?.includes('relation') || error?.includes('does not exist')) {
    return <DbSetupGuide error={error} />;
  }

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Community Trades</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
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
          
          <div>
            <label htmlFor="element" className="mb-1 block text-sm font-medium text-gray-700">
              Element
            </label>
            <select
              id="element"
              value={elementFilter}
              onChange={(e) => setElementFilter(e.target.value)}
              className="form-input"
            >
              <option value="">All Elements</option>
              {elements.map((element) => (
                <option key={element} value={element}>
                  {element}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end lg:col-span-4">
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

      <div className="overflow-hidden rounded-lg bg-white shadow-md">
        {loading && (
          <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
            <div className="text-center">
              <svg className="animate-spin h-8 w-8 mx-auto text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-2 text-blue-600 font-medium">Loading trades...</p>
            </div>
          </div>
        )}
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
            {filteredTrades.map((trade) => {
              if (!trade.cards || !trade.users) return null;

              return (
                <tr key={trade.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      {trade.cards.image_url && (
                        <div className="mb-2">
                          <img
                            src={trade.cards.image_url}
                            alt={trade.cards.card_name}
                            className="h-16 w-auto object-contain rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      <div className="font-medium text-gray-900">{trade.cards.card_name}</div>
                      <div className="text-sm text-gray-500">
                        #{String(trade.cards.card_number).padStart(3, '0')}
                        {trade.cards.card_element && (
                          <span className="ml-1">· {trade.cards.card_element}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">{trade.cards.pack}</td>
                  <td className="px-6 py-4">{trade.cards.card_rarity}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{trade.users.username}</div>
                    <div className="text-sm text-gray-500">{trade.users.friend_code || 'No friend code'}</div>
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
                        disabled={actionLoading && processingTradeId === trade.id}
                      >
                        {actionLoading && processingTradeId === trade.id ? (
                          <span>Processing...</span>
                        ) : (
                          <span>Offer Trade</span>
                        )}
                      </button>
                    )}
                    {trade.offered_by === user?.id && (
                      <button
                        onClick={() => handleRescindOffer(trade.id)}
                        className="btn btn-secondary text-xs"
                        disabled={actionLoading && processingTradeId === trade.id}
                      >
                        {actionLoading && processingTradeId === trade.id ? (
                          <span>Processing...</span>
                        ) : (
                          <span>Cancel Offer</span>
                        )}
                      </button>
                    )}
                    {trade.user_id === user?.id && trade.offered_by && trade.offerers && (
                      <div>
                        <span className="text-sm font-medium text-green-600">
                          Offered by {trade.offerers.username}
                        </span>
                        {trade.offerers.friend_code && (
                          <div className="mt-1 text-xs text-gray-500">
                            Friend Code: {trade.offerers.friend_code}
                          </div>
                        )}
                      </div>
                    )}
                    {trade.user_id === user?.id && !trade.offered_by && (
                      <span className="text-sm font-medium text-gray-500">Your request</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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