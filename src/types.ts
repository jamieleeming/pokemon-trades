// Database Types
export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  friend_code: string | null;
  created_at: string;
}

export interface Card {
  id: string;
  pack: string;
  card_number: string;
  card_name: string;
  card_type: string;
  card_rarity: string;
  tradeable: boolean;
  image_url: string;
  card_element: string;
  wishlisted?: boolean;
}

export enum TRADE_STATUS {
  OPEN = "open",
  OFFERED = "offered",
  ACCEPTED = "accepted",
  COMPLETE = "complete",
  NEGOTIATING = "negotiating",
  REJECTED = "rejected"
}

export interface Trade {
  id: number;
  card_id: string;
  user_id: string;
  offered_by: string | null;
  requested_date: string;
  accepted_date?: string | null;
  status: TRADE_STATUS;
  wishlist_id: string | null;
  linked_trade_id: number | null;
  cards?: Card;
  users?: User;
  offerers?: User | null;
}

// New trades2 table interface
export interface Trade2 {
  id: string;
  status: TRADE_STATUS;
  offer_id: string;
  request_id: string | null;
  offered_by: string;
  offered_to: string;
  offered_at: string;
  requested_at: string | null;
  offer?: WishlistItem;
  request?: WishlistItem;
  offerer?: User;
}

// Auth Types
export interface UserData {
  name: string;
  username: string;
  friend_code?: string;
}

// Component Props Types
export interface NotificationProps {
  message: string;
  type: 'success' | 'error';
  isVisible: boolean;
  onClose: () => void;
}

export interface WishlistItem {
  id: string;
  created_at: string;
  user_id: string;
  card_id: string;
  traded: boolean;
  cards?: Card;
  users?: {
    id: string;
    username: string;
    friend_code: string;
  };
}

export enum NOTIFICATION_TYPE {
  OFFER_RECEIVED = 'OFFER_RECEIVED',
  COUNTEROFFER_RECEIVED = 'COUNTEROFFER_RECEIVED',
  TRADE_ACCEPTED = 'TRADE_ACCEPTED',
  OFFER_REJECTED = 'OFFER_REJECTED'
}

export interface TradeNotification {
  id: string;
  created_at: string;
  user_id: string;
  type: NOTIFICATION_TYPE;
  message: string;
  viewed: boolean;
  metadata: {
    actorUsername: string;
    wishlistItemName?: string;
    cardName?: string;
  };
}

// Helper functions to generate consistent notification messages
export const createNotificationMessage = (
  type: NOTIFICATION_TYPE,
  actorUsername: string,
  wishlistItemName?: string,
  cardName?: string
): string => {
  switch (type) {
    case NOTIFICATION_TYPE.OFFER_RECEIVED:
      return `Someone has offered you a ${wishlistItemName}`;
    case NOTIFICATION_TYPE.COUNTEROFFER_RECEIVED:
      return `${actorUsername} has responded to your ${wishlistItemName} offer`;
    case NOTIFICATION_TYPE.TRADE_ACCEPTED:
      return `${actorUsername} has accepted your ${wishlistItemName} offer`;
    case NOTIFICATION_TYPE.OFFER_REJECTED:
      return `${actorUsername} declined your offer for ${wishlistItemName}`;
    default:
      return '';
  }
}; 