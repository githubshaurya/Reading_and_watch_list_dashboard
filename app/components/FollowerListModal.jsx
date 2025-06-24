// src\app\components\FollowerListModal.jsx
'use client';
import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { FollowButton } from './FollowButton';

export default function FollowerListModal({ userId, onClose }) {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('followers');
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId]);

  // Listen for follow changes to update counts
  useEffect(() => {
    function onFollowChanged(e) {
      // Refresh data when follow relationships change
      fetchData();
    }
    window.addEventListener('follow-changed', onFollowChanged);
    return () => window.removeEventListener('follow-changed', onFollowChanged);
  }, []);

  const fetchData = async () => {
    if (!userId || !/^[a-fA-F0-9]{24}$/.test(userId)) {
      setError('Invalid user ID');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch followers and following data
      const [followersRes, followingRes] = await Promise.all([
        fetch(`/api/user/${userId}/followers`),
        fetch(`/api/user/${userId}/following`)
      ]);

      if (!followersRes.ok) {
        const followersError = await followersRes.json().catch(() => ({}));
        throw new Error(followersError.error || 'Failed to fetch followers');
      }

      if (!followingRes.ok) {
        const followingError = await followingRes.json().catch(() => ({}));
        throw new Error(followingError.error || 'Failed to fetch following');
      }

      const followersData = await followersRes.json();
      const followingData = await followingRes.json();

      setFollowers(followersData.followers || []);
      setFollowing(followingData.following || []);
      setFollowerCount(followersData.count || 0);
      setFollowingCount(followingData.count || 0);
      
    } catch (err) {
      console.error('Error fetching followers/following:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatUserName = (user) => {
    if (user?.profile?.firstName && user?.profile?.lastName) {
      return `${user.profile.firstName} ${user.profile.lastName}`;
    }
    return user?.username || 'Unknown User';
  };

  const getInitials = (user) => {
    if (user?.profile?.firstName) {
      return user.profile.firstName.charAt(0).toUpperCase();
    }
    if (user?.username) {
      return user.username.charAt(0).toUpperCase();
    }
    return '?';
  };

  const renderUserList = (users) => {
    if (users.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">
            {activeTab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {users.map((item) => {
          const user = activeTab === 'followers' ? item.followerId : item.followeeId;
          if (!user) return null;
          
          return (
            <div key={user._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center space-x-3">
                {user.profile?.avatar ? (
                  <img 
                    src={user.profile.avatar} 
                    alt={formatUserName(user)}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                    {getInitials(user)}
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatUserName(user)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    @{user.username}
                  </p>
                </div>
              </div>
              <FollowButton userId={user._id} />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Connections
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors duration-200"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('followers')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors duration-200 ${
              activeTab === 'followers'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Followers ({followerCount})
          </button>
          <button
            onClick={() => setActiveTab('following')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors duration-200 ${
              activeTab === 'following'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Following ({followingCount})
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p className="text-sm">{error}</p>
              <button 
                onClick={fetchData}
                className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Try again
              </button>
            </div>
          ) : (
            renderUserList(activeTab === 'followers' ? followers : following)
          )}
        </div>
      </div>
    </div>
  );
}