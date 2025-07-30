// // src/app/components/ContentCard.jsx

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSession } from 'next-auth/react';

import { FollowButton } from './FollowButton';
import CommentSection from './CommentSection';
import FollowerListModal from './FollowerListModal';

const EXTENSION_QUALITY_THRESHOLD = 70;

export function ContentCard({ item, token, onEdit, onDelete, qualityThreshold }) {
  const { data: session } = useSession();
  const [likes, setLikes] = useState(item.likes || 0);
  const [liked, setLiked] = useState(item.likedByMe || false);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(item.commentCount || 0);
  const [showFollowers, setShowFollowers] = useState(false);
  
  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title || '');
  const [editSummary, setEditSummary] = useState(item.summary || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use prop or default
  const threshold = typeof qualityThreshold === 'number' ? qualityThreshold : 0.7;

  // Fetch like status
  useEffect(() => {
    if (!session || !item._id) return;
    
    fetch(`/api/content?liked=${item._id}`)
      .then(r => r.json())
      .then(({ liked }) => setLiked(Boolean(liked)))
      .catch((error) => {
        console.error('Error fetching like status:', error);
      });
  }, [session, item._id]);

  // Toggle like handler
  const toggleLike = async () => {
    if (!session) return;
    
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-like', id: item._id }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to toggle like');
      }
      
      const { liked: newLiked } = await res.json();
      setLiked(newLiked);
      setLikes(prev => prev + (newLiked ? 1 : -1));
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  // Handle delete post
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-post', id: item._id }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete post');
      }
      
      if (onDelete) {
        onDelete(item._id);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post. Please try again.');
    }
  };

  // Handle edit submission
  const handleEditSubmit = async () => {
    if (!editTitle.trim() || !editSummary.trim()) {
      alert('Title and summary cannot be empty');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'edit-post', 
          id: item._id, 
          update: { 
            title: editTitle.trim(), 
            summary: editSummary.trim() 
          }
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to edit post');
      }
      
      const updatedItem = await res.json();
      if (onEdit) {
        onEdit(item._id, updatedItem);
      }
      
      // Update local state
      item.title = editTitle.trim();
      item.summary = editSummary.trim();
      
      setIsEditing(false);
    } catch (error) {
      console.error('Error editing post:', error);
      alert('Failed to edit post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel edit
  const handleEditCancel = () => {
    setEditTitle(item.title || '');
    setEditSummary(item.summary || '');
    setIsEditing(false);
  };

  // Format date utility
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffM = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffM < 1) return 'just now';
    if (diffM < 60) return `${diffM}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD < 7) return `${diffD}d ago`;
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Update comment count when new comment is added
  const handleCommentAdded = () => {
    setCommentCount(prev => prev + 1);
  };

  const handleCommentDeleted = () => {
    setCommentCount(prev => Math.max(0, prev - 1));
  };

  // Get author display name
  const getAuthorDisplayName = () => {
    if (item.author?.username) {
      return item.author.username;
    }
    const profile = item.author?.profile;
    if (profile?.firstName && profile?.lastName) {
      return `${profile.firstName} ${profile.lastName}`;
    }
    return 'Anonymous';
  };

  // Get author username
  const getAuthorUsername = () => {
    return item.author?.username || 'anonymous';
  };

  // Check if current user owns this post
  const isOwner = session?.user?.id === (item.author?._id || item.userId);

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      {/* Header with Author Info */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setShowFollowers(true)} 
              className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors duration-200"
            >
              {getAuthorDisplayName()}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              @{getAuthorUsername()}
            </span>
          </div>
          {item.author?._id && (
            <FollowButton userId={item.author._id} />
          )}
        </div>

        
        
        {/* Edit/Delete buttons for post owner */}
        {isOwner && !isEditing && (
          <div className="flex space-x-2">
            <button 
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors duration-200"
              title="Edit post"
            >
              <span>✏️</span>
              <span>Edit</span>
            </button>
            <button 
              onClick={handleDelete}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
              title="Delete post"
            >
              <span>🗑️</span>
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Edit Form */}
      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Title
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={200}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Summary
            </label>
            <textarea
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              rows={4}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
              maxLength={1000}
              required
            />
          </div>
          
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleEditSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors duration-200"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={handleEditCancel}
              disabled={isSubmitting}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Post Title & Date */}
          <div className="mb-4">
            <a 
              href={item.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-lg font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 block mb-1"
            >
              {item.title}
            </a>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatDate(item.createdAt)}
              {/* Show Extension tag only if post is from extension AND qualityScore > threshold */}
              {item.isFromExtension && (item.qualityScore > threshold * 100) && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 ml-2">
                  Extension
                </span>
              )}
            </p>
          </div>

          {/* Post Content */}
          <div className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">
            <ReactMarkdown
              children={item.summary}
              components={{
                script: () => null,
                iframe: () => null,
              }}
            />
          </div>

          {/* Actions Bar */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-4">
              {/* Like Button */}
              {session && (
                <button 
                  onClick={toggleLike}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 ${
                    liked 
                      ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20' 
                      : 'text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                  }`}
                >
                  <span>{liked ? '❤️' : '🤍'}</span>
                  <span>{likes > 0 ? likes : 'Like'}</span>
                </button>
              )}
              
              {/* Comments Button */}
              <button 
                onClick={() => setShowComments(prev => !prev)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 ${
                  showComments 
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`}
              >
                <span>💬</span>
                <span>{commentCount} comments</span>
              </button>
            </div>

            {/* External Link */}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors duration-200"
            >
              View Source →
            </a>
          </div>

          {/* Comments Section - Only show when clicked */}
          {showComments && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                <CommentSection 
                  contentId={item._id} 
                  token={token}
                  onCommentAdded={handleCommentAdded}
                  onCommentDeleted={handleCommentDeleted}
                />
              </div>
            </div>
          )}
          {showFollowers && (
          <FollowerListModal 
            userId={item.author?._id || item.userId} 
            onClose={() => setShowFollowers(false)} 
          />
        )}
          
        </>
      )}
    </div>
  );
}