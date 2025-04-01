/**
 * Offers Page Component
 * 
 * This component manages the display and interaction of trade offers in the application.
 * It handles multiple trade states, real-time updates, and complex user interactions.
 * 
 * Key Features:
 * - Real-time trade status updates
 * - Optimistic UI updates for better UX
 * - Caching with automatic refresh (60s cache duration)
 * - Complex trade flow management
 * 
 * Trade Flow States:
 * 1. OFFERED: Initial state when a user offers a trade
 * 2. NEGOTIATING: When the recipient has selected a card to trade back
 * 3. ACCEPTED: Both parties have agreed to the trade
 * 4. COMPLETE: Trade has been completed in-game
 * 
 * Data Management:
 * - Uses caching (CACHE_DURATION) to minimize database queries
 * - Implements debouncing (REFRESH_DEBOUNCE) to prevent excessive updates
 * - Maintains optimistic updates for immediate user feedback
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Trade2, WishlistItem, TRADE_STATUS, Card } from '../types';
import { useAuth } from '../contexts/AuthContext';
import DbSetupGuide from '../components/DbSetupGuide';
import Notification from '../components/Notification';
import { createTradeNotification } from '../lib/notifications';
import { NOTIFICATION_TYPE } from '../types';

// Cache duration in milliseconds (1 minute)
const CACHE_DURATION = 60 * 1000;
// Debounce delay for data refresh (500ms)
const REFRESH_DEBOUNCE = 500;

/**
 * Interface for cards that can be offered in a trade.
 * Extends the base Card type with additional trading-specific information.
 */
interface EligibleCardWithOfferer extends Card {
  offererUsername: string;
  wishlistItemId: string;
}

/**
 * Interface for wishlist items that includes trade offers and eligible cards.
 * This is the main data structure used throughout the component.
 */
interface WishlistItemWithOffers extends WishlistItem {
  offers: Trade2[];
  eligibleCards?: EligibleCardWithOfferer[];
  selectedCardId?: string;
  users?: {
    id: string;
    username: string;
    friend_code: string;
  };
}

const Offers = () => {
  const [wishlistItems, setWishlistItems] = useState<WishlistItemWithOffers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { user } = useAuth();
  
  // Refs for caching and debouncing
  const lastLoadTime = useRef<number>(0);
  const refreshTimeout = useRef<NodeJS.Timeout>();
  const isLoadingRef = useRef(false);
  
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

  const completedTrades = useMemo(() => 
    wishlistItems.filter(item => 
      item.offers.some(offer => offer.status === TRADE_STATUS.COMPLETE)
    ),
    [wishlistItems]
  );

  const activeTrades = useMemo(() => 
    wishlistItems
      .filter(item => 
        !item.offers.some(offer => offer.status === TRADE_STATUS.COMPLETE)
      )
      .sort((a, b) => {
        // Helper function to get trade priority (higher number = higher priority)
        const getTradeStatusPriority = (item: WishlistItemWithOffers) => {
          if (item.offers.some(offer => offer.status === TRADE_STATUS.ACCEPTED)) return 3;
          if (item.offers.some(offer => offer.status === TRADE_STATUS.NEGOTIATING)) return 2;
          return 1; // TRADE_STATUS.OFFERED
        };

        return getTradeStatusPriority(b) - getTradeStatusPriority(a);
      }),
    [wishlistItems]
  );

  const handleCopyFriendCode = (friendCode: string) => {
    navigator.clipboard.writeText(friendCode);
    showNotification('Friend code copied to clipboard!', 'success');
  };

  // Check if data needs refresh
  const needsRefresh = useCallback(() => {
    return Date.now() - lastLoadTime.current > CACHE_DURATION;
  }, []);

  /**
   * Main data loading function that fetches all necessary trade information.
   * This function handles:
   * 1. Loading user's wishlist items
   * 2. Fetching associated trades
   * 3. Combining and structuring the data for display
   * 
   * @param force - If true, bypasses the cache and forces a fresh load
   */
  const loadData = useCallback(async (force = false) => {
    if (!user) return;
    if (isLoadingRef.current) return;
    if (!force && !needsRefresh()) return;
    
    try {
      isLoadingRef.current = true;
      setLoading(true);
      setError(null);

      // First get the user's wishlist items
      const { data: wishlistData, error: wishlistError } = await supabase
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
        .eq('user_id', user.id);

      if (wishlistError) throw wishlistError;

      if (!wishlistData?.length) {
        setWishlistItems([]);
        return;
      }

      // Get all trades where either:
      // 1. The wishlist item is being offered to the user (offer_id matches)
      // 2. The wishlist item was offered by the user and someone has counter-offered (request_id matches)
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades2')
        .select(`
          id,
          offered_at,
          requested_at,
          status,
          offer_id,
          request_id,
          offered_by,
          offered_to,
          offerer:offered_by (
            id,
            username,
            friend_code
          ),
          offer:offer_id (
            id,
            created_at,
            user_id,
            card_id,
            traded,
            cards:card_id (*),
            users:user_id (*)
          ),
          request:request_id (
            id,
            created_at,
            user_id,
            card_id,
            traded,
            cards:card_id (*),
            users:user_id (*)
          )
        `)
        .or(`offer_id.in.(${wishlistData.map(item => item.id).join(',')}),request_id.in.(${wishlistData.map(item => item.id).join(',')})`)
        .in('status', [TRADE_STATUS.OFFERED, TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED, TRADE_STATUS.COMPLETE]);

      if (tradesError) throw tradesError;

      // Combine the data
      const itemsWithOffers = wishlistData
        .filter(item => item && item.cards && item.users)
        .map(item => {
          const offers = (tradesData || [])
            .filter(trade => trade.offer_id === item.id || trade.request_id === item.id)
            .map(trade => ({
              ...trade,
              offerer: Array.isArray(trade.offerer) ? trade.offerer[0] : trade.offerer,
              offer: Array.isArray(trade.offer) ? trade.offer[0] : trade.offer,
              request: Array.isArray(trade.request) ? trade.request[0] : trade.request
            } as unknown as Trade2));
          
          return {
            ...(item as unknown as WishlistItem),
            offers
          } as WishlistItemWithOffers;
        })
        .filter(item => item.offers.length > 0);

      setWishlistItems(itemsWithOffers);
      lastLoadTime.current = Date.now();
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [user, needsRefresh]);

  // Debounced refresh function
  const refreshData = useCallback(() => {
    if (refreshTimeout.current) {
      clearTimeout(refreshTimeout.current);
    }
    
    refreshTimeout.current = setTimeout(() => {
      loadData(true);
    }, REFRESH_DEBOUNCE);
  }, [loadData]);

  /**
   * Updates the status of a trade with optimistic updates.
   * This ensures immediate UI feedback while the database update happens in the background.
   * 
   * @param itemId - ID of the wishlist item
   * @param tradeId - ID of the trade to update
   * @param updates - Partial trade object with updates to apply
   */
  const updateTradeStatus = useCallback((itemId: string, tradeId: string, updates: Partial<Trade2>) => {
    setWishlistItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      
      return {
        ...item,
        offers: item.offers.map(offer => 
          offer.id === tradeId
            ? { ...offer, ...updates }
            : offer
        )
      };
    }));
  }, []);

  /**
   * Loads eligible cards for trade offers.
   * This function handles the complex logic of determining which cards can be traded:
   * - Filters out cards already involved in other trades
   * - Ensures rarity matching
   * - Handles special cases for trades in negotiation/accepted states
   * 
   * @param items - Array of wishlist items to load eligible cards for
   */
  const loadEligibleCards = useCallback(async (items: WishlistItemWithOffers[]) => {
    try {
      // Get all users who have made offers across all items
      const involvedUsers = items.flatMap(item => 
        item.offers.map(offer => offer.offered_by)
      ).filter((id): id is string => Boolean(id));

      // Create a map of usernames for all involved users
      const usernames = new Map<string, string>(
        items.flatMap(item => 
          item.offers.flatMap(offer => {
            const mappings: [string, string][] = [];
            if (offer.offered_by && offer.offerer?.username) {
              mappings.push([offer.offered_by, offer.offerer.username]);
            }
            return mappings;
          })
        )
      );
      
      // Get all wishlist items from users who have made offers
      const { data: tradeableWishlistItems, error: wishlistError } = await supabase
        .from('wishlists')
        .select(`
          id,
          card_id,
          user_id,
          cards:card_id (*),
          users:user_id (username)
        `)
        .in('user_id', involvedUsers)
        .eq('traded', false);

      if (wishlistError) throw wishlistError;

      // Get all trades in negotiation or accepted state
      const { data: committedTrades, error: tradesError } = await supabase
        .from('trades2')
        .select(`
          id,
          status,
          request_id,
          offer_id
        `)
        .in('status', [TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED]);

      if (tradesError) throw tradesError;

      // Create a set of committed wishlist IDs
      const committedWishlistIds = new Set([
        ...(committedTrades || []).flatMap(trade => [trade.request_id, trade.offer_id]),
        ...(tradeableWishlistItems || [])
          .filter(wishlistItem => 
            items.some(otherItem => 
              otherItem.offers.some(offer => 
                offer.request_id === wishlistItem.id &&
                [TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED].includes(offer.status)
              )
            )
          )
          .map(wishlistItem => wishlistItem.id)
      ].filter(Boolean));

      // Process each item's eligible cards
      const updatedItems = items.map(item => {
        // Find advanced trade if any
        const advancedTrade = item.offers.find(offer => 
          [TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED, TRADE_STATUS.COMPLETE].includes(offer.status)
        );

        // Get the list of users who have made offers on this specific item
        const itemOfferers = new Set(item.offers.map(offer => offer.offered_by));

        // Filter eligible cards for this item
        let eligibleCards = (tradeableWishlistItems || [])
          .filter(wishlistItem => 
            wishlistItem?.cards && 
            typeof wishlistItem.cards === 'object' &&
            'tradeable' in wishlistItem.cards &&
            'card_rarity' in wishlistItem.cards &&
            wishlistItem.cards.tradeable === true &&
            wishlistItem.cards.card_rarity === item.cards?.card_rarity &&
            !committedWishlistIds.has(wishlistItem.id) &&
            // Only include cards from users who have made offers on this item
            itemOfferers.has(wishlistItem.user_id || '') &&
            // Exclude the logged-in user's cards
            wishlistItem.user_id !== user?.id
          )
          .map(wishlistItem => ({
            ...(wishlistItem.cards as unknown as Card),
            offererUsername: (wishlistItem as any).users?.username || usernames.get(wishlistItem.user_id || '') || 'Unknown User',
            wishlistItemId: wishlistItem.id
          } as EligibleCardWithOfferer));

        // Add advanced trade cards if needed
        if (advancedTrade?.status === TRADE_STATUS.NEGOTIATING && advancedTrade.offer?.cards) {
          const originalCard = {
            ...advancedTrade.offer.cards,
            offererUsername: advancedTrade.offer.users?.username || usernames.get(advancedTrade.offer.user_id || '') || 'Unknown User',
            wishlistItemId: advancedTrade.offer_id
          } as EligibleCardWithOfferer;

          if (!eligibleCards.some(card => card.id === originalCard.id)) {
            eligibleCards.push(originalCard);
          }
        }

        if (advancedTrade?.status === TRADE_STATUS.ACCEPTED) {
          if (advancedTrade.offer?.cards) {
            const offeredCard = {
              ...advancedTrade.offer.cards,
              offererUsername: advancedTrade.offer.users?.username || usernames.get(advancedTrade.offer.user_id || '') || 'Unknown User',
              wishlistItemId: advancedTrade.offer_id
            } as EligibleCardWithOfferer;

            if (!eligibleCards.some(card => card.id === offeredCard.id)) {
              eligibleCards.push(offeredCard);
            }
          }

          if (advancedTrade.request?.cards) {
            const requestedCard = {
              ...advancedTrade.request.cards,
              offererUsername: advancedTrade.request.users?.username || usernames.get(advancedTrade.request.user_id || '') || 'Unknown User',
              wishlistItemId: advancedTrade.request_id
            } as EligibleCardWithOfferer;

            if (!eligibleCards.some(card => card.id === requestedCard.id)) {
              eligibleCards.push(requestedCard);
            }
          }
        }

        // Remove duplicates
        eligibleCards = eligibleCards.filter((card, index, self) => 
          index === self.findIndex((c) => c.id === card.id)
        );

        // Set selected card if needed
        let selectedCardId: string | undefined = undefined;
        if (advancedTrade) {
          const isOfferer = advancedTrade.offered_by === user?.id;
          selectedCardId = isOfferer 
            ? advancedTrade.offer?.cards?.id
            : (advancedTrade.status === TRADE_STATUS.ACCEPTED && advancedTrade.request?.cards?.id)
              ? advancedTrade.request?.cards?.id
              : advancedTrade.request?.cards?.id;
        }

        return {
          ...item,
          eligibleCards,
          selectedCardId
        };
      });

      // Update all items at once to prevent multiple rerenders
      setWishlistItems(updatedItems);
    } catch (err) {
      console.error('Error loading eligible cards:', err);
      showNotification('Failed to load eligible cards', 'error');
    }
  }, [showNotification, user?.id]);

  /**
   * Handles the submission of a trade response.
   * This occurs when a user selects a card to trade in response to an offer.
   * 
   * Flow:
   * 1. Validates card selection
   * 2. Updates trade status to NEGOTIATING
   * 3. Sends notification to original offerer
   * 4. Handles optimistic UI updates
   */
  const handleSubmitTrade = async (item: WishlistItemWithOffers) => {
    if (!item.selectedCardId || !item.eligibleCards) {
      showNotification('Please select a card first', 'error');
      return;
    }

    try {
      const selectedCard = item.eligibleCards.find(card => card.id === item.selectedCardId);
      if (!selectedCard) {
        showNotification('Selected card not found', 'error');
        return;
      }

      const relevantOffer = item.offers.find(offer => 
        offer.offerer?.username === selectedCard.offererUsername
      );

      if (!relevantOffer) {
        showNotification('Could not find the corresponding trade offer', 'error');
        return;
      }

      // Optimistic update
      updateTradeStatus(item.id, relevantOffer.id, {
        request_id: selectedCard.wishlistItemId,
        status: TRADE_STATUS.NEGOTIATING,
        requested_at: new Date().toISOString()
      });

      const { error: updateError } = await supabase
        .from('trades2')
        .update({
          request_id: selectedCard.wishlistItemId,
          status: TRADE_STATUS.NEGOTIATING,
          requested_at: new Date().toISOString()
        })
        .eq('id', relevantOffer.id);

      if (updateError) throw updateError;

      // Send notification to the original offerer about the counter-offer
      if (relevantOffer.offered_by) {
        await createTradeNotification({
          userId: relevantOffer.offered_by,
          type: NOTIFICATION_TYPE.COUNTEROFFER_RECEIVED,
          actorUsername: item.users?.username || 'A user',
          wishlistItemName: item.cards?.card_name || 'Unknown card',
          cardName: selectedCard.card_name || 'Unknown card'
        });
      }

      showNotification('Trade updated successfully', 'success');
      refreshData();
    } catch (err) {
      console.error('Error submitting trade:', err);
      showNotification('Failed to submit trade', 'error');
      refreshData();
    }
  };

  /**
   * Handles accepting a trade.
   * This occurs when the original offerer accepts the counter-offer.
   * 
   * Flow:
   * 1. Updates trade status to ACCEPTED
   * 2. Sends notification to original offerer
   * 3. Enables the Complete Trade button for both parties
   */
  const handleAcceptTrade = async (item: WishlistItemWithOffers) => {
    try {
      const negotiatingOffer = item.offers.find(offer => 
        offer.status === TRADE_STATUS.NEGOTIATING && 
        offer.request_id === item.id
      );

      if (!negotiatingOffer) {
        showNotification('Could not find the trade to accept', 'error');
        return;
      }

      // Optimistic update
      updateTradeStatus(item.id, negotiatingOffer.id, {
        status: TRADE_STATUS.ACCEPTED
      });

      const { error: updateError } = await supabase
        .from('trades2')
        .update({
          status: TRADE_STATUS.ACCEPTED
        })
        .eq('id', negotiatingOffer.id);

      if (updateError) throw updateError;

      // Send notification to the original offerer that their trade was accepted
      if (negotiatingOffer.offer?.users?.id) {
        await createTradeNotification({
          userId: negotiatingOffer.offer.users.id,
          type: NOTIFICATION_TYPE.TRADE_ACCEPTED,
          actorUsername: negotiatingOffer.request?.users?.username || 'A user',
          wishlistItemName: negotiatingOffer.request?.cards?.card_name || 'Unknown card',
          cardName: negotiatingOffer.offer?.cards?.card_name || 'Unknown card'
        });
      }

      showNotification('Trade accepted successfully', 'success');
      refreshData();
    } catch (err) {
      console.error('Error accepting trade:', err);
      showNotification('Failed to accept trade', 'error');
      refreshData();
    }
  };

  /**
   * Handles rejecting a trade.
   * This resets the trade back to its initial OFFERED state.
   * 
   * Flow:
   * 1. Clears the request_id
   * 2. Resets status to OFFERED
   * 3. Allows the recipient to select a different card
   */
  const handleRejectTrade = async (item: WishlistItemWithOffers) => {
    try {
      const negotiatingOffer = item.offers.find(offer => 
        offer.status === TRADE_STATUS.NEGOTIATING && 
        offer.request_id === item.id
      );

      if (!negotiatingOffer) {
        showNotification('Could not find the trade to reject', 'error');
        return;
      }

      // Update the trade by setting request_id to null
      const { error: updateError } = await supabase
        .from('trades2')
        .update({
          request_id: null,
          status: TRADE_STATUS.OFFERED // Reset status back to offered
        })
        .eq('id', negotiatingOffer.id);

      if (updateError) throw updateError;

      // Send notification to the person whose counter-offer was rejected
      if (negotiatingOffer.offer?.users?.id) {
        await createTradeNotification({
          userId: negotiatingOffer.offer.users.id,
          type: NOTIFICATION_TYPE.OFFER_REJECTED,
          actorUsername: item.users?.username || 'A user',
          wishlistItemName: item.cards?.card_name || 'Unknown card',
          cardName: negotiatingOffer.offer?.cards?.card_name || 'Unknown card'
        });
      }

      showNotification('Trade rejected successfully', 'success');
      refreshData();
    } catch (err) {
      console.error('Error rejecting trade:', err);
      showNotification('Failed to reject trade', 'error');
    }
  };

  /**
   * Handles completing a trade.
   * This is the final state after both parties have completed the trade in-game.
   * 
   * Flow:
   * 1. Updates trade status to COMPLETE
   * 2. Moves trade to the Completed Trades section
   * 3. Updates related wishlist items via database trigger
   */
  const handleCompleteTrade = async (item: WishlistItemWithOffers) => {
    try {
      const acceptedOffer = item.offers.find(offer => 
        offer.status === TRADE_STATUS.ACCEPTED
      );

      if (!acceptedOffer) {
        showNotification('Could not find the trade to complete', 'error');
        return;
      }

      // Update the trade status to complete - wishlist updates will be handled by the database trigger
      const { error: updateError } = await supabase
        .from('trades2')
        .update({
          status: TRADE_STATUS.COMPLETE
        })
        .eq('id', acceptedOffer.id);

      if (updateError) throw updateError;

      showNotification('Trade completed successfully', 'success');
      
      // Refresh the data
      refreshData();
    } catch (err) {
      console.error('Error completing trade:', err);
      showNotification('Failed to complete trade', 'error');
    }
  };

  // Effect for initial load and user changes
  useEffect(() => {
    loadData();
    
    return () => {
      if (refreshTimeout.current) {
        clearTimeout(refreshTimeout.current);
      }
    };
  }, [loadData]);

  // Effect for visibility changes
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

  // Load eligible cards for all wishlist items at once when they're loaded
  useEffect(() => {
    if (wishlistItems.length > 0 && wishlistItems.some(item => !item.eligibleCards)) {
      loadEligibleCards(wishlistItems);
    }
  }, [wishlistItems, loadEligibleCards]);

  const handleCardSelect = (itemId: string, cardId: string | '') => {
    setWishlistItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, selectedCardId: cardId || undefined }
        : item
    ));
  };

  return (
    <div className="container py-8">
      <div className="flex flex-col mb-8">
        <h1 className="text-3xl font-bold mb-4">Your Offers</h1>
        <div className="prose max-w-prose mb-8">
          <p className="mb-4">
            This is where you can find offers from other players for the cards you've added to your wishlist.
          </p>
          <p className="mb-4">
            For any offers you receive, you will be able to see every eligible trade based on what the offerers need. Simply select the card you are willing to send them, and wait for them to accept.
          </p>
          <p>
            When both players have accepted, you can make the trade in-game. Then come back here and click "Complete Trade" to remove it from your list of active offers.
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
      
      {loading ? (
        <div className="text-center text-gray-600">Loading offers...</div>
      ) : wishlistItems.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-md">
          <p className="text-lg text-gray-600">No offers found for your wishlist items</p>
        </div>
      ) : (
        <>
          {completedTrades.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center space-x-2 text-lg font-medium text-gray-900 mb-4">
                <span>Successful Trades</span>
                <span className="text-sm text-gray-500">({completedTrades.length})</span>
              </div>
              
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <style>
                  {`
                    .scrollbar-hide {
                      scrollbar-width: none;
                      -ms-overflow-style: none;
                    }
                    .scrollbar-hide::-webkit-scrollbar {
                      display: none;
                    }
                  `}
                </style>
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Received
                        </th>
                        <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Sent
                        </th>
                        <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Trade Partner
                        </th>
                        <th scope="col" className="px-4 sm:px-6 py-3">
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {completedTrades.map(item => {
                        const completedOffer = item.offers.find(offer => 
                          offer.status === TRADE_STATUS.COMPLETE
                        );
                        if (!completedOffer) return null;

                        // Determine if the logged-in user is the one who made the offer
                        const isOfferer = completedOffer.offered_by === user?.id;

                        // Set up receiving and sending cards using the same logic as active trades
                        const receivingCard = !isOfferer 
                          ? completedOffer.offer?.cards    // If someone else made the offer, we receive their offered card
                          : completedOffer.request?.cards; // If we made the offer, we receive their requested card

                        const sendingCard = isOfferer
                          ? completedOffer.offer?.cards    // If we made the offer, we sent our offered card
                          : completedOffer.request?.cards; // If someone else made the offer, we sent our requested card

                        // Set up trading partner - if we made the offer (isOfferer), show the user who owns the wishlist item
                        // otherwise show the user who made the offer to us
                        const tradingPartner = isOfferer
                          ? completedOffer.offer?.users  // If we made the offer, show the wishlist item owner
                          : completedOffer.offerer;      // If someone else made the offer, show the offerer

                        return (
                          <tr key={item.id}>
                            <td className="px-4 sm:px-6 py-3 whitespace-nowrap min-w-[200px]">
                              <div className="flex items-center">
                                {receivingCard?.image_url && (
                                  <img 
                                    src={receivingCard.image_url}
                                    alt={receivingCard.card_name}
                                    className="h-8 sm:h-10 w-auto mr-2 sm:mr-3"
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                                    {receivingCard?.card_name}
                                  </div>
                                  <div className="text-xs sm:text-sm text-gray-500 truncate">
                                    #{String(receivingCard?.card_number || '000').padStart(3, '0')} · {receivingCard?.pack}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-3 whitespace-nowrap min-w-[200px]">
                              <div className="flex items-center">
                                {sendingCard?.image_url && (
                                  <img 
                                    src={sendingCard.image_url}
                                    alt={sendingCard.card_name}
                                    className="h-8 sm:h-10 w-auto mr-2 sm:mr-3"
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                                    {sendingCard?.card_name}
                                  </div>
                                  <div className="text-xs sm:text-sm text-gray-500 truncate">
                                    #{String(sendingCard?.card_number || '000').padStart(3, '0')} · {sendingCard?.pack}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 truncate max-w-[120px]">
                                {tradingPartner?.username}
                              </div>
                              <div className="text-xs sm:text-sm text-gray-500 truncate">
                                {tradingPartner?.friend_code}
                              </div>
                            </td>
                            <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-right">
                              <button
                                onClick={() => handleCopyFriendCode(tradingPartner?.friend_code || '')}
                                className="inline-flex items-center px-2 sm:px-3 py-1 border border-transparent text-xs sm:text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                              >
                                Copy Friend Code
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTrades.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 text-lg font-medium text-gray-900 mb-4">
                <span>Active Offers</span>
                <span className="text-sm text-gray-500">({activeTrades.length})</span>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {activeTrades.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-lg bg-white shadow">
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="text-sm font-medium text-gray-500">You will receive:</h4>
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                          item.offers.some(offer => offer.status === TRADE_STATUS.COMPLETE)
                            ? 'bg-green-100 text-green-800'
                            : item.offers.some(offer => offer.status === TRADE_STATUS.ACCEPTED)
                            ? 'bg-purple-100 text-purple-800'
                            : item.offers.some(offer => offer.status === TRADE_STATUS.NEGOTIATING)
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {item.offers.some(offer => offer.status === TRADE_STATUS.COMPLETE)
                            ? 'Complete'
                            : item.offers.some(offer => offer.status === TRADE_STATUS.ACCEPTED)
                            ? 'Accepted'
                            : item.offers.some(offer => offer.status === TRADE_STATUS.NEGOTIATING)
                            ? 'Negotiating'
                            : `${item.offers.length} ${item.offers.length === 1 ? 'Offer' : 'Offers'}`}
                        </div>
                      </div>
                      <div className="flex items-start space-x-4">
                        {(() => {
                          const activeOffer = item.offers.find(offer => 
                            [TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED].includes(offer.status)
                          ) || item.offers[0];

                          const isOfferer = activeOffer.offered_by === user?.id;
                          const cardToShow = isOfferer ? activeOffer.request?.cards : activeOffer.offer?.cards;
                          
                          // Get the other user in the trade based on offered_by and offered_to
                          const otherUser = isOfferer
                            ? activeOffer.offer?.users  // If we're the offerer (offered_by), show the person we offered to (in offer.users)
                            : activeOffer.offerer;      // If we're the receiver (offered_to), show the person who made the offer (offerer)
                          const friendCode = otherUser?.friend_code || '';

                          return (
                            <>
                              {cardToShow?.image_url && (
                                <div className="flex-shrink-0">
                                  <img 
                                    src={cardToShow.image_url} 
                                    alt={cardToShow.card_name || 'Card'}
                                    className="h-24 w-auto object-contain rounded"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-medium text-gray-900 truncate">
                                  {cardToShow?.card_name || 'Unknown Card'}
                                </h3>
                                <p className="mt-1 text-sm text-gray-500">
                                  #{String(cardToShow?.card_number || '000').padStart(3, '0')} · {cardToShow?.pack || 'Unknown Pack'} · {cardToShow?.card_rarity || 'Unknown Rarity'}
                                </p>
                                <div className="mt-2 text-sm text-gray-500">
                                  {otherUser?.username || 'Unknown User'}
                                  {friendCode && (
                                    <button
                                      onClick={() => handleCopyFriendCode(friendCode)}
                                      className="ml-2 text-blue-600 hover:text-blue-800"
                                    >
                                      {friendCode}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      
                      {/* Lower card display section */}
                      {(item.selectedCardId || item.offers.some(offer => [TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED].includes(offer.status))) && (
                        <div className="mt-4 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-500 mb-2">You will send:</h4>
                          {(() => {
                            // For trades in negotiation or accepted state, use the trade data
                            const advancedTrade = item.offers.find(offer => 
                              [TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED].includes(offer.status)
                            );

                            if (advancedTrade) {
                              const isOfferer = advancedTrade.offered_by === user?.id;
                              // If we're the offerer, show our offer card
                              // If we're the receiver, show our counter-offer card
                              const cardToShow = isOfferer 
                                ? advancedTrade.offer?.cards
                                : advancedTrade.request?.cards;

                              if (!cardToShow) return null;

                              return (
                                <div className="flex items-start space-x-4">
                                  {cardToShow.image_url && (
                                    <div className="flex-shrink-0">
                                      <img 
                                        src={cardToShow.image_url} 
                                        alt={cardToShow.card_name || 'Card'}
                                        className="h-24 w-auto object-contain rounded"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-medium text-gray-900 truncate">
                                      {cardToShow.card_name || 'Unknown Card'}
                                    </h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                      #{String(cardToShow.card_number || '000').padStart(3, '0')} · {cardToShow.pack || 'Unknown Pack'} · {cardToShow.card_rarity || 'Unknown Rarity'}
                                    </p>
                                    <div className="mt-2 text-sm text-gray-500">
                                      {user?.user_metadata?.username || 'You'}
                                      {user?.user_metadata?.friend_code && (
                                        <button
                                          onClick={() => handleCopyFriendCode(user.user_metadata.friend_code)}
                                          className="ml-2 text-blue-600 hover:text-blue-800"
                                        >
                                          {user.user_metadata.friend_code}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            // For trades in offer state, use the selected card from eligible cards
                            const selectedCard = item.eligibleCards?.find(card => card.id === item.selectedCardId);
                            if (!selectedCard) return null;
                            
                            return (
                              <div className="flex items-start space-x-4">
                                {selectedCard.image_url && (
                                  <div className="flex-shrink-0">
                                    <img 
                                      src={selectedCard.image_url} 
                                      alt={selectedCard.card_name || 'Card'}
                                      className="h-24 w-auto object-contain rounded"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-lg font-medium text-gray-900 truncate">
                                    {selectedCard.card_name || 'Unknown Card'}
                                  </h3>
                                  <p className="mt-1 text-sm text-gray-500">
                                    #{String(selectedCard.card_number || '000').padStart(3, '0')} · {selectedCard.pack || 'Unknown Pack'} · {selectedCard.card_rarity || 'Unknown Rarity'}
                                  </p>
                                  <div className="mt-2 text-sm text-gray-500">
                                    {user?.user_metadata?.username || 'You'}
                                    {user?.user_metadata?.friend_code && (
                                      <button
                                        onClick={() => handleCopyFriendCode(user.user_metadata.friend_code)}
                                        className="ml-2 text-blue-600 hover:text-blue-800"
                                      >
                                        {user.user_metadata.friend_code}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      
                      <div className="mt-4 border-t pt-4">
                        {!item.eligibleCards ? (
                          <div className="text-sm text-gray-500">Loading trade actions...</div>
                        ) : item.eligibleCards.length === 0 ? (
                          <div className="text-sm text-gray-500">No eligible cards found</div>
                        ) : (
                          <div className="space-y-4">
                            {/* Show appropriate UI based on trade state */}
                            {item.offers.some(offer => 
                              // Case 1: User receiving counter offer - show Accept/Reject buttons
                              offer.status === TRADE_STATUS.NEGOTIATING && 
                              offer.offered_by === user?.id
                            ) ? (
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleRejectTrade(item)}
                                  className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                >
                                  Reject Trade
                                </button>
                                <button
                                  onClick={() => handleAcceptTrade(item)}
                                  className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                  Accept Trade
                                </button>
                              </div>
                            ) : item.offers.some(offer => 
                                // Case 2: Trade is accepted - show Complete Trade button
                                offer.status === TRADE_STATUS.ACCEPTED
                              ) ? (
                              <div className="flex">
                                <button
                                  onClick={() => handleCompleteTrade(item)}
                                  className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                  Complete Trade
                                </button>
                              </div>
                            ) : item.offers.some(offer =>
                                // Case 3: Trade is in negotiation but user is not the receiver - no action needed
                                offer.status === TRADE_STATUS.NEGOTIATING
                              ) ? (
                              <div className="flex">
                                <button
                                  disabled
                                  className="w-full px-4 py-2 text-sm font-medium text-gray-500 bg-gray-100 rounded-md cursor-not-allowed"
                                >
                                  Waiting for other user's response...
                                </button>
                              </div>
                            ) : (
                              // Case 4: Open offer with no request_id - show card selector
                              <div className="flex space-x-2">
                                <style>
                                  {`
                                    .trade-select {
                                      max-width: 100%;
                                      width: 100%;
                                    }
                                    .trade-select option {
                                      max-width: 300px;
                                      white-space: nowrap;
                                      overflow: hidden;
                                      text-overflow: ellipsis;
                                    }
                                  `}
                                </style>
                                <select
                                  className="trade-select flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                  value={item.selectedCardId || ''}
                                  onChange={(e) => handleCardSelect(item.id, e.target.value)}
                                >
                                  <option value="">Select a card to send</option>
                                  {(() => {
                                    // Group cards by pack
                                    const cardsByPack = item.eligibleCards?.reduce((acc, card) => {
                                      const pack = card.pack || 'Unknown Pack';
                                      if (!acc[pack]) {
                                        acc[pack] = [];
                                      }
                                      acc[pack].push(card);
                                      return acc;
                                    }, {} as Record<string, typeof item.eligibleCards>);

                                    // Sort packs alphabetically
                                    return Object.entries(cardsByPack || {})
                                      .sort(([packA], [packB]) => packA.localeCompare(packB))
                                      .map(([pack, cards]) => (
                                        <optgroup key={pack} label={pack}>
                                          {cards?.sort((a, b) => {
                                            // Sort by card number, handling non-numeric parts
                                            const aNum = parseInt(a.card_number || '0');
                                            const bNum = parseInt(b.card_number || '0');
                                            return aNum - bNum;
                                          }).map(card => (
                                            <option key={card.id} value={card.id} title={`#${String(card.card_number || '000').padStart(3, '0')} ${card.card_name} (${card.offererUsername})`}>
                                              #{String(card.card_number || '000').padStart(3, '0')} {card.card_name} ({card.offererUsername})
                                            </option>
                                          ))}
                                        </optgroup>
                                      ));
                                  })()}
                                </select>
                                
                                <button
                                  onClick={() => handleSubmitTrade(item)}
                                  disabled={!item.selectedCardId}
                                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                                    item.selectedCardId
                                      ? 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                                >
                                  Submit
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
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

export default Offers; 