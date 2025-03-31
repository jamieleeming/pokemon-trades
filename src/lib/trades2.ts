import { supabase } from './supabase';
import { Trade2, TRADE_STATUS } from '../types';
import { createTradeNotification } from './notifications';
import { NOTIFICATION_TYPE } from '../types';

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
export async function createTrade2(offerId: string): Promise<Trade2 | null> {
  // First get the current user's ID
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error('Error getting user:', userError);
    return null;
  }

  const { data: trade, error } = await supabase
    .from('trades2')
    .insert({
      offer_id: offerId,
      status: TRADE_STATUS.OFFERED,
      offered_by: user.id
    })
    .select(`
      *,
      offer:offer_id (
        *,
        cards:card_id (*),
        users:user_id (*)
      ),
      offerer:offered_by (
        id,
        username
      )
    `)
    .single();

  if (error) {
    console.error('Error creating trade:', error);
    return null;
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
}

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

  // Send appropriate notification based on status
  if (trade) {
    const offererUserId = trade.offer?.users?.id;
    const requesterUserId = trade.request?.users?.id;
    const offererUsername = trade.offer?.users?.username || 'A user';
    const requesterUsername = trade.request?.users?.username || 'A user';
    const itemName = trade.offer?.cards?.card_name;

    switch (status) {
      case TRADE_STATUS.NEGOTIATING:
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
        // No notification for completed trades
        break;

      case TRADE_STATUS.REJECTED:
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