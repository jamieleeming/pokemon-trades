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
  id: string; // UUID
  offered_at: string; // timestamp with time zone
  requested_at: string | null; // timestamp with time zone
  offer_id: string | null; // UUID referencing wishlists.id
  request_id: string | null; // UUID referencing wishlists.id
  status: TRADE_STATUS;
  offered_by: string | null; // UUID referencing users.id
  // Include optional joined fields for convenience
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