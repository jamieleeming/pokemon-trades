import { supabase } from './supabase';
import { Trade2, TRADE_STATUS } from '../types';
import { createTradeNotification } from './notifications';
import { NOTIFICATION_TYPE } from '../types';
import { trackTrade } from './analytics';

// Fetch a trade by ID with related wishlist items
export async function getTrade2ById(id: string): Promise<Trade2 | null> {
  const { data, error } = await supabase
    .from('trades2')
    .select(`
      *,
      offer:offer_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      ),
      request:request_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching trade:', error);
    return null;
  }

  return data;
}

// Create a new trade
export const createTrade2 = async (wishlistId: string) => {
  try {
    // Get the wishlist item first to get the user_id
    const { data: wishlistData, error: wishlistError } = await supabase
      .from('wishlists')
      .select('user_id')
      .eq('id', wishlistId)
      .single();

    if (wishlistError) throw wishlistError;
    if (!wishlistData) throw new Error('Wishlist item not found');

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('User not authenticated');

    // Create the trade with offered_to set to the wishlist owner's user_id
    const { data: trade, error: tradeError } = await supabase
      .from('trades2')
      .insert({
        offer_id: wishlistId,
        status: TRADE_STATUS.OFFERED,
        offered_at: new Date().toISOString(),
        offered_by: user.id,
        offered_to: wishlistData.user_id
      })
      .select()
      .single();

    if (tradeError) throw tradeError;

    // Track the offer creation
    if (trade?.offer?.cards?.card_name) {
      trackTrade.createOffer(trade.offer.cards.card_name);
    }

    // Send notification to the recipient
    if (trade?.offer?.users?.id) {
      await createTradeNotification({
        userId: trade.offer.users.id,
        type: NOTIFICATION_TYPE.OFFER_RECEIVED,
        actorUsername: trade.offerer?.username || 'A user',
        wishlistItemName: trade.offer.cards?.card_name,
        cardName: trade.offer.cards?.card_name
      });
    }

    return trade;
  } catch (error) {
    console.error('Error creating trade:', error);
    throw error;
  }
};

// Update a trade's status
export async function updateTrade2Status(
  tradeId: string, 
  status: TRADE_STATUS,
  requestId?: string
): Promise<Trade2 | null> {
  const updateData: Partial<Trade2> = {
    status,
    ...(requestId && { request_id: requestId }),
    ...(status === TRADE_STATUS.NEGOTIATING && { requested_at: new Date().toISOString() })
  };

  const { data: trade, error } = await supabase
    .from('trades2')
    .update(updateData)
    .eq('id', tradeId)
    .select(`
      *,
      offer:offer_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      ),
      request:request_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      )
    `)
    .single();

  if (error) {
    console.error('Error updating trade status:', error);
    return null;
  }

  // Track trade status changes and send notifications
  if (trade) {
    const offererUserId = trade.offer?.users?.id;
    const requesterUsername = trade.request?.users?.username || 'A user';
    const itemName = trade.offer?.cards?.card_name || 'Unknown Card';

    switch (status) {
      case TRADE_STATUS.NEGOTIATING:
        // Track counter offer
        trackTrade.counterOffer(itemName);
        // Notify offerer about counteroffer
        if (offererUserId) {
          await createTradeNotification({
            userId: offererUserId,
            type: NOTIFICATION_TYPE.COUNTEROFFER_RECEIVED,
            actorUsername: requesterUsername,
            wishlistItemName: itemName
          });
        }
        break;

      case TRADE_STATUS.ACCEPTED:
        // Track accepted offer
        trackTrade.acceptOffer(itemName);
        // Notify offerer that their trade was accepted
        if (offererUserId) {
          await createTradeNotification({
            userId: offererUserId,
            type: NOTIFICATION_TYPE.TRADE_ACCEPTED,
            actorUsername: requesterUsername,
            wishlistItemName: itemName
          });
        }
        break;

      case TRADE_STATUS.COMPLETE:
        // Track completed trade
        trackTrade.completeTrade(itemName);
        break;

      case TRADE_STATUS.REJECTED:
        // Track rejected offer
        trackTrade.rejectOffer(itemName);
        // Notify offerer that their trade was rejected
        if (offererUserId) {
          await createTradeNotification({
            userId: offererUserId,
            type: NOTIFICATION_TYPE.OFFER_REJECTED,
            actorUsername: requesterUsername,
            wishlistItemName: itemName
          });
        }
        break;
    }
  }

  return trade;
}

// Get all trades for a wishlist item (either as offer or request)
export async function getTradesForWishlistItem(wishlistId: string): Promise<Trade2[]> {
  const { data, error } = await supabase
    .from('trades2')
    .select(`
      *,
      offer:offer_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      ),
      request:request_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      )
    `)
    .or(`offer_id.eq.${wishlistId},request_id.eq.${wishlistId}`);

  if (error) {
    console.error('Error fetching trades for wishlist item:', error);
    return [];
  }

  return data || [];
}

// Delete a trade
export async function deleteTrade2(tradeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('trades2')
    .delete()
    .eq('id', tradeId);

  if (error) {
    console.error('Error deleting trade:', error);
    return false;
  }

  return true;
}

// Get all trades with a specific status
export async function getTrades2ByStatus(status: TRADE_STATUS): Promise<Trade2[]> {
  const { data, error } = await supabase
    .from('trades2')
    .select(`
      *,
      offer:offer_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      ),
      request:request_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      )
    `)
    .eq('status', status);

  if (error) {
    console.error('Error fetching trades by status:', error);
    return [];
  }

  return data || [];
}

// Get all trades for a user (where they are either the offerer or requester)
export async function getTrades2ForUser(userId: string): Promise<Trade2[]> {
  const { data, error } = await supabase
    .from('trades2')
    .select(`
      *,
      offer:offer_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      ),
      request:request_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      )
    `)
    .or(`offer->user_id.eq.${userId},request->user_id.eq.${userId}`);

  if (error) {
    console.error('Error fetching trades for user:', error);
    return [];
  }

  return data || [];
} 