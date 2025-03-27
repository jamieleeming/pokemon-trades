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
  traded?: boolean;
}

export interface Trade {
  id: number;
  card_id: string;
  user_id: string;
  offered_by: string | null;
  requested_date: string;
  cards?: Card;
  users?: User;
  offerers?: User | null;
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