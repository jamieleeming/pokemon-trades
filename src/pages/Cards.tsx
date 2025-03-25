import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DbSetupGuide from '../components/DbSetupGuide';
import Notification from '../components/Notification';

const Cards = () => {
  const [cards, setCards] = useState<any[]>([]);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
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
  const [tradeableOnly, setTradeableOnly] = useState(false);
  
  // Filter options
  const [packs, setPacks] = useState<string[]>([]);
  const [rarities, setRarities] = useState<string[]>([]);
  
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

  // Fetch cards and user's selected cards
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // First check if the cards table exists
        const { data: tableInfo, error: tableError } = await supabase
          .from('cards')
          .select('*', { count: 'exact', head: true });
        
        if (tableError) {
          setError(`Database error: ${tableError.message}`);
          return;
        }
        
        // Fetch available packs for filters
        const { data: packsData } = await supabase
          .from('cards')
          .select('pack')
          .order('pack');
        
        const { data: raritiesData } = await supabase
          .from('cards')
          .select('card_rarity')
          .order('card_rarity');
        
        if (packsData) {
          // Filter unique values client-side
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
          // Filter unique values client-side
          const uniqueRarities = Array.from(new Set(raritiesData.map(item => item.card_rarity)));
          setRarities(uniqueRarities);
        }
        
        // Fetch all cards
        const { data: cardsData, error: cardsError } = await supabase
          .from('cards')
          .select('*')
          .order('pack')
          .order('card_number');
        
        if (cardsError) throw cardsError;
        
        if (cardsData) {
          setCards(cardsData);
          
          // Fetch user's selected cards (trades)
          const { data: userTrades, error: tradesError } = await supabase
            .from('trades')
            .select('card_id')
            .eq('user_id', user.id);
          
          if (tradesError) throw tradesError;
          
          if (userTrades) {
            setSelectedCards(userTrades.map(trade => trade.card_id));
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError('An error occurred while fetching cards');
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [user]);

  // Toggle card selection
  const toggleCardSelection = async (cardId: number) => {
    if (!user) return;
    
    try {
      if (selectedCards.includes(cardId)) {
        // User wants to remove the card
        const { error } = await supabase
          .from('trades')
          .delete()
          .eq('user_id', user.id)
          .eq('card_id', cardId);
        
        if (error) throw error;
        
        // Update local state
        setSelectedCards(prev => prev.filter(id => id !== cardId));
        
        // Show success notification
        showNotification('Card removed from your want list', 'success');
      } else {
        // User wants to add the card
        const { error } = await supabase
          .from('trades')
          .insert([{ user_id: user.id, card_id: cardId }]);
        
        if (error) throw error;
        
        // Update local state
        setSelectedCards(prev => [...prev, cardId]);
        
        // Show success notification
        showNotification('Card added to your want list', 'success');
      }
    } catch (error) {
      if (error instanceof Error) {
        showNotification(error.message, 'error');
      } else {
        showNotification('An error occurred while updating your selection', 'error');
      }
    }
  };

  // Filter cards based on search and filters
  const filteredCards = cards.filter(card => {
    // Search query filter
    const matchesSearch = searchQuery === '' || 
      card.card_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(card.card_number).includes(searchQuery);
    
    // Pack filter
    const matchesPack = packFilter === '' || card.pack === packFilter;
    
    // Rarity filter
    const matchesRarity = rarityFilter === '' || card.card_rarity === rarityFilter;
    
    // Tradeable filter
    const matchesTradeable = !tradeableOnly || card.tradeable;
    
    return matchesSearch && matchesPack && matchesRarity && matchesTradeable;
  });

  // Group cards by pack
  const cardsByPack = filteredCards.reduce((acc, card) => {
    if (!acc[card.pack]) {
      acc[card.pack] = [];
    }
    acc[card.pack].push(card);
    return acc;
  }, {} as Record<string, any[]>);

  // Sort cards within each pack by card_number (now an integer)
  Object.keys(cardsByPack).forEach(pack => {
    cardsByPack[pack].sort((a: any, b: any) => {
      return a.card_number - b.card_number;
    });
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
      <h1 className="mb-8 text-3xl font-bold">Select Cards You Want</h1>
      
      {error && (
        isDbSetupIssue ? (
          <DbSetupGuide error={error} />
        ) : (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )
      )}
      
      {/* Filters */}
      <div className="mb-6 rounded-lg bg-white p-4 shadow-md">
        <h2 className="mb-4 text-xl font-semibold">Filters</h2>
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
          
          {/* Tradeable filter */}
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
      
      {/* Cards grid */}
      {loading ? (
        <div className="text-center text-gray-600">Loading cards...</div>
      ) : Object.keys(cardsByPack).length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-md">
          <p className="text-lg text-gray-600">No cards found matching your criteria</p>
        </div>
      ) : (
        // Use type assertion to handle the unknown type issue
        // Sort the packs so Promo A appears last
        Object.entries(cardsByPack as Record<string, any[]>)
          .sort(([packA], [packB]) => {
            if (packA === 'Promo A') return 1;
            if (packB === 'Promo A') return -1;
            return packA.localeCompare(packB);
          })
          .map(([pack, packCards]) => (
          <div key={pack} className="mb-8">
            <h2 className="mb-4 text-2xl font-bold text-gray-800">{pack}</h2>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {packCards.map((card) => (
                <div
                  key={card.id}
                  onClick={() => toggleCardSelection(card.id)}
                  className={`cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-md ${
                    selectedCards.includes(card.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="mb-2 text-lg font-semibold text-gray-900">{card.card_name}</div>
                  <div className="mb-2 text-sm text-gray-500">
                    #{String(card.card_number).padStart(3, '0')} · {card.card_type}
                  </div>
                  <div className={`text-sm font-medium ${
                    card.card_rarity === 'Common' ? 'text-gray-600' :
                    card.card_rarity === 'Uncommon' ? 'text-green-600' :
                    card.card_rarity === 'Rare' ? 'text-blue-600' :
                    'text-purple-600'
                  }`}>
                    {card.card_rarity}
                  </div>
                  {!card.tradeable && (
                    <div className="mt-2 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                      Not Tradeable
                    </div>
                  )}
                  {selectedCards.includes(card.id) && (
                    <div className="mt-2 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                      Selected
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
      
      {/* Notification component */}
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