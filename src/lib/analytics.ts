// Event categories
export const EVENT_CATEGORY = {
  AUTH: 'authentication',
  TRADE: 'trade',
  CARD: 'card',
  USER: 'user',
  NOTIFICATION: 'notification'
} as const;

// Analytics event tracking utility
const trackEvent = (
  category: string,
  action: string,
  label?: string,
  value?: number
) => {
  // Log the event for development testing
  console.log('📊 Analytics Event:', { category, action, label, value });
  
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};

// Authentication Events
export const trackAuth = {
  signUp: () => trackEvent(EVENT_CATEGORY.AUTH, 'sign_up'),
  signIn: () => trackEvent(EVENT_CATEGORY.AUTH, 'sign_in'),
  signOut: () => trackEvent(EVENT_CATEGORY.AUTH, 'sign_out'),
  passwordReset: () => trackEvent(EVENT_CATEGORY.AUTH, 'password_reset'),
};

// Trade Events
export const trackTrade = {
  createOffer: (cardName: string) => 
    trackEvent(EVENT_CATEGORY.TRADE, 'create_offer', cardName),
  acceptOffer: (cardName: string) => 
    trackEvent(EVENT_CATEGORY.TRADE, 'accept_offer', cardName),
  rejectOffer: (cardName: string) => 
    trackEvent(EVENT_CATEGORY.TRADE, 'reject_offer', cardName),
  counterOffer: (cardName: string) => 
    trackEvent(EVENT_CATEGORY.TRADE, 'counter_offer', cardName),
  completeTrade: (cardName: string) => 
    trackEvent(EVENT_CATEGORY.TRADE, 'complete_trade', cardName),
};

// Card Events
export const trackCard = {
  search: (searchTerm: string) => 
    trackEvent(EVENT_CATEGORY.CARD, 'search', searchTerm),
  addToWishlist: (cardName: string) => 
    trackEvent(EVENT_CATEGORY.CARD, 'add_to_wishlist', cardName),
  removeFromWishlist: (cardName: string) => 
    trackEvent(EVENT_CATEGORY.CARD, 'remove_from_wishlist', cardName),
  view: (cardName: string) => 
    trackEvent(EVENT_CATEGORY.CARD, 'view_card', cardName),
  filter: (filterType: string) => 
    trackEvent(EVENT_CATEGORY.CARD, 'apply_filter', filterType),
  sort: (sortType: string) => 
    trackEvent(EVENT_CATEGORY.CARD, 'apply_sort', sortType),
};

// User Events
export const trackUser = {
  updateProfile: () => trackEvent(EVENT_CATEGORY.USER, 'update_profile'),
  updateFriendCode: () => trackEvent(EVENT_CATEGORY.USER, 'update_friend_code'),
  openNotification: () => trackEvent(EVENT_CATEGORY.USER, 'open_notification'),
  clickNavigation: (itemName: string) => 
    trackEvent(EVENT_CATEGORY.USER, 'click_navigation', itemName),
};

// Notification Events
export const trackNotification = {
  view: (type: string) => 
    trackEvent(EVENT_CATEGORY.NOTIFICATION, 'view', type),
  click: (type: string) => 
    trackEvent(EVENT_CATEGORY.NOTIFICATION, 'click', type),
  dismiss: (type: string) => 
    trackEvent(EVENT_CATEGORY.NOTIFICATION, 'dismiss', type),
}; 