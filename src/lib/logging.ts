// Add timestamp to logs for tracking timing
export const logWithTimestamp = (message: string, data?: any) => {
  // Skip logging in production
  if (process.env.NODE_ENV === 'production') return;
  
  // List of messages to filter out
  const filteredMessages = [
    'Initializing auth state',
    'Auth state changed',
    'Auth state changed in context',
    'Manually refreshing session',
    'Starting data load, checking authentication',
    'Skipping duplicate load request',
    'Loading trades data',
    'Trades data loaded'
  ];
  
  // Check if message should be filtered
  if (filteredMessages.some(filter => message.includes(filter))) {
    return;
  }
  
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data || '');
}; 