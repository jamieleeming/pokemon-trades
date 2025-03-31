import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { NOTIFICATION_TYPE, TradeNotification } from '../types';

// Cache duration in milliseconds (1 minute)
const CACHE_DURATION = 60 * 1000;
// Debounce delay for refresh (500ms)
const REFRESH_DEBOUNCE = 500;

const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<TradeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { user } = useAuth();
  const notificationRef = useRef<HTMLDivElement>(null);
  
  // Refs for caching and loading state
  const lastLoadTimeRef = useRef(0);
  const isLoadingRef = useRef(false);
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();
  const subscriptionRef = useRef<any>(null);
  
  // Check if data needs refresh
  const needsRefresh = useCallback(() => {
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    return timeSinceLastLoad > CACHE_DURATION;
  }, []);

  // Debounced refresh function
  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      fetchNotifications(true);
    }, REFRESH_DEBOUNCE);
  }, []);
  
  const fetchNotifications = useCallback(async (forceRefresh = false) => {
    if (!user) return;
    if (isLoadingRef.current) return;
    if (!forceRefresh && !needsRefresh()) return;
    
    isLoadingRef.current = true;
    setLoading(true);
    
    try {
      setError(null);
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        setNotifications(data as TradeNotification[]);
        setUnreadCount(data.filter(notification => !notification.viewed).length);
        lastLoadTimeRef.current = Date.now();
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setError('Failed to load notifications');
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [user, needsRefresh]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user) return;

    // Subscribe to new notifications
    const subscription = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          debouncedRefresh();
        }
      )
      .subscribe();

    subscriptionRef.current = subscription;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [user, debouncedRefresh]);
  
  // Initial load
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    
    fetchNotifications(true);
  }, [user, fetchNotifications]);
  
  // Handle click outside to close panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Get notification icon based on type
  const getNotificationIcon = (type: NOTIFICATION_TYPE) => {
    switch (type) {
      case NOTIFICATION_TYPE.OFFER_RECEIVED:
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        );
      case NOTIFICATION_TYPE.TRADE_ACCEPTED:
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case NOTIFICATION_TYPE.OFFER_REJECTED:
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case NOTIFICATION_TYPE.COUNTEROFFER_RECEIVED:
        return (
          <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        );
      default:
        return null;
    }
  };

  // Optimistic update for marking as viewed
  const markAsViewed = useCallback(async (id: string) => {
    if (!user) return;
    
    // Optimistic update
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id ? { ...notification, viewed: true } : notification
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ viewed: true })
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error marking notification as viewed:', error);
      // Revert optimistic update on error
      debouncedRefresh();
    }
  }, [user, debouncedRefresh]);
  
  // Optimistic update for marking all as viewed
  const markAllAsViewed = useCallback(async () => {
    if (!user) return;
    
    // Optimistic update
    setNotifications(prev => 
      prev.map(notification => ({ ...notification, viewed: true }))
    );
    setUnreadCount(0);
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ viewed: true })
        .eq('user_id', user.id)
        .eq('viewed', false);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error marking all notifications as viewed:', error);
      // Revert optimistic update on error
      debouncedRefresh();
    }
  }, [user, debouncedRefresh]);
  
  const toggleNotifications = useCallback(() => {
    setIsOpen(!isOpen);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, []);

  return (
    <div className="relative" ref={notificationRef}>
      <button 
        onClick={toggleNotifications}
        className="relative p-1 text-gray-600 hover:text-gray-900 focus:outline-none"
        aria-label="Notifications"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-5 w-5" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" 
          />
        </svg>
        
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full min-w-[18px] h-[18px]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg z-50 overflow-hidden">
          <div className="py-2 px-3 bg-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsViewed}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Mark all as read
              </button>
            )}
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 border-b border-red-100">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No notifications yet</div>
          ) : (
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {notifications.map(notification => (
                <div 
                  key={notification.id} 
                  className={`p-4 hover:bg-gray-50 ${!notification.viewed ? 'bg-blue-50' : ''}`}
                  onClick={() => markAsViewed(notification.id)}
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-3">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{notification.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!notification.viewed && (
                      <div className="ml-3 flex-shrink-0">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-600"></span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter; 