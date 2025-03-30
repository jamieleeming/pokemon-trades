import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Trade2, WishlistItem, TRADE_STATUS, Card } from '../types';
import { useAuth } from '../contexts/AuthContext';
import DbSetupGuide from '../components/DbSetupGuide';
import Notification from '../components/Notification';

interface EligibleCardWithOfferer extends Card {
  offererUsername: string;
  wishlistItemId: string;
}

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

  // Load data
  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
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

      console.log('Wishlist items:', wishlistData?.length);

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
            users:user_id (
              id,
              username,
              friend_code
            )
          ),
          request:request_id (
            id,
            created_at,
            user_id,
            card_id,
            traded,
            cards:card_id (*),
            users:user_id (
              id,
              username,
              friend_code
            )
          )
        `)
        .or(`offer_id.in.(${wishlistData.map(item => item.id).join(',')}),request_id.in.(${wishlistData.map(item => item.id).join(',')})`)
        .in('status', [TRADE_STATUS.OFFERED, TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED, TRADE_STATUS.COMPLETE]); // Include all active and completed trades

      if (tradesError) {
        console.error('Trades error:', tradesError);
        throw tradesError;
      }

      console.log('Trades found:', tradesData?.length);
      console.log('Sample trade:', tradesData?.[0]);

      // Combine the data
      const itemsWithOffers = wishlistData
        .filter(item => item && item.cards && item.users)
        .map(item => {
          const offers = (tradesData || [])
            .filter(trade => trade.offer_id === item.id || trade.request_id === item.id)
            .map(trade => ({
              ...trade,
              // Ensure all required fields from Trade2 interface are present
              id: trade.id,
              offered_at: trade.offered_at,
              requested_at: trade.requested_at,
              offer_id: trade.offer_id,
              request_id: trade.request_id,
              status: trade.status as TRADE_STATUS,
              offered_by: trade.offered_by,
              offerer: Array.isArray(trade.offerer) ? trade.offerer[0] : trade.offerer,
              offer: Array.isArray(trade.offer) ? trade.offer[0] : trade.offer,
              request: Array.isArray(trade.request) ? trade.request[0] : trade.request
            } as unknown as Trade2));
          
          console.log(`Offers for item ${item.id}:`, offers.length);
          return {
            ...(item as unknown as WishlistItem),
            offers
          } as WishlistItemWithOffers;
        })
        .filter(item => item.offers.length > 0); // Only include items that have offers

      console.log('Items with offers:', itemsWithOffers.length);
      setWishlistItems(itemsWithOffers);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load eligible cards for a wishlist item
  const loadEligibleCards = useCallback(async (item: WishlistItemWithOffers) => {
    try {
      // Get all users involved in the trades (both offerers and receivers)
      const involvedUsers = item.offers.flatMap(offer => {
        const users = [];
        // Include the user who made the offer
        if (offer.offered_by) users.push(offer.offered_by);
        // Include the user who owns the request_id wishlist item
        if (offer.request?.user_id) users.push(offer.request.user_id);
        return users;
      }).filter((id): id is string => Boolean(id));

      // Create a map of usernames for all involved users
      const usernames = new Map<string, string>(
        item.offers.flatMap(offer => {
          const mappings: [string, string][] = [];
          // Include the username of the user who made the offer
          if (offer.offered_by && offer.offerer?.username) {
            mappings.push([offer.offered_by, offer.offerer.username]);
          }
          // Include the username of the user who owns the offer card
          if (offer.offer?.user_id && offer.offer?.users?.username) {
            mappings.push([offer.offer.user_id, offer.offer.users.username]);
          }
          // Include the username of the user who owns the request card
          if (offer.request?.user_id && offer.request?.users?.username) {
            mappings.push([offer.request.user_id, offer.request.users.username]);
          }
          return mappings;
        })
      );
      
      // Get all wishlist items from these users
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

      // Get all trades in negotiation or accepted state to check for committed cards
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

      // Create a set of wishlist item IDs that are already committed in trades
      const committedWishlistIds = new Set([
        // Include cards that are part of negotiating or accepted trades (both request_id and offer_id)
        ...(committedTrades || []).flatMap(trade => [trade.request_id, trade.offer_id]),
        // Also include cards that the user has used in their own counter-offers
        ...(tradeableWishlistItems || [])
          .filter(wishlistItem => 
            wishlistItems.some(otherItem => 
              otherItem.id !== item.id && // Don't exclude cards from the current trade
              otherItem.offers.some(offer => 
                // Check if this card is being used in any counter-offer
                offer.request_id === wishlistItem.id &&
                // Only exclude if it's in negotiation or accepted state
                [TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED].includes(offer.status)
              )
            )
          )
          .map(wishlistItem => wishlistItem.id)
      ].filter(Boolean));

      // Find if there's an existing trade in an advanced stage
      const advancedTrade = item.offers.find(offer => 
        [TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED, TRADE_STATUS.COMPLETE].includes(offer.status)
      );

      // Create base eligible cards list from wishlist items
      let eligibleCards = (tradeableWishlistItems || [])
        .filter(wishlistItem => 
          wishlistItem?.cards && 
          typeof wishlistItem.cards === 'object' &&
          'tradeable' in wishlistItem.cards &&
          'card_rarity' in wishlistItem.cards &&
          wishlistItem.cards.tradeable === true &&
          wishlistItem.cards.card_rarity === item.cards?.card_rarity &&
          // Exclude cards that are already committed in other trades
          !committedWishlistIds.has(wishlistItem.id)
        )
        .map(wishlistItem => ({
          ...(wishlistItem.cards as unknown as Card),
          offererUsername: (wishlistItem as any).users?.username || usernames.get(wishlistItem.user_id || '') || 'Unknown User',
          wishlistItemId: wishlistItem.id
        } as EligibleCardWithOfferer));

      // If there's a trade in negotiation, make sure to include the originally offered card
      if (advancedTrade?.status === TRADE_STATUS.NEGOTIATING && advancedTrade.offer?.cards) {
        const originalCard = {
          ...advancedTrade.offer.cards,
          offererUsername: advancedTrade.offer.users?.username || usernames.get(advancedTrade.offer.user_id || '') || 'Unknown User',
          wishlistItemId: advancedTrade.offer_id
        } as EligibleCardWithOfferer;

        // Add the original card if it's not already in the list
        if (!eligibleCards.some(card => card.id === originalCard.id)) {
          eligibleCards.push(originalCard);
        }
      }

      // For accepted trades, make sure to include both the offered and requested cards
      if (advancedTrade?.status === TRADE_STATUS.ACCEPTED) {
        // Include the offered card
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

        // Include the requested/counter-offered card
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

      // If there's an existing trade, set the selected card based on who made the offer
      let selectedCardId: string | undefined = undefined;
      if (advancedTrade) {
        const isOfferer = advancedTrade.offered_by === user?.id;

        // For both negotiating and accepted trades:
        // If we're the original offerer (A):
        // - In negotiation: show the card we offered
        // - In accepted: show the card we offered
        // If we're the responder (B):
        // - In negotiation: show the card we selected to give
        // - In accepted: show the card we counter-offered with
        selectedCardId = isOfferer 
          ? advancedTrade.offer?.cards?.id  // A sees their original offered card
          : (advancedTrade.status === TRADE_STATUS.ACCEPTED && advancedTrade.request?.cards?.id)
            ? advancedTrade.request?.cards?.id  // B sees their counter-offered card
            : advancedTrade.request?.cards?.id; // B sees their selected card

        console.log('Trade selection debug:', {
          isOfferer,
          userId: user?.id,
          offeredBy: advancedTrade.offered_by,
          selectedCardId,
          offerCard: advancedTrade.offer?.cards?.card_name,
          requestCard: advancedTrade.request?.cards?.card_name,
          offerCardId: advancedTrade.offer?.cards?.id,
          requestCardId: advancedTrade.request?.cards?.id,
          status: advancedTrade.status
        });
      }

      // Update the wishlist item with eligible cards and potentially selected card
      setWishlistItems(prev => prev.map(prevItem => 
        prevItem.id === item.id 
          ? { ...prevItem, eligibleCards, selectedCardId }
          : prevItem
      ));
    } catch (err) {
      console.error('Error loading eligible cards:', err);
      showNotification('Failed to load eligible cards', 'error');
    }
  }, [showNotification, wishlistItems, user?.id]);

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

      // Find the trade offer from the user who owns the selected card
      const relevantOffer = item.offers.find(offer => 
        offer.offerer?.username === selectedCard.offererUsername
      );

      if (!relevantOffer) {
        console.log('Debug - Selected Card:', selectedCard);
        console.log('Debug - Available Offers:', item.offers);
        showNotification('Could not find the corresponding trade offer', 'error');
        return;
      }

      // Update the trade with the selected card's wishlist item ID
      const { error: updateError } = await supabase
        .from('trades2')
        .update({
          request_id: selectedCard.wishlistItemId,
          status: TRADE_STATUS.NEGOTIATING,
          requested_at: new Date().toISOString()
        })
        .eq('id', relevantOffer.id);

      if (updateError) throw updateError;

      showNotification('Trade updated successfully', 'success');
      
      // Refresh the data
      await loadData();
    } catch (err) {
      console.error('Error submitting trade:', err);
      showNotification('Failed to submit trade', 'error');
    }
  };

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

      // Update the trade status to accepted
      const { error: updateError } = await supabase
        .from('trades2')
        .update({
          status: TRADE_STATUS.ACCEPTED
        })
        .eq('id', negotiatingOffer.id);

      if (updateError) throw updateError;

      showNotification('Trade accepted successfully', 'success');
      
      // Refresh the data
      await loadData();
    } catch (err) {
      console.error('Error accepting trade:', err);
      showNotification('Failed to accept trade', 'error');
    }
  };

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

      showNotification('Trade rejected successfully', 'success');
      
      // Refresh the data
      await loadData();
    } catch (err) {
      console.error('Error rejecting trade:', err);
      showNotification('Failed to reject trade', 'error');
    }
  };

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
      await loadData();
    } catch (err) {
      console.error('Error completing trade:', err);
      showNotification('Failed to complete trade', 'error');
    }
  };

  // Load data on mount and when user changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load eligible cards for each wishlist item when they're loaded
  useEffect(() => {
    const loadEligibleCardsForItems = async () => {
      if (wishlistItems.length > 0) {
        for (const item of wishlistItems) {
          if (!item.eligibleCards) {
            await loadEligibleCards(item);
          }
        }
      }
    };

    loadEligibleCardsForItems();
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

                        // Set up trading partner based on who made the offer
                        const tradingPartner = isOfferer
                          ? completedOffer.request?.users  // If we made the offer, show the request owner
                          : completedOffer.offerer;        // If someone else made the offer, show the offerer

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
                        {item.cards?.image_url && (
                          <div className="flex-shrink-0">
                            <img 
                              src={item.cards.image_url} 
                              alt={item.cards.card_name || 'Card'}
                              className="h-24 w-auto object-contain rounded"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-medium text-gray-900 truncate">
                            {item.cards?.card_name || 'Unknown Card'}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            #{String(item.cards?.card_number || '000').padStart(3, '0')} · {item.cards?.pack || 'Unknown Pack'} · {item.cards?.card_rarity || 'Unknown Rarity'}
                          </p>
                          <div className="mt-2 text-sm text-gray-500">
                            {item.users?.username || 'Unknown User'}
                            {item.users?.friend_code && (
                              <button
                                onClick={() => handleCopyFriendCode(item.users?.friend_code || '')}
                                className="ml-2 text-blue-600 hover:text-blue-800"
                              >
                                {item.users?.friend_code}
                              </button>
                            )}
                          </div>
                        </div>
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
                              // Determine which card to show based on who made the offer
                              const isOfferer = advancedTrade.offered_by === user?.id;
                              const cardToShow = isOfferer 
                                ? advancedTrade.offer?.cards // If we made the offer, show our offered card
                                : advancedTrade.request?.cards; // If we received the offer, show our counter-offered card

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
                                      {isOfferer 
                                        ? advancedTrade.offer?.users?.username 
                                        : advancedTrade.request?.users?.username || 'Unknown User'}
                                      {(isOfferer 
                                        ? advancedTrade.offer?.users?.friend_code
                                        : advancedTrade.request?.users?.friend_code) && (
                                        <button
                                          onClick={() => handleCopyFriendCode(
                                            isOfferer 
                                              ? advancedTrade.offer?.users?.friend_code || ''
                                              : advancedTrade.request?.users?.friend_code || ''
                                          )}
                                          className="ml-2 text-blue-600 hover:text-blue-800"
                                        >
                                          {isOfferer 
                                            ? advancedTrade.offer?.users?.friend_code
                                            : advancedTrade.request?.users?.friend_code}
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
                                    {selectedCard.offererUsername || 'Unknown User'}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      
                      <div className="mt-4 border-t pt-4">
                        {!item.eligibleCards ? (
                          <div className="text-sm text-gray-500">Loading eligible cards...</div>
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
                                <select
                                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                  value={item.selectedCardId || ''}
                                  onChange={(e) => handleCardSelect(item.id, e.target.value)}
                                >
                                  <option value="">Select a card to send</option>
                                  {item.eligibleCards.map(card => (
                                    <option key={card.id} value={card.id}>
                                      {card.card_name} ({card.offererUsername})
                                    </option>
                                  ))}
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