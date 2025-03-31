import { supabase } from './supabase';
import { NOTIFICATION_TYPE, createNotificationMessage } from '../types';

interface CreateTradeNotificationParams {
  userId: string;
  type: NOTIFICATION_TYPE;
  actorUsername: string;
  wishlistItemName?: string;
  cardName?: string;
}

export const createTradeNotification = async ({
  userId,
  type,
  actorUsername,
  wishlistItemName,
  cardName
}: CreateTradeNotificationParams) => {
  try {
    const message = createNotificationMessage(type, actorUsername, wishlistItemName, cardName);
    
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        message,
        viewed: false,
        metadata: {
          actorUsername,
          wishlistItemName,
          cardName
        }
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}; 