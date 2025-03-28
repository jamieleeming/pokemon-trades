import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import { AuthProvider } from '../contexts/AuthContext';

const Layout = () => {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col bg-gray-50">
        <Navigation />
        <main className="flex-grow pt-2">
          <Outlet />
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