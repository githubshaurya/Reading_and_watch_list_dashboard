'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { AddContentForm } from './components/AddContentForm';
import { ContentCard } from './components/ContentCard';
import { Pagination } from './components/Pagination';

// Constants
const ITEMS_PER_PAGE = 10;
const INFINITE_SCROLL_THRESHOLD = 100;

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Feed state
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Refs for managing state
  const isFetching = useRef(false);
  const isInitialLoad = useRef(true);
  const abortController = useRef(null);

  // Redirect new users to complete profile
  useEffect(() => {
    if (session?.user?.isNewUser) {
      router.push('/signup/complete-profile');
    }
  }, [session?.user?.isNewUser, router]);

  // Fetch content with improved error handling and cancellation
  const fetchContent = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (isFetching.current && !isRefresh) return;
    if (status !== 'authenticated') return;

    // Cancel previous request if still pending
    if (abortController.current) {
      abortController.current.abort();
    }
    
    abortController.current = new AbortController();
    isFetching.current = true;
    
    if (isRefresh) {
      setRefreshing(true);
    } else if (isInitialLoad.current) {
      setLoading(true);
    }
    
    setError(null);

    try {
      const response = await axios.get(`/api/content?page=${pageNum}&limit=${ITEMS_PER_PAGE}`, {
        signal: abortController.current.signal,
        timeout: 1000000, // 10 second timeout
      });

      const data = response.data;
      
      if (!data || !Array.isArray(data.items)) {
        throw new Error('Invalid response format');
      }

      setItems(prev => {
        if (pageNum === 1 || isRefresh) {
          return data.items;
        }
        // Prevent duplicates when appending
        const existingIds = new Set(prev.map(item => item._id));
        const newItems = data.items.filter(item => !existingIds.has(item._id));
        return [...prev, ...newItems];
      });
      
      setHasMore(Boolean(data.hasMore));
      
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
      }
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
        console.error('Error fetching content:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load content');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetching.current = false;
      abortController.current = null;
    }
  }, [status]);

  // Initial load and page changes
  useEffect(() => {
    fetchContent(page);
    
    // Cleanup on unmount
    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, [fetchContent, page]);

  // Infinite scroll implementation
  useEffect(() => {
    if (pathname !== '/') return;
    if (!hasMore || loading || isFetching.current) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      
      if (scrollTop + clientHeight >= scrollHeight - INFINITE_SCROLL_THRESHOLD) {
        setPage(prev => prev + 1);
      }
    };

    const throttledScrollHandler = throttle(handleScroll, 200);
    window.addEventListener('scroll', throttledScrollHandler, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', throttledScrollHandler);
    };
  }, [hasMore, loading, pathname]);

  // Handlers with improved error handling
  const handleAdd = useCallback((item) => {
    if (!item || !item._id) return;
    
    setItems(prev => {
      // Check if item already exists to prevent duplicates
      const exists = prev.some(existingItem => existingItem._id === item._id);
      return exists ? prev : [item, ...prev];
    });
  }, []);

  // const handleEdit = useCallback(async (id) => {
  //   if (!id) return;
    
  //   const item = items.find(i => i._id === id);
  //   if (!item) return;

  //   const newSummary = prompt('Edit summary:', item.summary || '');
  //   if (!newSummary || newSummary === item.summary) return;

  //   try {
  //     await axios.post('/api/content', { 
  //       action: 'edit-post', 
  //       id, 
  //       update: { summary: newSummary.trim() }
  //     });
      
  //     setItems(prev => prev.map(i => 
  //       i._id === id ? { ...i, summary: newSummary.trim(), updatedAt: new Date().toISOString() } : i
  //     ));
  //   } catch (err) {
  //     console.error('Error editing post:', err);
  //     alert('Failed to edit post. Please try again.');
  //   }
  // }, [items]);

  // const handleDelete = useCallback(async (id) => {
  //   if (!id) return;
    
  //   const item = items.find(i => i._id === id);
  //   if (!item) return;

  //   const confirmMessage = `Are you sure you want to delete this post?${item.title ? `\n\n"${item.title}"` : ''}`;
  //   if (!confirm(confirmMessage)) return;

  //   try {
  //     await axios.post('/api/content', { action: 'delete-post', id });
  //     setItems(prev => prev.filter(i => i._id !== id));
  //   } catch (err) {
  //     console.error('Error deleting post:', err);
  //     alert('Failed to delete post. Please try again.');
  //   }
  // }, [items]);

  const handleEdit = useCallback((id, updatedItem) => {
  if (!id) return;
  
  setItems(prev => prev.map(i => 
    i._id === id ? { ...i, ...updatedItem } : i
  ));
}, []);

const handleDelete = useCallback((id) => {
  if (!id) return;
  
  // Remove from state immediately since the ContentCard already handles the API call
  setItems(prev => prev.filter(i => i._id !== id));
}, []);

  const handleRefresh = useCallback(() => {
    setPage(1);
    fetchContent(1, true);
  }, [fetchContent]);

  const handleRetry = useCallback(() => {
    setError(null);
    fetchContent(page);
  }, [fetchContent, page]);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated view
  if (!session) {
    return (
      <main className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center space-y-6 p-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome to ContentFeed
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-md">
            Sign in to access your personalized content feed and connect with others
          </p>
        </div>
        
        <div className="space-y-4 w-full max-w-sm">
          <Link 
            href="/login" 
            className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 font-medium"
          >
            Sign In
          </Link>
          
          <div className="text-center">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Do not have an account?{' '}
            </span>
            <Link 
              href="/signup" 
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors duration-200 font-medium underline"
            >
              Create one now
            </Link>
          </div>
        </div>
        
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
          Join our community and start sharing your thoughts, ideas, and content with others.
        </p>
      </main>
    );
  }

  // Authenticated feed view
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header with refresh button */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Your Content Feed
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Welcome back, {session.user.username || session.user.name}!
              </p>
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50"
              title="Refresh feed"
            >
              <svg 
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                />
              </svg>
              <span className="text-sm font-medium">
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </span>
            </button>
          </div>
        </header>

        {/* Add Content Form */}
        <div className="mb-8">
          <AddContentForm onAdd={handleAdd} />
        </div>

        {/* Content Feed */}
        <section className="space-y-6">
          {/* Error State */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-red-700 dark:text-red-300">
                    <span className="font-medium">Error:</span> {error}
                  </p>
                  <div className="mt-2 flex space-x-3">
                    <button 
                      onClick={handleRetry}
                      className="text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 font-medium"
                    >
                      Try Again
                    </button>
                    <button 
                      onClick={handleRefresh}
                      className="text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 font-medium"
                    >
                      Refresh Feed
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {items.length === 0 && !loading && !error && (
            <div className="text-center py-16">
              <div className="text-gray-400 dark:text-gray-500 mb-6">
                <svg className="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={1} 
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" 
                  />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-3">
                No content yet
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-md mx-auto">
                Start by adding some content using the form above. Share your thoughts, links, or updates with the community.
              </p>
              <button
                onClick={() => document.querySelector('textarea')?.focus()}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
              >
                Create Your First Post
              </button>
            </div>
          )}

          {/* Content Items */}
          {items.map((item, index) => (
            <ContentCard 
              key={`${item._id}-${index}`} 
              item={item} 
              onEdit={handleEdit} 
              onDelete={handleDelete} 
            />
          ))}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-300">
                  {isInitialLoad.current ? 'Loading your feed...' : 'Loading more content...'}
                </p>
              </div>
            </div>
          )}

          {/* End of Feed Message */}
          {!loading && !hasMore && items.length > 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">
                You have reached the end of your feed
              </p>
              <button
                onClick={handleRefresh}
                className="mt-2 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-medium text-sm"
              >
                Refresh to see new content
              </button>
            </div>
          )}
        </section>

        {/* Pagination Fallback (hidden when infinite scroll is working) */}
        {!loading && items.length > 0 && (
          <div className="mt-8 md:hidden">
            <Pagination page={page} setPage={setPage} hasMore={hasMore} />
          </div>
        )}
      </div>
    </div>
  );
}

// Utility function for throttling scroll events
function throttle(func, delay) {
  let timeoutId;
  let lastExecTime = 0;
  
  return function (...args) {
    const currentTime = Date.now();
    
    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
}