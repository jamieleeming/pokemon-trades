import { supabase } from './supabase';
import { Trade2, TRADE_STATUS } from '../types';

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
  const { data, error } = await supabase
    .from('trades2')
    .insert({
      offer_id: offerId,
      status: TRADE_STATUS.OPEN
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating trade:', error);
    return null;
  }

  return data;
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

  const { data, error } = await supabase
    .from('trades2')
    .update(updateData)
    .eq('id', tradeId)
    .select()
    .single();

  if (error) {
    console.error('Error updating trade status:', error);
    return null;
  }

  return data;
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