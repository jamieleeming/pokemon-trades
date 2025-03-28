import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase, checkConnection, fetchWithErrorHandling } from '../lib/supabase';
import { Card, Trade, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import DbSetupGuide from '../components/DbSetupGuide';
import Notification from '../components/Notification';
import NotificationCenter from '../components/NotificationCenter';
import CollapsibleFilters from '../components/CollapsibleFilters';
import TradeDetailsModal from '../components/TradeDetailsModal';
import { logWithTimestamp } from '../lib/logging';

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Define specific types for the trade details we need for notifications
interface TradeDetailsForNotification {
  id: number;
  card_id: string;
  user_id: string;
  offered_by: string | null;
  card: {
    card_name: string;
    card_element?: string | null;
  };
  user: {
    username: string;
    friend_code?: string;
  };
}

// Define the extended Trade type with joined card, user and offerer information
interface TradeWithRelations extends Omit<Trade, 'card' | 'user'> {
  card: Card;
  user: User;
  offerer?: User | null;
}

const Trades = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [packs, setPacks] = useState<string[]>([]);
  const [rarities, setRarities] = useState<string[]>([]);
  const [elements, setElements] = useState<string[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [packFilter, setPackFilter] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [elementFilter, setElementFilter] = useState('');
  const [tradeableOnly, setTradeableOnly] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [processingTradeId, setProcessingTradeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshButtonVisible, setRefreshButtonVisible] = useState(false);
  
  const { user, refreshSession } = useAuth();

  // Refs to track data loading state and cache
  const dataLoadedRef = useRef(false);
  const lastDataLoadTimeRef = useRef(0);
  const pendingLoadRef = useRef(false);
  
  // Create notification state
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
    isVisible: boolean;
  }>({
    message: '',
    type: 'success',
    isVisible: false,
  });

  // Add new state for modal
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showNotification = useCallback((message: string, type: 'success' | 'error') => {
    setNotification({
      message,
      type,
      isVisible: true,
    });
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, isVisible: false }));
  }, []);

  // Check if data needs to be reloaded
  const needsReload = useCallback(() => {
    if (!dataLoadedRef.current) return true;
    const now = Date.now();
    const timeSinceLastLoad = now - lastDataLoadTimeRef.current;
    return timeSinceLastLoad > CACHE_DURATION;
  }, []);
  
  // Load data with caching
  const loadData = useCallback(async (forceReload = false) => {
    // Return immediately if we're already loading
    if (pendingLoadRef.current) {
      logWithTimestamp('Skipping duplicate load request - already loading');
      return;
    }
    
    // Skip loading if we've loaded recently unless force reload
    if (!forceReload && !needsReload()) {
      logWithTimestamp('Using cached trades data', { 
        age: Date.now() - lastDataLoadTimeRef.current 
      });
      return;
    }
    
    if (!user) return;
    
    try {
      pendingLoadRef.current = true;
      setLoading(true);
      setError(null);
      setRefreshButtonVisible(false);
      
      // Check if we need to refresh session
      logWithTimestamp('Starting data load, checking authentication');
      await refreshSession();
      
      // Simple try-catch for trades loading
      logWithTimestamp('Loading trades data');
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select(`
          *,
          cards:card_id (*),
          users:user_id (*),
          offerers:offered_by (*)
        `)
        .order('requested_date', { ascending: false });

      if (tradesError) {
        throw tradesError;
      }

      // Process trades data - filter out invalid trades
      const validTrades = (tradesData || []).filter((trade) => 
        trade && trade.cards && trade.users
      );
      setTrades(validTrades);
      logWithTimestamp('Trades data loaded', { count: validTrades.length });

      // Load filter data
      const { data: cardsData, error: cardsError } = await supabase
        .from('cards')
        .select('pack, card_rarity, card_element');

      if (cardsError) throw cardsError;
      
      // Process filter data
      if (cardsData) {
        setPacks(Array.from(new Set(cardsData.map(card => card.pack))).filter(Boolean) as string[]);
        setRarities(Array.from(new Set(cardsData.map(card => card.card_rarity))).filter(Boolean) as string[]);
        setElements(Array.from(new Set(cardsData.map(card => card.card_element))).filter(Boolean) as string[]);
      }
      
      // Update cache time
      lastDataLoadTimeRef.current = Date.now();
      dataLoadedRef.current = true;
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please try again.');
      setRefreshButtonVisible(true);
    } finally {
      setLoading(false);
      pendingLoadRef.current = false;
    }
  }, [user, needsReload, refreshSession]);

  // Handle manual refresh button click
  const handleRefresh = useCallback(async () => {
    // Check session validity first
    await refreshSession();
    // Force reload data
    loadData(true);
  }, [loadData, refreshSession]);

  // Load data on mount and when user changes
  useEffect(() => {
    let mounted = true;
    
    const initData = async () => {
      if (!user || !mounted) return;
      
      // Check if we need to load data
      if (needsReload()) {
        await loadData();
      }
    };
    
    initData();
    
    return () => {
      mounted = false;
    };
  }, [user, loadData, needsReload]);

  // Add visibility change handler
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && user) {
        // No longer logging visibility changes
        
        // Check if data is stale when tab becomes visible
        if (needsReload()) {
          // Don't reload automatically, just show refresh button
          setRefreshButtonVisible(true);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, needsReload]);

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
      
      // Force reload data after action
      await loadData(true);
      showNotification('Trade offered successfully!', 'success');
    } catch (err) {
      console.error('Error offering trade:', err);
      showNotification('Failed to offer trade', 'error');
    } finally {
      setActionLoading(false);
      setProcessingTradeId(null);
    }
  };

  // Handle rescinding an offer
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
      
      // Force reload data after action
      await loadData(true);
      showNotification('Trade offer cancelled successfully', 'success');
    } catch (err) {
      console.error('Error cancelling offer:', err);
      showNotification('Failed to cancel offer', 'error');
    } finally {
      setActionLoading(false);
      setProcessingTradeId(null);
    }
  };

  // Filter trades
  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      if (!trade.cards) return false;
      
      const matchesSearch = searchQuery === '' || 
        (trade.cards.card_name && trade.cards.card_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (trade.cards.card_number && String(trade.cards.card_number).includes(searchQuery));
      
      const matchesPack = packFilter === '' || trade.cards.pack === packFilter;
      const matchesRarity = rarityFilter === '' || trade.cards.card_rarity === rarityFilter;
      const matchesElement = elementFilter === '' || trade.cards.card_element === elementFilter;
      const matchesTradeable = !tradeableOnly || trade.cards.tradeable === true;
      
      return matchesSearch && matchesPack && matchesRarity && matchesElement && matchesTradeable;
    });
  }, [trades, searchQuery, packFilter, rarityFilter, elementFilter, tradeableOnly]);

  // Determine if the error is likely a database setup issue
  const isDbSetupIssue = error && (
    error.includes('Database error') || 
    error.includes('relation') || 
    error.includes('does not exist') ||
    error.includes('Failed to fetch')
  );

  // Handle opening the modal with trade details
  const handleOpenTradeDetails = (trade: Trade) => {
    setSelectedTrade(trade);
    setIsModalOpen(true);
  };

  // Handle closing the modal
  const handleCloseTradeDetails = () => {
    setIsModalOpen(false);
    setSelectedTrade(null);
  };

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Available Trades</h1>
      </div>
      
      {error && (
        isDbSetupIssue ? (
          <DbSetupGuide error={error} />
        ) : (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )
      )}
      
      <CollapsibleFilters title="Filters">
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
      </CollapsibleFilters>
      
      {loading && filteredTrades.length === 0 ? (
        <div className="text-center text-gray-600">Loading trades...</div>
      ) : filteredTrades.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-md">
          <p className="text-lg text-gray-600">No trades found matching your criteria</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-md relative">
          {/* Loading overlay */}
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
          
          {/* Desktop version - hidden on small screens */}
          <div className="hidden md:block">
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
                      <div className="flex flex-col">
                        {trade.cards?.image_url && (
                          <div className="mb-2">
                            <img 
                              src={trade.cards.image_url} 
                              alt={trade.cards.card_name || 'Card'}
                              className="h-16 w-auto object-contain rounded"
                              onError={(e) => {
                                // Hide image on error
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="font-medium text-gray-900">{trade.cards?.card_name || 'Unknown Card'}</div>
                        <div className="text-sm text-gray-500">
                          #{String(trade.cards?.card_number || '000').padStart(3, '0')}
                          {trade.cards?.card_element && (
                            <span className="ml-1">· {trade.cards.card_element}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{trade.cards?.pack || 'Unknown Pack'}</td>
                    <td className="px-6 py-4">{trade.cards?.card_rarity || 'Unknown Rarity'}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{trade.users?.username || 'Unknown User'}</div>
                      <div className="text-sm text-gray-500">{trade.users?.friend_code || 'No friend code'}</div>
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
                      {!trade.offered_by && trade.users?.id !== user?.id && (
                        <button
                          onClick={() => handleOfferTrade(trade.id)}
                          className="btn btn-primary text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                          disabled={actionLoading && processingTradeId === trade.id}
                        >
                          {actionLoading && processingTradeId === trade.id ? (
                            <span>Processing...</span>
                          ) : (
                            <span>Offer Trade</span>
                          )}
                        </button>
                      )}
                      {trade.users?.id === user?.id && trade.offered_by && (
                        <div>
                          <span className="text-sm font-medium text-green-600">
                            {trade.offerers ? (
                              <>Offered by {trade.offerers.username || 'Unknown User'}</>
                            ) : (
                              <>Offered by Unknown User</>
                            )}
                          </span>
                          {trade.offerers?.friend_code && (
                            <div className="mt-1 text-xs text-gray-500">
                              Friend Code: {trade.offerers.friend_code}
                            </div>
                          )}
                        </div>
                      )}
                      {trade.users?.id === user?.id && !trade.offered_by && (
                        <span className="text-sm font-medium text-gray-500">Your request</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Mobile version - visible only on small screens */}
          <div className="md:hidden divide-y divide-gray-200">
            {filteredTrades.map((trade) => (
              <div key={trade.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center space-x-3">
                  {/* Card thumbnail */}
                  {trade.cards?.image_url && (
                    <div className="flex-shrink-0">
                      <img 
                        src={trade.cards.image_url} 
                        alt={trade.cards.card_name || 'Card'}
                        className="h-16 w-auto object-contain rounded"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  
                  {/* Card info */}
                  <div className="flex-grow">
                    <div className="font-medium text-gray-900 text-sm">{trade.cards?.card_name || 'Unknown Card'}</div>
                    
                    {/* Card details in a single row */}
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                      <span className="text-xs text-gray-600">
                        #{String(trade.cards?.card_number || '000').padStart(3, '0')}
                      </span>
                      
                      {trade.offered_by ? (
                        <span className="inline-block rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800">
                          Offer Available
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs font-semibold text-yellow-800">
                          Searching
                        </span>
                      )}
                    </div>
                    
                    {/* User info */}
                    <div className="mt-1 text-xs">
                      {trade.users?.id !== user?.id ? (
                        <span className="text-gray-600">
                          Requested by: {trade.users?.username || 'Unknown User'}
                        </span>
                      ) : (
                        <span className="text-gray-600 italic">
                          Your request
                        </span>
                      )}
                      
                      {trade.users?.id === user?.id && trade.offered_by && trade.offerers && (
                        <span className="text-green-600 ml-2">
                          Offered by: {trade.offerers.username || 'Unknown User'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex-shrink-0 flex flex-col items-center justify-center space-y-2">
                    {!trade.offered_by && trade.users?.id !== user?.id && (
                      <button
                        onClick={() => handleOfferTrade(trade.id)}
                        className="btn btn-primary text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors w-20 text-center"
                        disabled={actionLoading && processingTradeId === trade.id}
                      >
                        {actionLoading && processingTradeId === trade.id ? (
                          <span>...</span>
                        ) : (
                          <span>Offer</span>
                        )}
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleOpenTradeDetails(trade)}
                      className="text-xs font-medium px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors w-20 text-center"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Trade details modal */}
      <TradeDetailsModal
        trade={selectedTrade}
        isOpen={isModalOpen}
        onClose={handleCloseTradeDetails}
        onOfferTrade={handleOfferTrade}
        isProcessing={actionLoading}
        processingTradeId={processingTradeId}
      />
      
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