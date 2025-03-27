import React from 'react';
import { initializeDatabase } from '../lib/initDatabase';

const DbSetupGuide: React.FC<{ error: string }> = ({ error }) => {
  const [initializing, setInitializing] = React.useState(false);
  const [initError, setInitError] = React.useState<string | null>(null);

  const handleInitialize = async () => {
    setInitializing(true);
    setInitError(null);

    try {
      const result = await initializeDatabase();
      if (!result.success) {
        setInitError('Failed to initialize database. Please try again.');
      }
    } catch (error) {
      setInitError('An unexpected error occurred. Please try again.');
    } finally {
      setInitializing(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-lg">
      <h2 className="mb-4 text-2xl font-bold text-gray-800">Database Setup Required</h2>
      <p className="mb-4 text-gray-600">
        {error.includes('relation') ? (
          'The required database tables have not been set up yet.'
        ) : (
          'There was an error connecting to the database.'
        )}
      </p>
      <button
        onClick={handleInitialize}
        disabled={initializing}
        className={`rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 ${
          initializing ? 'cursor-not-allowed opacity-50' : ''
        }`}
      >
        {initializing ? 'Initializing...' : 'Initialize Database'}
      </button>
      {initError && (
        <p className="mt-4 text-sm text-red-600">{initError}</p>
      )}
    </div>
  );
};

export default DbSetupGuide; 