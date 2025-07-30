


'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import TagInput from './TagInput';

export default function CommentSection({ contentId }) {
  const { data: session } = useSession();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingComment, setEditingComment] = useState(null);
  const [editText, setEditText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [showReplies, setShowReplies] = useState({});

  useEffect(() => {
    fetch(`/api/comments?content=${contentId}`)
      .then(async (res) => {
        if (res.status === 204) return [];
        return await res.json();
      })
      .then((data) => setComments(data.comments ?? data))
      .catch((err) => {
        console.error('Failed to load comments:', err);
        setComments([]);
      });
  }, [contentId]);

  const addComment = async (e) => {
    e.preventDefault();
    if (!session || !newComment.trim()) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          action: 'comment',
          contentId,
          text: newComment.trim()
        })
      });
      
      if (!res.ok) throw new Error('Failed to add comment');
      
      const comment = await res.json();
      const newCommentWithDefaults = {
        ...comment,
        likes: 0,
        likedByMe: false,
        replies: []
      };
      
      setComments(prev => [newCommentWithDefaults, ...prev]);
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to find and update a comment in nested structure
  const updateCommentInTree = (comments, commentId, updateFn) => {
    return comments.map(comment => {
      if (comment._id === commentId) {
        return updateFn(comment);
      }
      if (comment.replies && comment.replies.length > 0) {
        return {
          ...comment,
          replies: updateCommentInTree(comment.replies, commentId, updateFn)
        };
      }
      return comment;
    });
  };

  // Helper function to find a comment's parent in nested structure
  const findCommentPath = (comments, targetId, path = []) => {
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      const currentPath = [...path, i];
      
      if (comment._id === targetId) {
        return currentPath;
      }
      
      if (comment.replies && comment.replies.length > 0) {
        const foundPath = findCommentPath(comment.replies, targetId, [...currentPath, 'replies']);
        if (foundPath) {
          return foundPath;
        }
      }
    }
    return null;
  };

  const addReply = async (parentCommentId) => {
    if (!session || !replyText.trim()) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          action: 'reply',
          contentId,
          parentCommentId,
          text: replyText.trim()
        })
      });
      
      if (!res.ok) {
        const errorData = await res.text();
        console.error('Reply failed:', res.status, errorData);
        throw new Error(`Failed to add reply: ${res.status}`);
      }
      
      const reply = await res.json();
      const newReplyWithDefaults = {
        ...reply,
        likes: 0,
        likedByMe: false,
        replies: []
      };
      
      // Update the comment tree to add the new reply
      setComments(prev => updateCommentInTree(prev, parentCommentId, (comment) => ({
        ...comment,
        replies: [...(comment.replies || []), newReplyWithDefaults]
      })));
      
      setReplyText('');
      setReplyingTo(null);
      
      // Auto-show replies when a new reply is added
      setShowReplies(prev => ({ ...prev, [parentCommentId]: true }));
    } catch (error) {
      console.error('Error adding reply:', error);
      alert('Failed to add reply. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const editComment = async (commentId) => {
    if (!session || !editText.trim()) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          action: 'edit',
          commentId,
          text: editText.trim()
        })
      });
      
      if (!res.ok) {
        const errorData = await res.text();
        console.error('Edit failed:', res.status, errorData);
        throw new Error(`Failed to edit comment: ${res.status}`);
      }
      
      // Update the comment in the tree
      setComments(prev => updateCommentInTree(prev, commentId, (comment) => ({
        ...comment,
        text: editText.trim(),
        edited: true
      })));
      
      setEditingComment(null);
      setEditText('');
    } catch (error) {
      console.error('Error editing comment:', error);
      alert('Failed to edit comment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleLike = async (commentId) => {
    if (!session) return;
    
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ 
          commentId,
          action: 'toggle-like'
        })
      });
      
      if (!res.ok) throw new Error('Failed to toggle like');
      
      const { liked, likes } = await res.json();
      
      // Update the comment in the tree
      setComments(prev => updateCommentInTree(prev, commentId, (comment) => ({
        ...comment,
        likedByMe: liked,
        likes: likes
      })));
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const deleteComment = async (commentId) => {
    if (!session) return;
    
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ 
          commentId,
          action: 'delete'
        })
      });
      
      if (!res.ok) throw new Error('Failed to delete comment');
      
      // Remove the comment from the tree
      const removeCommentFromTree = (comments) => {
        return comments.reduce((acc, comment) => {
          if (comment._id === commentId) {
            // Skip this comment (delete it)
            return acc;
          }
          
          const updatedComment = {
            ...comment,
            replies: comment.replies ? removeCommentFromTree(comment.replies) : []
          };
          
          return [...acc, updatedComment];
        }, []);
      };
      
      setComments(prev => removeCommentFromTree(prev));
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now - date;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const renderTextWithTags = (text) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const startEdit = (comment) => {
    setEditingComment(comment._id);
    setEditText(comment.text);
  };

  const cancelEdit = () => {
    setEditingComment(null);
    setEditText('');
  };

  const toggleReplies = (commentId) => {
    setShowReplies(prev => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  const renderComment = (comment, depth = 0) => {
    const isEditing = editingComment === comment._id;
    const isReplying = replyingTo === comment._id;
    const maxDepth = 6; // Prevent excessive nesting

    return (
      <div key={comment._id} className={`${depth > 0 ? `ml-${Math.min(depth * 4, 24)} border-l-2 border-gray-200 dark:border-gray-600 pl-4` : ''} bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {comment.username || 'Anonymous'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(comment.createdAt)}
              </span>
              {comment.edited && (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                  (edited)
                </span>
              )}
            </div>
            
            {isEditing ? (
              <div className="mt-2">
                <TagInput
                  value={editText}
                  onChange={setEditText}
                  placeholder="Edit your comment..."
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => editComment(comment._id)}
                    disabled={loading || !editText.trim()}
                    className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {renderTextWithTags(comment.text)}
              </p>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1 ml-3">
            {/* Like Button */}
            {session && !isEditing && (
              <button 
                onClick={() => toggleLike(comment._id)} 
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors duration-200 ${
                  comment.likedByMe 
                    ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                <span>{comment.likedByMe ? '❤️' : '🤍'}</span>
                {(comment.likes || 0) > 0 && <span>{comment.likes}</span>}
              </button>
            )}
            
            {/* Edit Button - Only show for comment owner */}
            {session && session.user.id === comment.userId && !isEditing && (
              <button
                onClick={() => startEdit(comment)}
                className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors duration-200"
                title="Edit comment"
              >
                ✏️
              </button>
            )}
            
            {/* Delete Button - Only show for comment owner */}
            {session && session.user.id === comment.userId && !isEditing && (
              <button
                onClick={() => deleteComment(comment._id)}
                className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors duration-200"
                title="Delete comment"
              >
                🗑️
              </button>
            )}
          </div>
        </div>

        {/* Reply and View Replies buttons - Available for all comments up to max depth */}
        {!isEditing && (
          <div className="flex items-center gap-3 mt-2 text-xs">
            {session && depth < maxDepth && (
              <button
                onClick={() => setReplyingTo(replyingTo === comment._id ? null : comment._id)}
                className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
              >
                💬 Reply
              </button>
            )}
            
            {comment.replies && comment.replies.length > 0 && (
              <button
                onClick={() => toggleReplies(comment._id)}
                className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
              >
                {showReplies[comment._id] ? '▼' : '▶'} {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>
        )}

        {/* Reply Form */}
        {isReplying && (
          <div className={`mt-3 ${depth < maxDepth ? `ml-${Math.min((depth + 1) * 4, 24)}` : ''}`}>
            <TagInput
              value={replyText}
              onChange={setReplyText}
              placeholder="Write a reply..."
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => addReply(comment._id)}
                disabled={loading || !replyText.trim()}
                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Posting...' : 'Reply'}
              </button>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyText('');
                }}
                className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Replies */}
        {showReplies[comment._id] && comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3">
            {comment.replies.map((reply) => 
              renderComment(reply, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
      {/* Add Comment Form */}
      {session && (
        <form onSubmit={addComment} className="mb-4">
          <div className="space-y-2">
            <TagInput
              value={newComment}
              onChange={setNewComment}
              placeholder="Add a comment..."
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading || !newComment.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {loading ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Comments List */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          comments.map((comment) => renderComment(comment, 0))
        )}
      </div>
    </div>
  );
}