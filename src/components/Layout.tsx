import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { AuthProvider } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const Layout = () => {
  const [dbStatus, setDbStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    const checkDatabase = async () => {
      try {
        // Try to connect to Supabase and check if we can get a session
        const { data: authData, error: authError } = await supabase.auth.getSession();
        
        if (authError) {
          console.error('Failed to connect to Supabase:', authError);
          setDbStatus('error');
          setDbError('Cannot connect to Supabase. Please check your API credentials.');
          return;
        }
        
        // Try to query any table to see if the connection works
        try {
          await supabase
            .from('cards')
            .select('*', { count: 'exact', head: true });
          
          // If we got here, the connection is working
          setDbStatus('connected');
        } catch (dbError) {
          // Table might not exist, but connection is probably OK
          setDbStatus('connected');
          console.log('Could not query cards table, but authentication worked.');
        }
      } catch (error) {
        console.error('Database connection error:', error);
        setDbStatus('error');
        setDbError('Failed to connect to the database.');
      }
    };

    checkDatabase();
  }, []);

  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col bg-gray-50">
        <Navigation />
        <main className="flex-grow">
          {dbStatus === 'error' ? (
            <div className="container py-8">
              <div className="bg-red-50 border border-red-300 rounded-lg p-6 shadow-md">
                <h2 className="text-xl font-bold text-red-700 mb-4">Database Connection Error</h2>
                <p className="mb-4">{dbError || 'Could not connect to the database.'}</p>
                <div className="bg-white p-4 rounded border border-gray-200">
                  <h3 className="font-semibold mb-2">Troubleshooting Steps:</h3>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Verify your Supabase URL and Anon Key in the <code className="bg-gray-100 px-1">.env</code> file</li>
                    <li>Make sure your Supabase project is active and not paused</li>
                    <li>Check for network issues that might prevent connecting to Supabase</li>
                    <li>Restart the development server</li>
                  </ol>
                </div>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
        <footer className="border-t border-gray-200 bg-white py-6">
          <div className="container text-center text-sm text-gray-500">
            <p>© {new Date().getFullYear()} Pocket Trades. All rights reserved.</p>
            <p className="mt-1">
              A companion app for Pokémon TCG Pocket. Not affiliated with The Pokémon Company.
            </p>
          </div>
        </footer>
      </div>
    </AuthProvider>
  );
};

export default Layout; 