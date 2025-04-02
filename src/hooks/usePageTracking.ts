import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    gtag: (command: string, ...args: any[]) => void;
  }
}

// Map of routes to page titles
const PAGE_TITLES: { [key: string]: string } = {
  '/': 'Home - Pocket Trades',
  '/login': 'Sign In - Pocket Trades',
  '/requests': 'Trade Requests - Pocket Trades',
  '/offers': 'Trade Offers - Pocket Trades',
  '/cards': 'Card Collection - Pocket Trades',
  '/reset-password': 'Reset Password - Pocket Trades'
};

const usePageTracking = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag !== 'undefined') {
      const pageTitle = PAGE_TITLES[location.pathname] || 'Pocket Trades';
      
      // Configure this page view
      window.gtag('config', 'G-54HZL1LCJ2', {
        page_title: pageTitle,
        page_path: location.pathname + location.search + location.hash
      });

      // Also send as an event for more detailed tracking
      window.gtag('event', 'page_view', {
        page_title: pageTitle,
        page_location: window.location.href,
        page_path: location.pathname + location.search + location.hash
      });
    }
  }, [location]);
};

export default usePageTracking; 