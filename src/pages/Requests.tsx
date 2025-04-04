import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Trade2, TRADE_STATUS, WishlistItem, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import DbSetupGuide from '../components/DbSetupGuide';
import Notification from '../components/Notification';
import CollapsibleFilters from '../components/CollapsibleFilters';
import { createTrade2 } from '../lib/trades2';

// Cache duration in milliseconds (1 minute)
const CACHE_DURATION = 60 * 1000;
// Debounce delay for data refresh (500ms)
const REFRESH_DEBOUNCE = 500;

type SortColumn = 'name' | 'number' | 'pack' | 'rarity' | 'player' | 'requested';
type SortDirection = 'asc' | 'desc';

const Requests = () => {
  const [trades, setTrades] = useState<Trade2[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [packs, setPacks] = useState<string[]>([]);
  const [rarities, setRarities] = useState<string[]>([]);
  const [elements, setElements] = useState<string[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [packFilter, setPackFilter] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [elementFilter, setElementFilter] = useState('');
  const [hideOffered, setHideOffered] = useState(false);
  
  const [sortColumn, setSortColumn] = useState<SortColumn>('requested');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  const [loading, setLoading] = useState(false);
  const [processingOffers, setProcessingOffers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  
  const { user, refreshSession } = useAuth();

  // Refs to track data loading state and cache
  const dataLoadedRef = useRef(false);
  const lastDataLoadTimeRef = useRef(0);
  const pendingLoadRef = useRef(false);
  const refreshTimeout = useRef<NodeJS.Timeout>();
  
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
    isVisible: boolean;
  }>({
    message: '',
    type: 'success',
    isVisible: false,
  });

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
    if (pendingLoadRef.current || (!forceReload && !needsReload()) || !user) return;
    
    try {
      pendingLoadRef.current = true;
      setLoading(true);
      setError(null);
      
      await refreshSession();
      
      // Load trades2 data first
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades2')
        .select(`
          id,
          status,
          offer_id,
          request_id,
          offered_by,
          offered_to,
          offered_at,
          offer:offer_id (
            id,
            cards:card_id (
              card_name,
              card_number,
              card_element,
              card_rarity,
              pack,
              image_url
            ),
            users:user_id (
              id,
              username,
              friend_code
            )
          ),
          request:request_id (
            id,
            cards:card_id (
              card_name,
              card_number,
              card_element,
              card_rarity,
              pack,
              image_url
            ),
            users:user_id (
              id,
              username,
              friend_code
            )
          ),
          offerer:offered_by (
            id,
            username,
            friend_code
          )
        `)
        .or(`status.eq.${TRADE_STATUS.ACCEPTED},status.eq.${TRADE_STATUS.COMPLETE},status.eq.${TRADE_STATUS.NEGOTIATING},and(status.eq.${TRADE_STATUS.OFFERED},offered_by.eq.${user.id})`)
        .order('offered_at', { ascending: false });

      if (tradesError) throw tradesError;

      // Get all wishlist IDs that are part of accepted or completed trades
      const committedWishlistIds = new Set<string>(
        (tradesData || [])
          .filter((trade: any) => [TRADE_STATUS.ACCEPTED, TRADE_STATUS.COMPLETE].includes(trade.status as TRADE_STATUS))
          .flatMap(trade => [trade.offer_id, trade.request_id])
          .filter(Boolean)
      );

      // Map the trades data to match the Trade2 interface
      setTrades((tradesData || []).map(trade => {
        const mappedTrade: Trade2 = {
          id: trade.id,
          status: trade.status as TRADE_STATUS,
          offer_id: trade.offer_id,
          request_id: trade.request_id,
          offered_by: trade.offered_by,
          offered_to: trade.offered_to,
          offered_at: trade.offered_at || new Date().toISOString(),
          requested_at: null,
          offer: trade.offer?.[0] as unknown as WishlistItem | undefined,
          request: trade.request?.[0] as unknown as WishlistItem | undefined,
          offerer: trade.offerer?.[0] as unknown as User | undefined
        };
        return mappedTrade;
      }));

      // Load wishlist data (only items not owned by current user and not traded)
      const baseQuery = supabase
        .from('wishlists')
        .select(`
          id,
          created_at,
          user_id,
          card_id,
          traded,
          cards:card_id (*),
          users:user_id (*)
        `)
        .neq('user_id', user.id)
        .eq('traded', false)
        .order('created_at', { ascending: false });

      // Only add the ID exclusion if we have IDs to exclude
      const { data: wishlistData, error: wishlistError } = committedWishlistIds.size > 0
        ? await baseQuery.not('id', 'in', `(${Array.from(committedWishlistIds).join(',')})`)
        : await baseQuery;

      if (wishlistError) throw wishlistError;

      const validWishlistItems = (wishlistData || [])
        .filter((item) => item && item.cards && item.users)
        .map(item => item as unknown as WishlistItem);

      setWishlistItems(validWishlistItems);

      // Load filter data
      const { data: cardsData, error: cardsError } = await supabase
        .from('cards')
        .select('pack, card_rarity, card_element');

      if (cardsError) throw cardsError;
      
      if (cardsData) {
        setPacks(Array.from(new Set(cardsData.map(card => card.pack))).filter(Boolean) as string[]);
        setRarities(Array.from(new Set(cardsData.map(card => card.card_rarity))).filter(Boolean) as string[]);
        setElements(Array.from(new Set(cardsData.map(card => card.card_element))).filter(Boolean) as string[]);
      }
      
      lastDataLoadTimeRef.current = Date.now();
      dataLoadedRef.current = true;
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
      pendingLoadRef.current = false;
    }
  }, [user, needsReload, refreshSession]);

  // Debounced refresh function
  const refreshData = useCallback(() => {
    if (refreshTimeout.current) {
      clearTimeout(refreshTimeout.current);
    }
    
    refreshTimeout.current = setTimeout(() => {
      loadData(true);
    }, REFRESH_DEBOUNCE);
  }, [loadData]);

  // Optimistic update helper
  const updateProcessingOffers = useCallback((wishlistId: string, isProcessing: boolean) => {
    setProcessingOffers(prev => {
      const next = new Set(Array.from(prev));
      if (isProcessing) {
        next.add(wishlistId);
      } else {
        next.delete(wishlistId);
      }
      return next;
    });
  }, []);

  // Handle making an offer with optimistic updates
  const handleMakeOffer = async (wishlistId: string) => {
    if (!user) return;
    
    try {
      // Optimistic update
      updateProcessingOffers(wishlistId, true);
      
      const trade = await createTrade2(wishlistId);
      
      if (!trade) throw new Error('Failed to create trade');
      
      // Debounced refresh instead of immediate
      refreshData();
      showNotification('Offer made successfully!', 'success');
    } catch (err) {
      console.error('Error making offer:', err);
      showNotification('Failed to make offer', 'error');
      // Remove from processing set if there's an error
      updateProcessingOffers(wishlistId, false);
    }
  };

  // Check if user has already made an offer for this wishlist item
  const hasUserMadeOffer = useCallback((wishlistId: string) => {
    return trades.some(trade => 
      trade.offer_id === wishlistId && 
      trade.offered_by === user?.id
    );
  }, [trades, user]);

  // Check if a card is part of any accepted or completed trade
  const isCardCommitted = useCallback((wishlistId: string) => {
    return trades.some(trade => 
      (trade.offer_id === wishlistId || trade.request_id === wishlistId) && 
      [TRADE_STATUS.ACCEPTED.toLowerCase(), TRADE_STATUS.COMPLETE.toLowerCase()].includes(trade.status?.toLowerCase())
    );
  }, [trades]);

  // Check if a card is in negotiation
  const isCardInNegotiation = useCallback((wishlistId: string) => {
    return trades.some(trade => 
      (trade.offer_id === wishlistId || trade.request_id === wishlistId) && 
      trade.status === TRADE_STATUS.NEGOTIATING
    );
  }, [trades]);

  // Sort function for wishlist items
  const sortItems = useCallback((items: WishlistItem[]) => {
    return [...items].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      
      switch (sortColumn) {
        case 'name':
          return direction * ((a.cards?.card_name || '').localeCompare(b.cards?.card_name || ''));
        case 'number':
          const aNum = Number(a.cards?.card_number || 0);
          const bNum = Number(b.cards?.card_number || 0);
          return direction * (aNum - bNum);
        case 'pack':
          return direction * ((a.cards?.pack || '').localeCompare(b.cards?.pack || ''));
        case 'rarity':
          return direction * ((a.cards?.card_rarity || '').localeCompare(b.cards?.card_rarity || ''));
        case 'player':
          return direction * ((a.users?.username || '').localeCompare(b.users?.username || ''));
        case 'requested':
          return direction * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        default:
          return 0;
      }
    });
  }, [sortColumn, sortDirection]);

  // Handle sort column change
  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      // If clicking the same column, toggle direction
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // If clicking a new column, set it with default desc direction
      setSortColumn(column);
      setSortDirection('desc');
    }
  }, [sortColumn]);

  // Filter and sort wishlist items
  const filteredWishlistItems = useMemo(() => {
    const filtered = wishlistItems.filter(item => {
      if (!item.cards) return false;
      
      // Check if the card is part of any accepted or completed trade
      if (isCardCommitted(item.id)) return false;

      // Always filter out non-tradeable cards
      if (!item.cards.tradeable) return false;
      
      const matchesSearch = searchQuery === '' || 
        (item.cards.card_name && item.cards.card_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.cards.card_number && String(item.cards.card_number).includes(searchQuery));
      
      const matchesPack = packFilter === '' || item.cards.pack === packFilter;
      const matchesRarity = rarityFilter === '' || item.cards.card_rarity === rarityFilter;
      const matchesElement = elementFilter === '' || item.cards.card_element === elementFilter;
      const matchesOffered = !hideOffered || !hasUserMadeOffer(item.id);
      
      return matchesSearch && matchesPack && matchesRarity && matchesElement && matchesOffered;
    });

    return sortItems(filtered);
  }, [wishlistItems, searchQuery, packFilter, rarityFilter, elementFilter, hideOffered, hasUserMadeOffer, isCardCommitted, sortItems]);

  // Effect for initial load and user changes
  useEffect(() => {
    loadData();
    
    return () => {
      if (refreshTimeout.current) {
        clearTimeout(refreshTimeout.current);
      }
    };
  }, [loadData]);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && needsReload()) {
        loadData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadData, needsReload]);

  return (
    <div className="container py-8">
      <div className="flex flex-col mb-8">
        <h1 className="text-3xl font-bold mb-4">Card Requests</h1>
        <div className="prose max-w-prose mb-8">
          <p className="mb-4">
            The table below shows which cards players need to fill up their TCG Pocket dex.
          </p>
          <p className="mb-4">
            Click "Offer" to let them know you can send them what they need. Then head over to the{' '}
            <a href="/offers" className="text-blue-600 hover:text-blue-800">
              Offers
            </a>{' '}
            page to confirm trades and accept offers on your wishlisted cards.
          </p>
          <p>
            If you haven't added any cards to your wishlist, head over to the{' '}
            <a href="/cards" className="text-blue-600 hover:text-blue-800">
              Cards
            </a>{' '}
            page now.
          </p>
        </div>
      </div>
      
      {error && (
        error.includes('relation') || error.includes('does not exist') ? (
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
          
          <div className="flex items-end lg:col-span-4 space-x-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={hideOffered}
                onChange={(e) => setHideOffered(e.target.checked)}
                className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Hide Offered</span>
            </label>
          </div>
        </div>
      </CollapsibleFilters>
      
      {loading && filteredWishlistItems.length === 0 ? (
        <div className="text-center text-gray-600">Loading requests...</div>
      ) : filteredWishlistItems.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-md">
          <p className="text-lg text-gray-600">No requests found matching your criteria</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-md">
          <table className="w-full table-auto">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
              <tr>
                <th className="px-3 sm:px-6 py-3 sm:hidden">Card</th>
                <th className="hidden sm:table-cell px-6 py-3">Image</th>
                <th 
                  className="hidden sm:table-cell px-6 py-3 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Name
                    {sortColumn === 'name' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="hidden sm:table-cell px-6 py-3 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('number')}
                >
                  <div className="flex items-center">
                    Number
                    {sortColumn === 'number' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="hidden sm:table-cell px-6 py-3 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('pack')}
                >
                  <div className="flex items-center">
                    Pack
                    {sortColumn === 'pack' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="hidden md:table-cell px-6 py-3 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('rarity')}
                >
                  <div className="flex items-center">
                    Rarity
                    {sortColumn === 'rarity' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-3 sm:px-6 py-3 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('player')}
                >
                  <div className="flex items-center">
                    Player
                    {sortColumn === 'player' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="hidden sm:table-cell px-6 py-3 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('requested')}
                >
                  <div className="flex items-center">
                    Requested
                    {sortColumn === 'requested' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-3 sm:px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredWishlistItems.map((item) => {
                const isProcessing = processingOffers.has(item.id);
                const hasOffered = hasUserMadeOffer(item.id);
                const isDisabled = isProcessing || hasOffered || isCardInNegotiation(item.id);

                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 sm:hidden py-4">
                      <div className="flex flex-col">
                        {item.cards?.image_url && (
                          <div className="mb-2">
                            <img 
                              src={item.cards.image_url} 
                              alt={item.cards.card_name || 'Card'}
                              className="h-12 w-auto object-contain rounded"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="font-medium text-gray-900 text-sm">{item.cards?.card_name || 'Unknown Card'}</div>
                        <div className="text-xs text-gray-500">
                          #{String(item.cards?.card_number || '000').padStart(3, '0')}
                          <span className="ml-1">
                            · {item.cards?.pack || 'Unknown Pack'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-6 py-4">
                      {item.cards?.image_url && (
                        <img 
                          src={item.cards.image_url} 
                          alt={item.cards.card_name || 'Card'}
                          className="h-16 w-auto object-contain rounded"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-6 py-4">
                      <div className="font-medium text-gray-900">{item.cards?.card_name || 'Unknown Card'}</div>
                    </td>
                    <td className="hidden sm:table-cell px-6 py-4 text-gray-500">
                      #{String(item.cards?.card_number || '000').padStart(3, '0')}
                    </td>
                    <td className="hidden sm:table-cell px-6 py-4">{item.cards?.pack || 'Unknown Pack'}</td>
                    <td className="hidden md:table-cell px-6 py-4">{item.cards?.card_rarity || 'Unknown Rarity'}</td>
                    <td className="px-3 sm:px-6 py-4">
                      <div className="font-medium text-gray-900 text-sm sm:text-base">{item.users?.username || 'Unknown User'}</div>
                      <div className="text-xs sm:text-sm text-gray-500">{item.users?.friend_code || 'No friend code'}</div>
                    </td>
                    <td className="hidden sm:table-cell px-6 py-4">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 sm:px-6 py-4">
                      <button
                        onClick={() => handleMakeOffer(item.id)}
                        disabled={isDisabled}
                        className={`btn text-xs px-2 sm:px-3 py-1 rounded-md transition-colors w-20 sm:w-28 ${
                          isDisabled
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {hasOffered ? 'Offered' : isCardInNegotiation(item.id) ? 'In Negotiation' : 'Offer'}
                      </button>
                    </td>
                  </tr>
                );
              })}
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

export default Requests; 