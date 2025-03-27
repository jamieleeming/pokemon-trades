import React, { useEffect, useRef } from 'react';
import { Trade } from '../types';

interface TradeDetailsModalProps {
  trade: Trade | null;
  isOpen: boolean;
  onClose: () => void;
}

const TradeDetailsModal: React.FC<TradeDetailsModalProps> = ({ trade, isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !trade) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div 
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="text-xl font-semibold text-gray-900">Trade Details</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {/* Card Information */}
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-800 mb-2">Card Information</h4>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="flex items-start space-x-4">
                {trade.cards?.image_url && (
                  <img 
                    src={trade.cards.image_url} 
                    alt={trade.cards.card_name || 'Card'} 
                    className="h-24 w-auto object-contain rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div>
                  <p className="font-semibold">{trade.cards?.card_name || 'Unknown Card'}</p>
                  <p className="text-sm text-gray-500">#{String(trade.cards?.card_number || '000').padStart(3, '0')}</p>
                  <p className="text-sm text-gray-500">Pack: {trade.cards?.pack || 'Unknown'}</p>
                  <p className="text-sm text-gray-500">Rarity: {trade.cards?.card_rarity || 'Unknown'}</p>
                  {trade.cards?.card_element && (
                    <p className="text-sm text-gray-500">Element: {trade.cards.card_element}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Trade Information */}
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-800 mb-2">Trade Information</h4>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="mb-1">
                <span className="font-medium">Requested by:</span>{' '}
                {trade.users?.username || 'Unknown User'}
              </p>
              {trade.users?.friend_code && (
                <p className="mb-1">
                  <span className="font-medium">Friend Code:</span>{' '}
                  {trade.users.friend_code}
                </p>
              )}
              <p className="mb-1">
                <span className="font-medium">Date Requested:</span>{' '}
                {new Date(trade.requested_date).toLocaleDateString()}
              </p>
              <p className="mb-1">
                <span className="font-medium">Status:</span>{' '}
                {trade.offered_by ? (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                    Offer Available
                  </span>
                ) : (
                  <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
                    Searching
                  </span>
                )}
              </p>
              {trade.offered_by && trade.offerers && (
                <div className="mt-2">
                  <p className="font-medium">Offered by: {trade.offerers.username || 'Unknown User'}</p>
                  {trade.offerers.friend_code && (
                    <p className="text-sm text-gray-500">Friend Code: {trade.offerers.friend_code}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeDetailsModal; 