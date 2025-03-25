import React from 'react';
import { initDatabase } from '../utils/initDatabase';

const DbSetupGuide: React.FC<{ error: string }> = ({ error }) => {
  const [initializing, setInitializing] = React.useState(false);
  const [initResult, setInitResult] = React.useState<{ success: boolean; error?: string } | null>(null);

  const runInit = async () => {
    setInitializing(true);
    try {
      const result = await initDatabase();
      setInitResult(result);
    } catch (err) {
      setInitResult({ 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      });
    } finally {
      setInitializing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Database Setup Guide</h2>
      
      <div className="mb-4 p-4 bg-yellow-50 rounded border border-yellow-200">
        <h3 className="font-medium mb-2">Current Issue:</h3>
        <p className="text-red-600">{error}</p>
      </div>
      
      <div className="mb-6">
        <h3 className="font-medium mb-2">Required Supabase Setup:</h3>
        <p className="mb-2">This application requires three tables in your Supabase database:</p>
        <ol className="list-decimal pl-5 space-y-2 mb-4">
          <li><code className="bg-gray-100 px-1 rounded">users</code> - Stores user profiles</li>
          <li><code className="bg-gray-100 px-1 rounded">cards</code> - Stores card information</li>
          <li><code className="bg-gray-100 px-1 rounded">trades</code> - Records trade offers and requests</li>
        </ol>
        
        <details className="mb-4">
          <summary className="cursor-pointer font-medium text-blue-600 hover:text-blue-800">
            View SQL Table Definitions
          </summary>
          <div className="p-3 mt-2 bg-gray-50 rounded overflow-x-auto">
            <pre className="text-xs">
{`-- Users Table
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  friend_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Cards Table
CREATE TABLE public.cards (
  id SERIAL PRIMARY KEY,
  pack TEXT NOT NULL,
  card_number TEXT NOT NULL,
  card_name TEXT NOT NULL,
  card_type TEXT NOT NULL,
  card_rarity TEXT NOT NULL,
  tradeable BOOLEAN DEFAULT true,
  UNIQUE(pack, card_number)
);

-- Trades Table
CREATE TABLE public.trades (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  offered_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, card_id)
);`}
            </pre>
          </div>
        </details>
      </div>
      
      <div className="mb-6">
        <h3 className="font-medium mb-2">Quick Fix: Initialize Demo Data</h3>
        <p className="mb-4">
          For development purposes, you can initialize the database with sample data to test the application:
        </p>
        <button
          onClick={runInit}
          disabled={initializing}
          className={`px-4 py-2 rounded ${
            initializing 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {initializing ? 'Initializing...' : 'Initialize Demo Data'}
        </button>
        
        {initResult && (
          <div className={`mt-3 p-3 rounded ${
            initResult.success 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {initResult.success 
              ? <p className="text-green-700">Database initialized successfully! Please refresh the page.</p>
              : <p className="text-red-700">Error: {initResult.error}</p>
            }
          </div>
        )}
      </div>
      
      <div>
        <h3 className="font-medium mb-2">Need More Help?</h3>
        <p>
          Check the <a href="https://github.com/your-username/pokemon-trades" className="text-blue-600 hover:underline">GitHub repository</a> for 
          detailed setup instructions or review the README.md file in the project directory.
        </p>
      </div>
    </div>
  );
};

export default DbSetupGuide; 