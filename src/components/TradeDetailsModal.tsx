import React, { useEffect, useRef } from 'react';
import { Trade, TRADE_STATUS } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface TradeDetailsModalProps {
  trade: Trade | null;
  isOpen: boolean;
  onClose: () => void;
  onOfferTrade?: (tradeId: number) => Promise<void>;
  onRescindOffer?: (tradeId: number) => Promise<void>;
  onRejectOffer?: (tradeId: number) => Promise<void>;
  onAcceptOffer?: (tradeId: number) => Promise<void>;
  onDeleteTrade?: (tradeId: number) => Promise<void>;
  isProcessing?: boolean;
  processingTradeId?: number | null;
}

const TradeDetailsModal: React.FC<TradeDetailsModalProps> = ({
  trade,
  isOpen,
  onClose,
  onOfferTrade,
  onRescindOffer,
  onRejectOffer,
  onAcceptOffer,
  onDeleteTrade,
  isProcessing = false,
  processingTradeId = null
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

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

  // Check permissions for each action
  const canOfferTrade = trade && 
    trade.status === TRADE_STATUS.OPEN && 
    user && 
    trade.users?.id !== user.id &&
    onOfferTrade;

  const canCancelOffer = trade && 
    trade.status === TRADE_STATUS.OFFERED && 
    user && 
    trade.offered_by === user.id &&
    onRescindOffer;

  const canAcceptOffer = trade && 
    trade.status === TRADE_STATUS.OFFERED && 
    user && 
    trade.users?.id === user.id && 
    trade.offered_by &&
    onAcceptOffer;

  const canRejectOffer = trade && 
    trade.status === TRADE_STATUS.OFFERED && 
    user && 
    trade.users?.id === user.id && 
    trade.offered_by &&
    onRejectOffer;

  const canDeleteTrade = trade && 
    trade.status === TRADE_STATUS.OPEN && 
    user && 
    trade.users?.id === user.id && 
    !trade.offered_by &&
    onDeleteTrade;

  // Handle actions
  const handleOfferClick = async () => {
    if (trade && onOfferTrade) {
      await onOfferTrade(trade.id);
      onClose();
    }
  };

  const handleCancelOfferClick = async () => {
    if (trade && onRescindOffer) {
      await onRescindOffer(trade.id);
      onClose();
    }
  };

  const handleAcceptOfferClick = async () => {
    if (trade && onAcceptOffer) {
      await onAcceptOffer(trade.id);
      onClose();
    }
  };

  const handleRejectOfferClick = async () => {
    if (trade && onRejectOffer) {
      await onRejectOffer(trade.id);
      onClose();
    }
  };

  const handleDeleteTradeClick = async () => {
    if (trade && onDeleteTrade) {
      await onDeleteTrade(trade.id);
      onClose();
    }
  };

  if (!isOpen || !trade) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div 
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 flex justify-between items-center border-b p-4 bg-white">
          <h3 className="text-xl font-semibold text-gray-900">Trade Details</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none p-2"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {/* Card Information */}
          <div className="mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex flex-row items-start">
                {trade.cards?.image_url && (
                  <div className="mr-4 flex-shrink-0">
                    <img 
                      src={trade.cards.image_url} 
                      alt={trade.cards.card_name || 'Card'} 
                      className="h-36 w-auto object-contain rounded"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="flex-grow">
                  <p className="font-semibold text-lg mb-2">{trade.cards?.card_name || 'Unknown Card'}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Card #:</span> {String(trade.cards?.card_number || '000').padStart(3, '0')}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Pack:</span> {trade.cards?.pack || 'Unknown'}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Rarity:</span> {trade.cards?.card_rarity || 'Unknown'}
                    </p>
                    {trade.cards?.card_element && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Element:</span> {trade.cards.card_element}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trade Details - Combined Section */}
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-800 mb-3">Information</h4>
            <div className="bg-gray-50 rounded-lg divide-y divide-gray-200">
              {/* Trade Owner Information */}
              <div className="p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Trade Owner</p>
                <p className="text-sm">
                  <span className="font-medium">Username:</span>{' '}
                  {trade.users?.username || 'Unknown User'}
                </p>
                {trade.users?.friend_code && (
                  <p className="text-sm mt-2">
                    <span className="font-medium">Friend Code:</span>{' '}
                    {trade.users.friend_code}
                  </p>
                )}
              </div>

              {/* Offerer Information - show if there's an offer or if trade is accepted */}
              {(trade.offered_by || trade.status === TRADE_STATUS.ACCEPTED) && trade.offerers && (
                <div className="p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Trade Offerer</p>
                  <p className="text-sm">
                    <span className="font-medium">Username:</span>{' '}
                    {trade.offerers.username || 'Unknown User'}
                  </p>
                  {trade.offerers.friend_code && (
                    <p className="text-sm mt-2">
                      <span className="font-medium">Friend Code:</span>{' '}
                      {trade.offerers.friend_code}
                    </p>
                  )}
                </div>
              )}

              {/* Trade Status Information */}
              <div className="p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Status Information</p>
                <p className="text-sm">
                  <span className="font-medium">Date Requested:</span>{' '}
                  {new Date(trade.requested_date).toLocaleDateString()}
                </p>
                <p className="text-sm mt-2">
                  <span className="font-medium">Status:</span>{' '}
                  {renderTradeStatus(trade)}
                </p>
              </div>
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="mt-4 flex flex-col space-y-3">
            {/* Offer trade button */}
            {canOfferTrade && (
              <button
                onClick={handleOfferClick}
                disabled={isProcessing && processingTradeId === trade.id}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50"
              >
                {isProcessing && processingTradeId === trade.id ? 'Processing...' : 'Offer Trade'}
              </button>
            )}

            {/* Cancel offer button */}
            {canCancelOffer && (
              <button
                onClick={handleCancelOfferClick}
                disabled={isProcessing && processingTradeId === trade.id}
                className="w-full py-2 px-4 bg-gray-500 hover:bg-gray-600 text-white rounded-md font-medium transition-colors disabled:opacity-50"
              >
                {isProcessing && processingTradeId === trade.id ? 'Processing...' : 'Cancel Offer'}
              </button>
            )}

            {/* Accept offer button */}
            {canAcceptOffer && (
              <button
                onClick={handleAcceptOfferClick}
                disabled={isProcessing && processingTradeId === trade.id}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50"
              >
                {isProcessing && processingTradeId === trade.id ? 'Processing...' : 'Accept Offer'}
              </button>
            )}

            {/* Reject offer button */}
            {canRejectOffer && (
              <button
                onClick={handleRejectOfferClick}
                disabled={isProcessing && processingTradeId === trade.id}
                className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-md font-medium transition-colors disabled:opacity-50"
              >
                {isProcessing && processingTradeId === trade.id ? 'Processing...' : 'Reject Offer'}
              </button>
            )}

            {/* Delete trade button */}
            {canDeleteTrade && (
              <button
                onClick={handleDeleteTradeClick}
                disabled={isProcessing && processingTradeId === trade.id}
                className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-md font-medium transition-colors disabled:opacity-50"
              >
                {isProcessing && processingTradeId === trade.id ? 'Processing...' : 'Delete Trade'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to render trade status
const renderTradeStatus = (trade: Trade) => {
  switch (trade.status) {
    case TRADE_STATUS.OPEN:
      return (
        <span className="rounded-full bg-white border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-800 ml-1">
          Open
        </span>
      );
    case TRADE_STATUS.OFFERED:
      return (
        <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800 ml-1">
          Offered
        </span>
      );
    case TRADE_STATUS.ACCEPTED:
      return (
        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 ml-1">
          Accepted
        </span>
      );
    case TRADE_STATUS.COMPLETE:
      return (
        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 ml-1">
          Complete
        </span>
      );
    default:
      return (
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800 ml-1">
          Unknown
        </span>
      );
  }
};

export default TradeDetailsModal; 