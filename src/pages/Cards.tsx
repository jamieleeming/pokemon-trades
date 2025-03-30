import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase, Card as CardType } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DbSetupGuide from '../components/DbSetupGuide';
import Notification from '../components/Notification';
import CollapsibleFilters from '../components/CollapsibleFilters';

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
  
  // Track if component is mounted
  const isMountedRef = useRef(true);

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

  // Load cards data
  const loadData = useCallback(async () => {
    if (!user || !isMountedRef.current) return;

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
      }
    } catch (err) {
      console.error('Error loading cards:', err);
      setError('Failed to load cards. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

  // Initialize component
  useEffect(() => {
    isMountedRef.current = true;
    
    if (user) {
      loadData();
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [user, loadData]);

  // Handle card selection
  const handleCardSelect = useCallback(async (cardId: string) => {
    if (!user) return;

    try {
      if (selectedCards.includes(cardId)) {
        // Check if the wishlist item has been traded before allowing removal
        const { data: wishlistItem, error: checkError } = await supabase
          .from('wishlists')
          .select('traded')
          .eq('card_id', cardId)
          .eq('user_id', user.id)
          .single();

        if (checkError) throw checkError;

        // If the item has been traded, don't allow removal
        if (wishlistItem?.traded) {
          showNotification('Cannot remove traded cards from wishlist', 'error');
          return;
        }

        // Remove from wishlist only if not traded
        const { error } = await supabase
          .from('wishlists')
          .delete()
          .eq('card_id', cardId)
          .eq('user_id', user.id)
          .eq('traded', false);  // Extra safety check

        if (error) throw error;

        setSelectedCards(prev => prev.filter(id => id !== cardId));
        setCards(prev => prev.map(card => 
          card.id === cardId ? { ...card, wishlisted: false } : card
        ));

        showNotification('Card removed from wishlist', 'success');
      } else {
        // Add to wishlist
        const { error } = await supabase
          .from('wishlists')
          .insert({
            card_id: cardId,
            user_id: user.id,
            traded: false
          });

        if (error) throw error;

        setSelectedCards(prev => [...prev, cardId]);
        setCards(prev => prev.map(card => 
          card.id === cardId ? { ...card, wishlisted: true } : card
        ));

        showNotification('Card added to wishlist', 'success');
      }
    } catch (err) {
      console.error('Error updating wishlist:', err);
      showNotification('Failed to update wishlist', 'error');
    }
  }, [user, selectedCards, showNotification]);

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
                        <div className="absolute top-1 right-1 z-10 rounded-full bg-blue-500 p-1 shadow-sm">
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
                          <span className="hidden sm:inline">•</span>
                          <span className="hidden sm:inline">{card.card_rarity}</span>
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