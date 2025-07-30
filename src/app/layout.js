'use client';
import './globals.css';
import { SessionProvider } from 'next-auth/react';
import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';

export default function RootLayout({ children }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Handle hydration and theme initialization
  useEffect(() => {
    setMounted(true);
    const stored = typeof window !== 'undefined' ? localStorage.getItem('dark') : null;
    const isDark = stored === 'true' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
      document.documentElement.classList.add('dark');
      setDark(true);
    } else {
      document.documentElement.classList.remove('dark');
      setDark(false);
    }
  }, []);

  const toggleDark = () => {
    const newDarkState = !dark;
    document.documentElement.classList.toggle('dark', newDarkState);
    localStorage.setItem('dark', newDarkState.toString());
    setDark(newDarkState);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <html lang="en">
        <body className="bg-gray-50 text-gray-900">
          <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className={dark ? 'dark' : ''}>
      <head>
        <title>ContentFeed</title>
        <meta name="description" content="Your personalized content feed" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
        <SessionProvider>
          <Header dark={dark} toggleDark={toggleDark} />
          <main className="min-h-screen">
            {children}
          </main>
        </SessionProvider>
      </body>
    </html>
  );
}