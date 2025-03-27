import React from 'react';

interface NotificationProps {
  message: string;
  type: 'success' | 'error';
  isVisible: boolean;
  onClose: () => void;
}

const Notification: React.FC<NotificationProps> = ({ message, type, isVisible, onClose }) => {
  if (!isVisible) return null;
  
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-lg p-4 shadow-lg transition-all ${
        type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
      }`}
      role="alert"
    >
      <div className="flex items-center">
        <div className="flex-1 text-sm font-medium">{message}</div>
        <button
          onClick={onClose}
          className="ml-4 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-black hover:bg-opacity-10"
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default Notification; 