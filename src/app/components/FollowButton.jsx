'use client';
import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export function FollowButton({ userId }) {
  const { data: session, status } = useSession();
  const [following, setFollowing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load initial follow state
  useEffect(() => {
    let canceled = false;
    
    if (status !== 'authenticated' || session?.user?.id === userId) {
      setLoaded(true);
      return;
    }

    // Validate userId before making API call
    if (!userId || !/^[a-fA-F0-9]{24}$/.test(userId)) {
      console.warn('Invalid userId provided to FollowButton:', userId);
      setLoaded(true);
      return;
    }

    const loadFollowStatus = async () => {
      try {
        const response = await fetch(`/api/follow/status?followeeId=${userId}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!canceled) {
          setFollowing(Boolean(data.following));
        }
      } catch (error) {
        console.error('Error loading follow status:', error);
        if (!canceled) {
          setFollowing(false); // Default to false on error
        }
      } finally {
        if (!canceled) {
          setLoaded(true);
        }
      }
    };

    loadFollowStatus();
    
    return () => { canceled = true; };
  }, [status, session?.user?.id, userId]);

  // Listen for follow-changed events so all buttons update
  useEffect(() => {
    function onFollowChanged(e) {
      if (e.detail.userId === userId) {
        setFollowing(e.detail.following);
      }
    }
    window.addEventListener('follow-changed', onFollowChanged);
    return () => window.removeEventListener('follow-changed', onFollowChanged);
  }, [userId]);

  // Don't render if not loaded, not authenticated, or on your own profile
  if (!loaded || status !== 'authenticated' || session?.user?.id === userId) {
    return null;
  }

  // Toggle follow/unfollow and broadcast
  const toggleFollow = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    const previousState = following;
    
    try {
      const response = await fetch('/api/follow', {
        method: following ? 'DELETE' : 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ followeeId: userId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const newState = !following;
      setFollowing(newState);
      
      // Broadcast to all other FollowButton instances
      window.dispatchEvent(new CustomEvent('follow-changed', {
        detail: { userId, following: newState }
      }));
      
    } catch (error) {
      console.error('Follow toggle failed:', error);
      // Revert to previous state on error
      setFollowing(previousState);
      
      // Optional: Show user-friendly error message
      alert('Failed to update follow status. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={toggleFollow}
      disabled={isLoading}
      className={`ml-auto text-xs px-3 py-1 rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
        following
          ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
          : 'bg-blue-500 text-white hover:bg-blue-600'
      }`}
    >
      {isLoading ? '...' : (following ? 'Unfollow' : 'Follow')}
    </button>
  );
}

// 'use client';
// import React, { useState, useEffect } from 'react';
// import { useSession } from 'next-auth/react';

// export function FollowButton({ userId }) {
//   const { data: session, status } = useSession();
//   const [following, setFollowing] = useState(false);
//   const [loaded, setLoaded] = useState(false);

//   useEffect(() => {
//     if (status !== 'authenticated' || session.user.id === userId) {
//       setLoaded(true);
//       return;
//     }
//     let canceled = false;
//     fetch(`/api/follow/status?followeeId=${userId}`)
//       .then(r => r.json())
//       .then(d => { if (!canceled) setFollowing(Boolean(d.following)); })
//       .catch(console.error)
//       .finally(() => { if (!canceled) setLoaded(true); });
//     return () => { canceled = true; };
//   }, [status, userId, session]);

//   if (!loaded || status !== 'authenticated' || session.user.id === userId) return null;

//   const toggle = async () => {
//     try {
//       await fetch('/api/follow', {
//         method: following ? 'DELETE' : 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ followeeId: userId }),
//       });
//       setFollowing(!following);
//     } catch (err) {
//       console.error('Follow toggle failed:', err);
//     }
//   };

//   return (
//     <button onClick={toggle} className="ml-auto text-xs text-white bg-blue-500 px-3 py-1 rounded-full">
//       {following ? 'Unfollow' : 'Follow'}
//     </button>
//   );
// }