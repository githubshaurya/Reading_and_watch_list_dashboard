// src/app/extension-link/page.js
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function ExtensionLinkPage() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [linkStatus, setLinkStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contentPreview, setContentPreview] = useState([]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const extensionUserId = searchParams.get('extensionUserId');
  const username = searchParams.get('username'); // Support username access

  useEffect(() => {
    if (!extensionUserId && !username) {
      setError('Invalid link - missing extension user ID or username');
      setLoading(false);
      return;
    }

    checkExtensionStatus();
  }, [extensionUserId, username]);

  const checkExtensionStatus = async () => {
    try {
      let url = '/api/extension/public?action=profile';
      
      if (username) {
        url += `&username=${username}`;
      } else {
        url += `&extensionUserId=${extensionUserId}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 404) {
          if (username) {
            setError(`User "${username}" not found. This user may not exist or has no public content.`);
          } else {
            setError('Extension user not found. Please use the extension to analyze some content first.');
          }
        } else {
          throw new Error(data.error || 'Failed to check extension status');
        }
        setLoading(false);
        return;
      }
      
      setLinkStatus(data);
      await loadContentPreview();
      
      // Only show linking options for extension users (not regular username lookups)
      if (extensionUserId && status !== 'loading' && session) {
        await checkLinkingStatus();
      } else if (extensionUserId && status !== 'loading' && !session) {
        setShowLoginPrompt(true);
      }
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadContentPreview = async () => {
    try {
      let url = '/api/extension/public?action=feed&limit=5';
      
      if (username) {
        url += `&username=${username}`;
      } else {
        url += `&extensionUserId=${extensionUserId}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setContentPreview(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load content preview:', err);
    }
  };

  const checkLinkingStatus = async () => {
    if (!extensionUserId) return;
    
    try {
      const response = await fetch(`/api/extension/auth?extensionUserId=${extensionUserId}`);
      const data = await response.json();
      
      if (response.ok) {
        setLinkStatus(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Failed to check linking status:', err);
    }
  };

  const handleLink = async () => {
    if (!session) {
      const callbackUrl = `/extension-link?extensionUserId=${extensionUserId}`;
      router.push('/login?callbackUrl=' + encodeURIComponent(callbackUrl));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/extension/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link',
          extensionUserId
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to link extension');
      }

      await checkLinkingStatus();
      alert('Extension linked successfully!');
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Are you sure you want to unlink your extension?')) return;

    setLoading(true);
    try {
      const response = await fetch('/api/extension/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unlink',
          extensionUserId
        })
      });

      if (response.ok) {
        await checkLinkingStatus();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl w-full">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {username ? 'User Not Found' : 'Extension User Not Found'}
            </h1>
            <p className="text-gray-600 mb-6">{error}</p>
            
            {!username && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
                <h3 className="font-medium text-blue-900 mb-2">To create an extension user:</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Install the browser extension</li>
                  <li>Visit any content-rich webpage (article, blog post, etc.)</li>
                  <li>The extension will automatically analyze and save quality content</li>
                  <li>Once content is saved, return to this link</li>
                </ol>
              </div>
            )}
            
            <div className="space-y-3">
              <button 
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 mr-3"
              >
                Retry
              </button>
              <button 
                onClick={() => router.push('/')}
                className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <div className="text-center">
            <div className="text-blue-500 text-6xl mb-4">📚</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {linkStatus?.displayName || linkStatus?.username} Quality Feed
            </h1>
            <p className="text-gray-600 mb-4">
              {linkStatus?.bio || 'Curated high-quality content'}
            </p>
            
            {/* Stats */}
            {linkStatus?.stats && (
              <div className="flex justify-center space-x-8 text-sm text-gray-600">
                <div>
                  <span className="font-medium text-gray-900">{linkStatus.stats.contentCount}</span> items
                </div>
                <div>
                  <span className="font-medium text-gray-900">{linkStatus.stats.totalLikes}</span> total likes
                </div>
                <div>
                  <span className="font-medium text-gray-900">{linkStatus.stats.followersCount}</span> followers
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quality Content Feed */}
        {contentPreview.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Quality Content Feed</h2>
              <span className="text-sm text-gray-500 bg-green-100 px-2 py-1 rounded">
                High Quality (70%+ score)
              </span>
            </div>
            <div className="space-y-6">
              {contentPreview.map((item, index) => (
                <div key={item._id || index} className="border-b border-gray-200 pb-6 last:border-b-0">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-medium text-gray-900 mb-2 flex-1">
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 transition-colors"
                      >
                        {item.title}
                      </a>
                    </h3>
                    <div className="ml-4 text-right">
                      <div className="text-xs text-green-600 font-medium mb-1">
                        Quality: {item.qualityScore || Math.round((item.extensionData?.score || 0) * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.contentType || 'article'}
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                    {item.summary || item.preview}
                  </p>
                  
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center space-x-4">
                      <span className="font-medium text-blue-600">
                        {item.domain || new URL(item.url).hostname}
                      </span>
                      <span>❤️ {item.likes}</span>
                    </div>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="text-center mt-6">
              <button 
                onClick={() => router.push(`/profile/${linkStatus.username}`)}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                View Full Profile & Feed
              </button>
            </div>
          </div>
        )}

        {/* Linking Section - Only for extension users */}
        {extensionUserId && (
          <div className="bg-white rounded-lg shadow-md p-6">
            {session ? (
              linkStatus?.isLinked ? (
                <div className="text-center">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <p className="text-green-800 font-medium">
                      ✅ This extension is linked to your account
                    </p>
                  </div>
                  <div className="space-y-3">
                    <button 
                      onClick={() => router.push('/profile')}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 mr-3"
                    >
                      View Your Profile
                    </button>
                    <button 
                      onClick={handleUnlink}
                      className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700"
                    >
                      Unlink Extension
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <h3 className="text-lg font-medium mb-4">Link Extension to Your Account</h3>
                  <p className="text-gray-600 mb-6">
                    Connect this extension to your website account to manage content and sync preferences.
                  </p>
                  <button 
                    onClick={handleLink}
                    disabled={loading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Linking...' : 'Link to My Account'}
                  </button>
                </div>
              )
            ) : (
              showLoginPrompt && (
                <div className="text-center">
                  <h3 className="text-lg font-medium mb-4">Want to claim this content?</h3>
                  <p className="text-gray-600 mb-6">
                    Login or create an account to link this extension and manage your content.
                  </p>
                  <div className="space-y-3">
                    <button 
                      onClick={() => router.push('/login?callbackUrl=' + encodeURIComponent(window.location.href))}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 mr-3"
                    >
                      Login to Link
                    </button>
                    <button 
                      onClick={() => router.push('/register?callbackUrl=' + encodeURIComponent(window.location.href))}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
                    >
                      Create Account
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Public Feed Info */}
        {username && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <h3 className="font-medium text-blue-900 mb-2">About This Feed</h3>
            <p className="text-sm text-blue-800">
              This is a public feed of high-quality content curated by {linkStatus?.displayName || username}. 
              Only content with 70% or higher quality scores are shown here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}