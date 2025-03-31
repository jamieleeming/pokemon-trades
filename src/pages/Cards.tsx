import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase, Card as CardType } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DbSetupGuide from '../components/DbSetupGuide';
import Notification from '../components/Notification';
import CollapsibleFilters from '../components/CollapsibleFilters';

// Cache duration in milliseconds (1 minute)
const CACHE_DURATION = 60 * 1000;
// Debounce delay for selection updates (500ms)
const SELECTION_DEBOUNCE = 500;

const Cards = () => {
  const [cards, setCards] = useState<CardType[]>([]);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [packFilter, setPackFilter] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [elementFilter, setElementFilter] = useState('');
  const [tradeableOnly, setTradeableOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  
  // Filter options
  const [packs, setPacks] = useState<string[]>([]);
  const [rarities, setRarities] = useState<string[]>([]);
  const [elements, setElements] = useState<string[]>([]);
  
  const { user } = useAuth();
  
  // Refs for caching and loading state
  const isMountedRef = useRef(true);
  const lastLoadTimeRef = useRef(0);
  const isLoadingRef = useRef(false);
  const selectionTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Add type for pending selections
  type PendingSelection = {
    cardId: string;
    action: 'add' | 'remove';
  };

  // Update ref type
  const pendingSelectionsRef = useRef<Set<PendingSelection>>(new Set());

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

  // Check if data needs refresh
  const needsRefresh = useCallback(() => {
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    return timeSinceLastLoad > CACHE_DURATION;
  }, []);

  // Load cards data with caching
  const loadData = useCallback(async (force = false) => {
    if (!user || !isMountedRef.current) return;
    if (isLoadingRef.current) return;
    if (!force && !needsRefresh()) return;

    isLoadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // First get user's wishlist to mark cards as wishlisted
      const { data: wishlistData, error: wishlistError } = await supabase
        .from('wishlists')
        .select('card_id, traded')
        .eq('user_id', user.id)
        .eq('traded', false);  // Only get non-traded items

      if (wishlistError) throw wishlistError;

      const wishlistedCardIds = new Set(wishlistData?.map(item => item.card_id) || []);

      // Then get all cards
      const { data: cardsData, error: cardsError } = await supabase
        .from('cards')
        .select('*')
        .order('pack')
        .order('card_number');

      if (cardsError) throw cardsError;

      if (cardsData) {
        // Process cards data
        const processedCards = cardsData.map(card => ({
          ...card,
          wishlisted: wishlistedCardIds.has(card.id)
        })) as CardType[];

        // Update state
        setCards(processedCards);
        setSelectedCards(Array.from(wishlistedCardIds));

        // Update filter options
        const uniquePacks = Array.from(new Set(cardsData.map(card => card.pack))).filter(Boolean);
        const uniqueRarities = Array.from(new Set(cardsData.map(card => card.card_rarity))).filter(Boolean);
        const uniqueElements = Array.from(new Set(cardsData.map(card => card.card_element))).filter(Boolean);

        setPacks(uniquePacks);
        setRarities(uniqueRarities);
        setElements(uniqueElements);
        
        lastLoadTimeRef.current = Date.now();
      }
    } catch (err) {
      console.error('Error loading cards:', err);
      setError('Failed to load cards. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        isLoadingRef.current = false;
      }
    }
  }, [user, needsRefresh]);

  // Process pending selections
  const processPendingSelections = useCallback(async () => {
    if (!user || pendingSelectionsRef.current.size === 0) return;
    
    const pendingSelections = Array.from(pendingSelectionsRef.current);
    pendingSelectionsRef.current.clear();
    
    try {
      // Group by action
      const toAdd = pendingSelections
        .filter(selection => selection.action === 'add')
        .map(selection => selection.cardId);
      const toRemove = pendingSelections
        .filter(selection => selection.action === 'remove')
        .map(selection => selection.cardId);

      // Handle removals first
      if (toRemove.length > 0) {
        // Check which cards can be removed (not traded)
        const { data: wishlistItems, error: checkError } = await supabase
          .from('wishlists')
          .select('card_id, traded')
          .in('card_id', toRemove)
          .eq('user_id', user.id);

        if (checkError) throw checkError;

        // Filter out traded cards
        const tradedCards = new Set(wishlistItems?.filter(item => item.traded).map(item => item.card_id) || []);
        const safeToRemove = toRemove.filter(cardId => !tradedCards.has(cardId));

        if (tradedCards.size > 0) {
          showNotification('Some traded cards could not be removed from wishlist', 'error');
        }

        if (safeToRemove.length > 0) {
          const { error } = await supabase
            .from('wishlists')
            .delete()
            .in('card_id', safeToRemove)
            .eq('user_id', user.id)
            .eq('traded', false);

          if (error) throw error;
        }
      }

      // Handle additions
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('wishlists')
          .insert(toAdd.map(cardId => ({
            card_id: cardId,
            user_id: user.id,
            traded: false
          })));

        if (error) throw error;
      }

      // Show appropriate notification
      const totalChanges = toAdd.length + toRemove.length;
      showNotification(
        totalChanges > 1 
          ? 'Wishlist updated successfully' 
          : toAdd.length === 1
            ? 'Card added to wishlist'
            : 'Card removed from wishlist',
        'success'
      );
    } catch (err) {
      console.error('Error updating wishlist:', err);
      showNotification('Failed to update wishlist', 'error');
      // Reload data to ensure UI is in sync
      loadData(true);
    }
  }, [user, showNotification, loadData]);

  // Handle card selection with optimistic updates and debouncing
  const handleCardSelect = useCallback((cardId: string) => {
    if (!user) return;

    const isCurrentlySelected = selectedCards.includes(cardId);
    
    // Optimistic update
    setSelectedCards((prev: string[]) => {
      return isCurrentlySelected
        ? prev.filter((id: string) => id !== cardId)
        : [...prev, cardId];
    });
    
    setCards((prev: CardType[]) => prev.map(card => 
      card.id === cardId
        ? { ...card, wishlisted: !card.wishlisted }
        : card
    ));

    // Add to pending selections with the intended action
    pendingSelectionsRef.current.add({
      cardId,
      action: isCurrentlySelected ? 'remove' : 'add'
    });

    // Debounce the processing
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
    }
    
    selectionTimeoutRef.current = setTimeout(() => {
      processPendingSelections();
    }, SELECTION_DEBOUNCE);
  }, [user, selectedCards, processPendingSelections]);

  // Initialize component
  useEffect(() => {
    isMountedRef.current = true;
    
    if (user) {
      loadData();
    }
    
    return () => {
      isMountedRef.current = false;
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, [user, loadData]);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && needsRefresh()) {
        loadData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadData, needsRefresh]);

  // Filter cards
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const matchesSearch = searchQuery === '' || 
        card.card_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(card.card_number).includes(searchQuery);
      
      const matchesPack = packFilter === '' || card.pack === packFilter;
      const matchesRarity = rarityFilter === '' || card.card_rarity === rarityFilter;
      const matchesElement = elementFilter === '' || card.card_element === elementFilter;
      const matchesTradeable = !tradeableOnly || card.tradeable === true;
      const matchesStatus = statusFilter === 'All' || 
        (statusFilter === 'Selected' && selectedCards.includes(card.id)) ||
        (statusFilter === 'Not Selected' && !selectedCards.includes(card.id));
      
      return matchesSearch && matchesPack && matchesRarity && matchesElement && matchesTradeable && matchesStatus;
    });
  }, [cards, searchQuery, packFilter, rarityFilter, elementFilter, tradeableOnly, statusFilter, selectedCards]);

  // Show database setup guide if there's a database error
  if (error?.includes('relation') || error?.includes('does not exist')) {
    return <DbSetupGuide error={error} />;
  }

  // Group cards by pack
  const cardsByPack = filteredCards.reduce((acc, card) => {
    if (!acc[card.pack]) {
      acc[card.pack] = [];
    }
    acc[card.pack].push(card);
    return acc;
  }, {} as Record<string, CardType[]>);

  return (
    <div className="container py-8">
      <div className="flex flex-col mb-8">
        <h1 className="text-3xl font-bold mb-4">Cards</h1>
        <div className="prose max-w-prose mb-8">
          <p className="mb-4">
            Select the cards you want to add to your wishlist. Any cards selected here will appear on the{' '}
            <a href="/requests" className="text-blue-600 hover:text-blue-800">
              Requests
            </a>{' '}
            page.
          </p>
          <p>
          Cards that are not yet tradeable will not appear on the requests page.
          </p>
        </div>
      </div>
      
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      
      {/* Filters */}
      <CollapsibleFilters title="Filters">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
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
          
          {/* Pack filter */}
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
          
          {/* Rarity filter */}
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
          
          {/* Element filter */}
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
          
          {/* Status filter */}
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input"
            >
              <option value="All">All</option>
              <option value="Selected">In Wishlist</option>
              <option value="Not Selected">Not in Wishlist</option>
            </select>
          </div>
          
          {/* Tradeable filter */}
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
      
      {/* Cards grid */}
      {loading && cards.length === 0 ? (
        <div className="text-center text-gray-600">Loading cards...</div>
      ) : (
        Object.entries(cardsByPack)
          .sort(([packA], [packB]) => packA.localeCompare(packB))
          .map(([pack, packCards]) => (
            <div key={pack} className="mb-6">
              <h2 className="mb-2 text-xl sm:text-2xl font-bold text-gray-800 sticky top-16 bg-gray-100 p-2 rounded-lg z-10">{pack}</h2>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {packCards.map((card) => {
                  // Skip cards with missing IDs
                  if (!card || !card.id) {
                    console.warn('Skipping card with missing ID:', card);
                    return null;
                  }
                  
                  // Convert card.id to string to ensure consistent comparison
                  const cardIdString = String(card.id);
                  // Use card.wishlisted property as the primary indicator, fallback to selectedCards
                  const isSelected = card.wishlisted || selectedCards.includes(cardIdString);
                  
                  return (
                    <div
                      key={card.id}
                      className={`relative cursor-pointer rounded-lg bg-white p-2 shadow-md transition-all hover:shadow-lg ${
                        isSelected ? 'ring-2 ring-blue-500' : ''
                      }`}
                      onClick={() => handleCardSelect(cardIdString)}
                    >
                      {isSelected && (
                        <div className="absolute top-1 right-1 z-20 rounded-full bg-blue-500 p-1 shadow-sm">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      <div className="aspect-w-3 aspect-h-4 mb-1">
                        <img
                          src={card.image_url}
                          alt={card.card_name}
                          className="rounded-md object-contain h-full w-full"
                        />
                      </div>
                      <div className="text-center">
                        <h3 className="text-xs font-semibold truncate" title={card.card_name}>{card.card_name}</h3>
                        <div className="flex flex-wrap justify-center text-xs text-gray-600 gap-1">
                          <span>#{card.card_number}</span>
                          <span>•</span>
                          <span>{card.card_rarity}</span>
                          {!card.tradeable && (
                            <>
                              <span>•</span>
                              <span className="text-red-600">Not Tradeable</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
      )}

      {/* Notification */}
      <Notification
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
      />
    </div>
  );
};

export default Cards;