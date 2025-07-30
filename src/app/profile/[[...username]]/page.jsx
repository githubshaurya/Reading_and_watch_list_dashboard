// src/app/profile/[[...username]]/page.jsx - FIXED VERSION

'use client';
import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { ContentCard } from '../../components/ContentCard';
import { FollowButton } from '../../components/FollowButton';
import QualityContentSection from '../../components/QualityContentSection';

export default function ProfilePage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const [profile, setProfile] = useState(null);
  const [userContent, setUserContent] = useState([]);
  const [qualifiedContent, setQualifiedContent] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [activeTab, setActiveTab] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    postsCount: 0,
    qualifiedCount: 0,
    followersCount: 0,
    followingCount: 0
  });
  const [qualityThreshold, setQualityThreshold] = useState(0.7); // default 70%

  // Get username from params or determine if it's the user's own profile
  const username = params?.username || 
                  (pathname === '/profile' ? session?.user?.username : null) ||
                  (pathname === '/profile/me' ? session?.user?.username : null);
  
  const isOwnProfile = session?.user?.username === username || 
                      pathname === '/profile' || 
                      pathname === '/profile/me' ||
                      params?.username === 'me';

  useEffect(() => {
    // If no username and user is logged in, redirect to their profile
    if (!username && session?.user?.username) {
      router.replace(`/profile/${session.user.username}`);
      return;
    }
    
    // If no username and no user session, show error
    if (!username) {
      setError('No username provided');
      setLoading(false);
      return;
    }
    
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Use the actual username for API calls, not 'me'
        const apiUsername = username === 'me' ? session?.user?.username : username;
        
        if (!apiUsername) {
          setError('Unable to determine username');
          return;
        }
        
        // Fetch user profile with extension content
        const profileRes = await fetch(`/api/user/profile/${apiUsername}?includeExtensionContent=true`);
        if (!profileRes.ok) {
          if (profileRes.status === 404) {
            setError('User not found');
            return;
          }
          throw new Error(`Failed to fetch profile: ${profileRes.status}`);
        }
        
        const profileData = await profileRes.json();
        if (!profileData) {
          throw new Error('No profile data received');
        }
        setProfile(profileData);

        // Fetch user's content with improved error handling and debugging
        try {
          const contentRes = await fetch(`/api/content/user/${apiUsername}?includeExtension=true`);
          console.log('🔍 Content API response status:', contentRes.status);
          
          if (contentRes.ok) {
            const contentData = await contentRes.json();
            console.log('🔍 Raw content data:', contentData);
            // Use backend-provided arrays and stats
            setUserContent(Array.isArray(contentData.items) ? contentData.items : []);
            setQualifiedContent(Array.isArray(contentData.qualifiedItems) ? contentData.qualifiedItems : []);
            setStats(prev => ({
              ...prev,
              postsCount: contentData.stats?.total || 0,
              qualifiedCount: contentData.stats?.qualified || 0
            }));
          } else {
            console.error('❌ Content API failed:', contentRes.status, await contentRes.text());
          }
        } catch (contentError) {
          console.error('❌ Failed to fetch user content:', contentError);
          setUserContent([]);
        }

        // Fetch followers and following with error handling using the user ID
        if (profileData.user.id) {
          try {
            const [followersRes, followingRes] = await Promise.allSettled([
              fetch(`/api/user/${profileData.user.id}/followers`),
              fetch(`/api/user/${profileData.user.id}/following`)
            ]);

            if (followersRes.status === 'fulfilled' && followersRes.value.ok) {
              const followersData = await followersRes.value.json();
              const followersArray = Array.isArray(followersData.followers) 
                ? followersData.followers.map(follow => follow.followerId)
                : [];
              setFollowers(followersArray);
              setStats(prev => ({ ...prev, followersCount: followersData.count || 0 }));
            }

            if (followingRes.status === 'fulfilled' && followingRes.value.ok) {
              const followingData = await followingRes.value.json();
              const followingArray = Array.isArray(followingData.following) 
                ? followingData.following.map(follow => follow.followeeId)
                : [];
              setFollowing(followingArray);
              setStats(prev => ({ ...prev, followingCount: followingData.count || 0 }));
            }
          } catch (followError) {
            console.warn('Failed to fetch follow data:', followError);
            setFollowers([]);
            setFollowing([]);
          }
        }

        // Fetch user settings for threshold
        const settingsRes = await fetch('/api/user/settings');
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          const threshold = settingsData.user?.preferences?.qualityThreshold;
          if (typeof threshold === 'number') {
            setQualityThreshold(threshold);
          }
        }

      } catch (error) {
        console.error('Error fetching profile:', error);
        setError(error.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username, session]);

  // For posts tab, show all posts (deduplicated, latest only)
  // const regularPosts = userContent;
  // For qualified tab, use qualifiedContent (already filtered by API)
  // const qualifiedPosts = qualifiedContent;

  const handleGoBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {error === 'User not found' ? 'User Not Found' : 'Error Loading Profile'}
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            {error || "The user you're looking for doesn't exist."}
          </p>
          <div className="space-x-3">
            <button 
              onClick={handleGoBack}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go Back
            </button>
            {session?.user?.username && (
              <button 
                onClick={() => router.push(`/profile/${session.user.username}`)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Go to My Profile
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile.user.displayName || profile.user.username || username;

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

  console.log('🎯 RENDER DEBUG - Content filtering results:', {
    totalContent: userContent.length,
    regularPosts: userContent.length,
    qualifiedPosts: qualifiedContent.length,
    userContentSample: userContent.slice(0, 3).map(item => ({
      title: item.title?.substring(0, 30),
      isFromExtension: item.isFromExtension,
      isQualified: item.isQualified,
      qualityScore: item.qualityScore,
      extensionScore: item.extensionData?.score
    })),
    sampleQualifiedPost: qualifiedContent[0] ? {
      title: qualifiedContent[0].title,
      isFromExtension: qualifiedContent[0].isFromExtension,
      qualityScore: qualifiedContent[0].qualityScore,
      extensionScore: qualifiedContent[0].extensionData?.score
    } : null
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                {profile.user.avatar ? (
                  <img
                    src={profile.user.avatar}
                    alt={displayName}
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className={`w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 items-center justify-center text-white text-2xl font-bold ${profile.user.avatar ? 'hidden' : 'flex'}`}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
              </div>
              
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {displayName}
                </h1>
                <p className="text-gray-600 dark:text-gray-300">@{profile.user.username}</p>
                
                {profile.user.bio && (
                  <p className="text-gray-700 dark:text-gray-300 mt-2">
                    {profile.user.bio}
                  </p>
                )}
                
                <div className="flex items-center space-x-6 mt-3 text-sm text-gray-600 dark:text-gray-300">
                  <span>
                    <strong className="text-gray-900 dark:text-white">{stats.postsCount}</strong> posts
                  </span>
                  {stats.qualifiedCount > 0 && (
                    <span>
                      <strong className="text-purple-600 dark:text-purple-400">{stats.qualifiedCount}</strong> qualified
                    </span>
                  )}
                  <button
                    onClick={() => setActiveTab('followers')}
                    className="hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <strong className="text-gray-900 dark:text-white">{stats.followersCount}</strong> followers
                  </button>
                  <button
                    onClick={() => setActiveTab('following')}
                    className="hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <strong className="text-gray-900 dark:text-white">{stats.followingCount}</strong> following
                  </button>
                  {profile.user.isExtensionUser && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      Extension User
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {!isOwnProfile && session && (
                <FollowButton userId={profile.user.id} />
              )}
              
              {isOwnProfile && (
                <button
                  onClick={() => router.push('/settings')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quality Content Section - Show if user has extension content */}
        {profile.extensionContent && !profile.extensionContent.error && (
          <QualityContentSection 
            extensionContent={profile.extensionContent}
            username={profile.user.username}
            isOwnProfile={isOwnProfile}
            qualityThreshold={qualityThreshold}
          />
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8 px-6">
              {['posts', 'qualified', 'followers', 'following'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    console.log('🎯 Tab clicked:', tab);
                    setActiveTab(tab);
                  }}
                  className={`py-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors duration-200 ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {tab === 'qualified' ? `Qualified (${stats.qualifiedCount})` : tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {console.log('🎯 Current active tab:', activeTab)}
            {activeTab === 'posts' && (
              <div className="space-y-4">
                {userContent.length > 0 ? (
                  userContent.map(item => (
                    <ContentCard key={item._id || item.id} item={item} showAuthor={false} qualityThreshold={qualityThreshold} />
                  ))
                ) : (
                  <div className="text-center py-12">
                    <div className="text-gray-400 dark:text-gray-500 mb-4">
                      <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No regular posts yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      {isOwnProfile ? "You haven't posted anything manually yet." : `${displayName} hasn't posted anything manually yet.`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'qualified' && (
              <div className="space-y-4">
                {console.log('🎯 Rendering qualified tab with', qualifiedContent.length, 'posts')}
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Qualified Content ({stats.qualifiedCount})
                </h3>
                {qualifiedContent.length > 0 ? (
                  qualifiedContent.map(item => (
                    <ContentCard key={item._id || item.id} item={item} showAuthor={false} qualityThreshold={qualityThreshold} />
                  ))
                ) : (
                  <div className="text-center py-12">
                    <div className="text-purple-400 mb-4">
                      <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No qualified content yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      {isOwnProfile ? "Install the browser extension to automatically discover quality content." : `${displayName} hasn't discovered any qualified content yet.`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'followers' && (
              <div className="space-y-3">
                {followers.length > 0 ? (
                  followers.map(follower => {
                    if (!follower) return null;
                    return (
                      <div key={follower._id || follower.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          {follower.profile?.avatar ? (
                            <img
                              src={follower.profile.avatar}
                              alt={follower.username}
                              className="w-10 h-10 rounded-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextElementSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 items-center justify-center text-white font-bold ${follower.profile?.avatar ? 'hidden' : 'flex'}`}>
                            {getInitials(follower)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {formatUserName(follower)}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">@{follower.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => router.push(`/profile/${follower.username}`)}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                          >
                            View Profile
                          </button>
                          {session && session.user.id !== (follower._id || follower.id) && (
                            <FollowButton userId={follower._id || follower.id} />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-600 dark:text-gray-300">
                      {isOwnProfile ? "You don't have any followers yet." : `${displayName} doesn't have any followers yet.`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'following' && (
              <div className="space-y-3">
                {following.length > 0 ? (
                  following.map(user => {
                    if (!user) return null;
                    return (
                      <div key={user._id || user.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          {user.profile?.avatar ? (
                            <img
                              src={user.profile.avatar}
                              alt={user.username}
                              className="w-10 h-10 rounded-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextElementSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 items-center justify-center text-white font-bold ${user.profile?.avatar ? 'hidden' : 'flex'}`}>
                            {getInitials(user)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {formatUserName(user)}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">@{user.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => router.push(`/profile/${user.username}`)}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                          >
                            View Profile
                          </button>
                          {session && session.user.id !== (user._id || user.id) && (
                            <FollowButton userId={user._id || user.id} />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-600 dark:text-gray-300">
                      {isOwnProfile ? "You're not following anyone yet." : `${displayName} isn't following anyone yet.`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}