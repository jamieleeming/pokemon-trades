import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Card, WishlistItem, TRADE_STATUS } from '../types';
import { PostgrestResponse } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import Notification from './Notification';

interface TradeOffersModalProps {
  isOpen: boolean;
  onClose: () => void;
  wishlistItem: WishlistItem | null;
  onTradeCreated?: () => void;
}

interface TradeableCard extends Card {
  wishlist_user: {
    username: string;
  };
  wishlist_id: string;
  wishlist_user_id: string;
}

interface WishlistJoinResult {
  id: string;
  user_id: string;
  traded: boolean;
  cards: Card | null;
  users: {
    username: string;
  } | null;
}

type LinkedTradeResponse = {
  id: number;
  linked_trade_id: number;
  status: TRADE_STATUS;
  offered_by: string;
  requested_date: string;
  card: Card;
  wishlist: {
    id: string;
    user_id: string;
    users: {
      username: string;
    };
  };
};

type LinkedTradeDetails = {
  id: number;
  linked_trade_id: number;
  offered_by: string;
  requested_date: string;
  card: Card;
  wishlist: {
    id: string;
    user_id: string;
    users: {
      username: string;
    };
  };
};

export default function TradeOffersModal({ isOpen, onClose, wishlistItem: initialWishlistItem, onTradeCreated }: TradeOffersModalProps) {
  const [loading, setLoading] = useState(false);
  const [tradeableCards, setTradeableCards] = useState<TradeableCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<TradeableCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkedTrade, setLinkedTrade] = useState<LinkedTradeDetails | null>(null);
  const [otherTrade, setOtherTrade] = useState<LinkedTradeDetails | null>(null);
  const [tradeStatus, setTradeStatus] = useState<TRADE_STATUS | null>(null);
  const [wishlistItem, setWishlistItem] = useState<WishlistItem | null>(null);
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

  // Update wishlistItem when initialWishlistItem changes
  useEffect(() => {
    setWishlistItem(initialWishlistItem);
  }, [initialWishlistItem]);

  const loadTradeableCards = async () => {
    setLoading(true);
    setError(null);
    try {
      // First, get all users who have offered trades for this wishlist item
      const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('offered_by')
        .eq('wishlist_id', wishlistItem?.id);

      if (tradesError) throw tradesError;

      if (!trades?.length) {
        setTradeableCards([]);
        return;
      }

      const offeringUserIds = trades.map(t => t.offered_by).filter(Boolean);

      // Get all wishlisted cards from these users that match the rarity
      const { data, error: cardsError } = await supabase
        .from('wishlists')
        .select(`
          id,
          user_id,
          traded,
          cards:card_id (*),
          users:user_id (username)
        `)
        .in('user_id', offeringUserIds)
        .eq('cards.card_rarity', wishlistItem?.cards?.card_rarity)
        .eq('cards.tradeable', true) as PostgrestResponse<WishlistJoinResult>;

      if (cardsError) throw cardsError;

      if (data) {
        const validCards = data
          .filter((item): item is WishlistJoinResult & { cards: Card; users: { username: string } } => 
            item.cards !== null && 
            item.users !== null
          )
          .map(item => ({
            ...item.cards,
            wishlist_user: {
              username: item.users.username
            },
            wishlist_id: item.id,
            wishlist_user_id: item.user_id
          }));

        setTradeableCards(validCards);
      }
    } catch (err) {
      console.error('Error loading tradeable cards:', err);
      setError('Failed to load tradeable cards');
    } finally {
      setLoading(false);
    }
  };

  const userMadeCounterOffer = useCallback(() => {
    if (!linkedTrade || !otherTrade || !user) return false;
    
    // Compare dates to determine which is the counter-offer
    const linkedTradeDate = new Date(linkedTrade.requested_date);
    const otherTradeDate = new Date(otherTrade.requested_date);
    
    // The later trade is the counter-offer
    const counterOffer = linkedTradeDate > otherTradeDate ? linkedTrade : otherTrade;
    
    // Check if the user made the counter-offer
    return counterOffer.offered_by === user.id;
  }, [linkedTrade, otherTrade, user]);

  useEffect(() => {
    if (!isOpen || !wishlistItem || !user) return;

    const loadTradeData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Check if there's a linked trade with its card details
        const { data: tradeData, error: tradeError } = await supabase
          .from('trades')
          .select(`
            id,
            linked_trade_id,
            status,
            offered_by,
            requested_date,
            card:card_id (*),
            wishlist:wishlist_id (
              id,
              user_id,
              users:user_id (username)
            )
          `)
          .eq('wishlist_id', wishlistItem.id)
          .in('status', [TRADE_STATUS.NEGOTIATING, TRADE_STATUS.ACCEPTED])
          .single() as { data: LinkedTradeResponse | null; error: any };

        if (tradeError && tradeError.code !== 'PGRST116') throw tradeError;
        
        if (tradeData) {
          setTradeStatus(tradeData.status);
          
          // Also fetch the linked trade's details
          const { data: linkedTradeData, error: linkedTradeError } = await supabase
            .from('trades')
            .select(`
              id,
              linked_trade_id,
              status,
              offered_by,
              requested_date,
              card:card_id (*),
              wishlist:wishlist_id (
                id,
                user_id,
                users:user_id (username)
              )
            `)
            .eq('id', tradeData.linked_trade_id)
            .single() as { data: LinkedTradeResponse | null; error: any };

          if (linkedTradeError) throw linkedTradeError;

          if (linkedTradeData) {
            // Store both trades
            setLinkedTrade(tradeData);
            setOtherTrade(linkedTradeData);

            // Determine which trade's wishlist belongs to the current user
            const userWishlistTrade = tradeData.wishlist?.user_id === user.id ? tradeData : linkedTradeData;
            const otherWishlistTrade = tradeData.wishlist?.user_id === user.id ? linkedTradeData : tradeData;

            // Update the wishlist item to be the one that IS the user's wishlist
            if (userWishlistTrade.wishlist?.id !== wishlistItem.id) {
              const { data: userWishlistData, error: wishlistError } = await supabase
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
                .eq('id', userWishlistTrade.wishlist?.id)
                .single();

              if (wishlistError) throw wishlistError;
              if (userWishlistData) {
                setWishlistItem(userWishlistData as unknown as WishlistItem);
              }
            }
            return;
          }
        }

        // Only load tradeable cards if there's no linked trade
        await loadTradeableCards();
      } catch (err) {
        console.error('Error loading trade data:', err);
        setError('Failed to load trade data');
      } finally {
        setLoading(false);
      }
    };

    loadTradeData();
  }, [isOpen, wishlistItem, user]);

  const handleMakeOffer = async () => {
    if (!selectedCard || !wishlistItem || !user) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Find the original trade offer
      const { data: originalTrade, error: findError } = await supabase
        .from('trades')
        .select('id')
        .eq('wishlist_id', wishlistItem.id)
        .eq('status', TRADE_STATUS.OFFERED)
        .single();

      if (findError) throw findError;

      // Create the counter-offer trade first
      const { data: counterOffer, error: tradeError } = await supabase
        .from('trades')
        .insert({
          wishlist_id: selectedCard.wishlist_id,
          card_id: selectedCard.id,
          user_id: selectedCard.wishlist_user_id,
          offered_by: user.id,
          requested_date: new Date().toISOString(),
          status: TRADE_STATUS.NEGOTIATING,
          linked_trade_id: originalTrade.id // Link to the original trade
        })
        .select()
        .single();

      if (tradeError) throw tradeError;

      // Update the original trade with both status change and counter-offer ID
      const { error: updateError } = await supabase
        .from('trades')
        .update({ 
          status: TRADE_STATUS.NEGOTIATING,
          linked_trade_id: counterOffer.id // Link back to the counter-offer
        })
        .eq('id', originalTrade.id);

      if (updateError) throw updateError;

      // Close modal and notify parent component
      onClose();
      onTradeCreated?.();
    } catch (err) {
      console.error('Error creating trade offer:', err);
      setError('Failed to create trade offer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteTrade = async () => {
    if (!linkedTrade || !otherTrade || !user || !wishlistItem) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Get both wishlist IDs from both trades and the original wishlist item
      const wishlistIds = [
        wishlistItem.id,
        linkedTrade.wishlist?.id,
        otherTrade.wishlist?.id
      ]
      .filter(Boolean)
      .filter((id, index, self) => self.indexOf(id) === index);

      console.log('Wishlist IDs to delete:', wishlistIds);

      if (wishlistIds.length < 2) {
        throw new Error('Could not find both wishlist IDs');
      }

      // Get the IDs of the trades we're completing
      const completingTradeIds = [linkedTrade.id, otherTrade.id];

      console.log('Completing trade IDs:', completingTradeIds);

      // First, update the trades we're completing to COMPLETE status
      const { error: updateError } = await supabase
        .from('trades')
        .update({ status: TRADE_STATUS.COMPLETE })
        .in('id', completingTradeIds);

      if (updateError) {
        console.error('Error updating trades to complete:', updateError);
        throw updateError;
      }

      // Then, update all other trades for these wishlist items to REJECTED
      const { error: rejectError } = await supabase
        .from('trades')
        .update({ status: TRADE_STATUS.REJECTED })
        .in('wishlist_id', wishlistIds)
        .neq('status', TRADE_STATUS.COMPLETE); // Don't update the ones we just completed

      if (rejectError) {
        console.error('Error rejecting other trades:', rejectError);
        throw rejectError;
      }

      // Finally, remove the wishlist items
      const { error: deleteError } = await supabase
        .from('wishlists')
        .delete()
        .in('id', wishlistIds);

      if (deleteError) {
        console.error('Error deleting wishlist items:', deleteError);
        throw deleteError;
      }

      // Close modal and notify parent component
      onClose();
      onTradeCreated?.();
      showNotification('Trade completed successfully!', 'success');
    } catch (err) {
      console.error('Error completing trade:', err);
      setError('Failed to complete trade. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptOffer = async () => {
    if (!linkedTrade || !wishlistItem || !user) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Find both trades in the negotiating pair
      const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select(`
          id,
          linked_trade_id,
          status,
          offered_by,
          requested_date,
          card:card_id (*),
          wishlist:wishlist_id (
            id,
            user_id,
            users:user_id (username)
          )
        `)
        .in('id', [linkedTrade.id, linkedTrade.linked_trade_id])
        .eq('status', TRADE_STATUS.NEGOTIATING);

      if (tradesError) {
        console.error('Error fetching trades:', tradesError);
        throw tradesError;
      }

      if (!trades || trades.length !== 2) {
        console.error('Trades data:', trades);
        throw new Error(`Could not find both trades. Found ${trades?.length ?? 0} trades`);
      }

      console.log('Found trades:', trades);

      // Get the earliest trade (initial offer)
      const initialTrade = trades.reduce((earliest, current) => {
        const earliestDate = new Date(earliest.requested_date);
        const currentDate = new Date(current.requested_date);
        return currentDate < earliestDate ? current : earliest;
      }, trades[0]);

      console.log('Initial trade:', initialTrade);

      // Get the counter offer
      const counterOffer = trades.find(t => t.id !== initialTrade.id);
      if (!counterOffer) {
        console.error('Could not find counter offer. Initial trade:', initialTrade, 'All trades:', trades);
        throw new Error('Could not find counter offer');
      }

      console.log('Counter offer:', counterOffer);

      // Update both trades to ACCEPTED status
      const { error: acceptError } = await supabase
        .from('trades')
        .update({
          status: TRADE_STATUS.ACCEPTED
        })
        .in('id', [initialTrade.id, counterOffer.id]);

      if (acceptError) {
        console.error('Error updating trades:', acceptError);
        throw acceptError;
      }

      // Close modal and notify parent component
      onClose();
      onTradeCreated?.();
      showNotification('Trade accepted successfully!', 'success');
    } catch (err) {
      console.error('Error accepting offer:', err);
      setError('Failed to accept offer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add a function to check if the user is the initial offerer
  const isUserInitialOfferer = useCallback(() => {
    if (!linkedTrade || !user) return false;

    // Find both trades
    const trades = [linkedTrade];
    if (linkedTrade.linked_trade_id) {
      const otherTrade = trades.find(t => t.id === linkedTrade.linked_trade_id);
      if (otherTrade) trades.push(otherTrade);
    }

    if (trades.length !== 2) return false;

    // Get the earliest trade
    const initialTrade = trades.reduce((earliest, current) => {
      const earliestDate = new Date(earliest.requested_date);
      const currentDate = new Date(current.requested_date);
      return currentDate < earliestDate ? current : earliest;
    }, trades[0]);

    // Check if the user made the initial offer
    return initialTrade.offered_by === user.id;
  }, [linkedTrade, user]);

  const getUserTrade = useCallback(() => {
    if (!linkedTrade || !otherTrade || !user) return null;
    // Return the trade where the current user is the one who offered it
    return linkedTrade.offered_by === user.id ? linkedTrade : otherTrade;
  }, [linkedTrade, otherTrade, user]);

  const getOtherUserTrade = useCallback(() => {
    if (!linkedTrade || !otherTrade || !user) return null;
    // Return the trade where the current user is NOT the one who offered it
    return linkedTrade.offered_by === user.id ? otherTrade : linkedTrade;
  }, [linkedTrade, otherTrade, user]);

  if (!isOpen || !wishlistItem) return null;

  const userTrade = getUserTrade();
  const otherUserTrade = getOtherUserTrade();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold">Trade Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column - Card to Send */}
          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4 text-center">You Will Send</h3>
            {linkedTrade ? (
              <div className="flex flex-col items-center">
                {userTrade?.card.image_url && (
                  <img
                    src={userTrade.card.image_url}
                    alt={userTrade.card.card_name}
                    className="w-48 h-auto object-contain rounded mb-4"
                  />
                )}
                <div className="text-center">
                  <p className="font-medium">{userTrade?.card.card_name}</p>
                  <p className="text-sm text-gray-600">
                    #{String(userTrade?.card.card_number).padStart(3, '0')} · {userTrade?.card.pack}
                  </p>
                  <p className="text-sm text-gray-600">{userTrade?.card.card_rarity}</p>
                  {userTrade?.wishlist?.users && (
                    <p className="text-sm text-gray-600 mt-2">
                      Wishlisted by: {userTrade.wishlist.users.username}
                    </p>
                  )}
                </div>
              </div>
            ) : selectedCard ? (
              <div className="flex flex-col items-center">
                {selectedCard.image_url && (
                  <img
                    src={selectedCard.image_url}
                    alt={selectedCard.card_name}
                    className="w-48 h-auto object-contain rounded mb-4"
                  />
                )}
                <div className="text-center">
                  <p className="font-medium">{selectedCard.card_name}</p>
                  <p className="text-sm text-gray-600">
                    #{String(selectedCard.card_number).padStart(3, '0')} · {selectedCard.pack}
                  </p>
                  <p className="text-sm text-gray-600">{selectedCard.card_rarity}</p>
                  <p className="text-sm text-gray-600 mt-2">
                    Wishlisted by: {selectedCard.wishlist_user.username}
                  </p>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg h-64 flex items-center justify-center">
                <p className="text-gray-500 text-center">
                  Select a card from the list below<br />to offer for trade
                </p>
              </div>
            )}
          </div>

          {/* Right Column - Card to Receive */}
          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4 text-center">You Will Receive</h3>
            <div className="flex flex-col items-center">
              {linkedTrade ? (
                <>
                  {otherUserTrade?.card.image_url && (
                    <img
                      src={otherUserTrade.card.image_url}
                      alt={otherUserTrade.card.card_name}
                      className="w-48 h-auto object-contain rounded mb-4"
                    />
                  )}
                  <div className="text-center">
                    <p className="font-medium">{otherUserTrade?.card.card_name}</p>
                    <p className="text-sm text-gray-600">
                      #{String(otherUserTrade?.card.card_number).padStart(3, '0')} · {otherUserTrade?.card.pack}
                    </p>
                    <p className="text-sm text-gray-600">{otherUserTrade?.card.card_rarity}</p>
                    {otherUserTrade?.wishlist?.users && (
                      <p className="text-sm text-gray-600 mt-2">
                        Wishlisted by: {otherUserTrade.wishlist.users.username}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {wishlistItem.cards?.image_url && (
                    <img
                      src={wishlistItem.cards.image_url}
                      alt={wishlistItem.cards.card_name}
                      className="w-48 h-auto object-contain rounded mb-4"
                    />
                  )}
                  <div className="text-center">
                    <p className="font-medium">{wishlistItem.cards?.card_name}</p>
                    <p className="text-sm text-gray-600">
                      #{String(wishlistItem.cards?.card_number || '000').padStart(3, '0')} · {wishlistItem.cards?.pack}
                    </p>
                    <p className="text-sm text-gray-600">{wishlistItem.cards?.card_rarity}</p>
                    <p className="text-sm text-gray-600 mt-2">
                      Wishlisted by: {wishlistItem.users?.username}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Available Cards Selection - Only show if no linked trade */}
        {!linkedTrade && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Select a Card to Offer</h3>
            {loading ? (
              <p className="text-gray-600">Loading available cards...</p>
            ) : error ? (
              <p className="text-red-600">{error}</p>
            ) : tradeableCards.length === 0 ? (
              <p className="text-gray-600">No matching cards available for trade</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tradeableCards.map((card) => (
                  <div
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    className={`flex items-center space-x-4 p-4 rounded-lg cursor-pointer transition-colors ${
                      selectedCard?.id === card.id
                        ? 'bg-blue-50 border-2 border-blue-500'
                        : 'hover:bg-gray-50 border-2 border-transparent'
                    }`}
                  >
                    {card.image_url && (
                      <img
                        src={card.image_url}
                        alt={card.card_name}
                        className="w-16 h-auto object-contain rounded"
                      />
                    )}
                    <div>
                      <p className="font-medium">{card.card_name}</p>
                      <p className="text-sm text-gray-600">
                        #{String(card.card_number).padStart(3, '0')} · {card.pack}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 flex justify-end space-x-4">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          {linkedTrade ? (
            <button
              onClick={tradeStatus === TRADE_STATUS.ACCEPTED ? handleCompleteTrade : handleAcceptOffer}
              disabled={isSubmitting || (tradeStatus === TRADE_STATUS.NEGOTIATING && userMadeCounterOffer())}
              className="px-4 py-2 text-sm font-medium text-white rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting 
                ? (tradeStatus === TRADE_STATUS.ACCEPTED ? 'Completing Trade...' : 'Accepting Offer...') 
                : (tradeStatus === TRADE_STATUS.ACCEPTED 
                    ? 'Complete Trade' 
                    : (tradeStatus === TRADE_STATUS.NEGOTIATING && userMadeCounterOffer()
                        ? 'Awaiting decision...'
                        : 'Accept Offer'))}
            </button>
          ) : (
            <button
              onClick={handleMakeOffer}
              disabled={!selectedCard || isSubmitting}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                selectedCard && !isSubmitting
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Creating Offer...' : 'Make Offer'}
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <Notification
          message={notification.message}
          type={notification.type}
          isVisible={notification.isVisible}
          onClose={hideNotification}
        />
      </div>
    </div>
  );
} 