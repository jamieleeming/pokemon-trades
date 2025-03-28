import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Notification {
  id: string;
  created_at: string;
  user_id: string;
  message: string;
  viewed: boolean;
}

const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const fetchAttemptsRef = useRef(0);
  const lastFetchTimeRef = useRef(0);
  
  const { user } = useAuth();
  const notificationRef = useRef<HTMLDivElement>(null);
  
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
  
  const fetchNotifications = useCallback(async (forceRefresh = false) => {
    if (!user) return;
    
    const now = Date.now();
    if (!forceRefresh && fetchAttemptsRef.current > 3 && now - lastFetchTimeRef.current < 60000) {
      console.log('Skipping notification fetch - too many recent attempts');
      return;
    }
    
    fetchAttemptsRef.current += 1;
    lastFetchTimeRef.current = now;
    
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(notification => !notification.viewed).length);
        fetchAttemptsRef.current = 0;
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setError('Failed to load notifications. Please try again later.');
      
      if (isInitialized) {
        console.log('Using cached notification data due to fetch error');
      }
    } finally {
      setLoading(false);
    }
  }, [user, isInitialized]);
  
  // Initial load when user is available
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    
    // Initial fetch on component mount
    fetchNotifications(true);
    
    // We don't need to clean up anything since we've removed the subscription
  }, [user, fetchNotifications]);
  
  // Fetch notifications when the panel is opened
  useEffect(() => {
    if (isOpen && user) {
      console.log('Notification panel opened, fetching latest notifications');
      fetchNotifications(true);
    }
  }, [isOpen, user, fetchNotifications]);
  
  const markAsViewed = async (id: string) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ viewed: true })
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) {
        throw error;
      }
      
      setNotifications(prevNotifications => 
        prevNotifications.map(notification => 
          notification.id === id ? { ...notification, viewed: true } : notification
        )
      );
      
      setUnreadCount(prevCount => Math.max(0, prevCount - 1));
    } catch (error) {
      console.error('Error marking notification as viewed:', error);
    }
  };
  
  const markAllAsViewed = async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ viewed: true })
        .eq('user_id', user.id)
        .eq('viewed', false);
      
      if (error) {
        throw error;
      }
      
      setNotifications(prevNotifications => 
        prevNotifications.map(notification => ({ ...notification, viewed: true }))
      );
      
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as viewed:', error);
    }
  };
  
  const toggleNotifications = () => {
    setIsOpen(!isOpen);
  };
  
  const handleRefresh = () => {
    fetchNotifications(true);
  };
  
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
            <div className="flex items-center space-x-2">
              <button 
                onClick={handleRefresh}
                className="text-xs text-blue-600 hover:text-blue-800"
                title="Refresh notifications"
              >
                Refresh
              </button>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsViewed}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>
          
          <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
            {error && !notifications.length ? (
              <div className="p-4 text-center text-red-500">{error}</div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No notifications yet</div>
            ) : (
              notifications.map(notification => (
                <div 
                  key={notification.id} 
                  className={`p-4 hover:bg-gray-50 ${!notification.viewed ? 'bg-blue-50' : ''}`}
                  onClick={() => markAsViewed(notification.id)}
                >
                  <div className="flex items-start">
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
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter; 