// import { NextResponse } from 'next/server';
// import { getServerSession } from 'next-auth/next';
// import { authOptions } from '../auth/[...nextauth]/route';
// import { connectDB } from '@/lib/db';
// import { Comment } from '@/models/Comment';
// import { CommentLike } from '@/models/CommentLike';
// import { User } from '@/models/User';

// export async function GET(request) {
//   await connectDB();
//   const url = new URL(request.url);
//   const contentId = url.searchParams.get('content');

//   if (!contentId) {
//     return NextResponse.json({ error: 'Missing contentId' }, { status: 400 });
//   }

//   const session = await getServerSession(authOptions);
//   const userId = session?.user?.id;

//   try {
//     const comments = await Comment.find({ contentId }).sort({ createdAt: -1 }).lean();
//     const enriched = await Promise.all(
//       comments.map(async (c) => {
//         const [likedByMe, user] = await Promise.all([
//           userId ? CommentLike.findOne({ commentId: c._id, userId }).lean() : null,
//           User.findById(c.userId, 'username profile.firstName profile.lastName').lean()
//         ]);
//         return {
//           ...c,
//           likedByMe: Boolean(likedByMe),
//           username: user?.username || 'Anonymous',
//           userDisplayName: userDisplayName(user)
//         };
//       })
//     );
//     return NextResponse.json(enriched);
//   } catch (error) {
//     console.error('Error fetching comments:', error);
//     return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
//   }
// }

// export async function POST(request) {
//   await connectDB();
//   const session = await getServerSession(authOptions);
//   if (!session) {
//     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//   }
//   const userId = session.user.id;

//   try {
//     const body = await request.json();
//     const { action, contentId, text, parentCommentId, commentId } = body;

//     // Top-level comment
//     if (action === 'comment') {
//       if (!contentId || !text?.trim()) {
//         return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
//       }
//       const comment = await Comment.create({ contentId, userId, text: text.trim() });
//       const user = await User.findById(userId, 'username profile.firstName profile.lastName').lean();
//       return NextResponse.json(
//         { ...comment.toObject(), username: user?.username || 'Anonymous', userDisplayName: userDisplayName(user) },
//         { status: 201 }
//       );
//     }

//     // Reply to a comment
//     if (action === 'reply') {
//       const parentId = parentCommentId;
//       if (!parentId || !text?.trim()) {
//         return NextResponse.json({ error: 'Missing fields for reply' }, { status: 400 });
//       }
//       const parentComment = await Comment.findById(parentId);
//       if (!parentComment) {
//         return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
//       }
//       const reply = await Comment.create({
//         contentId: parentComment.contentId,
//         userId,
//         text: text.trim(),
//         parentId
//       });
//       const user = await User.findById(userId, 'username profile.firstName profile.lastName').lean();
//       return NextResponse.json(
//         { ...reply.toObject(), username: user?.username || 'Anonymous', userDisplayName: userDisplayName(user) },
//         { status: 201 }
//       );
//     }

//     // Edit comment
//     if (action === 'edit') {
//       if (!commentId || !text?.trim()) {
//         return NextResponse.json({ error: 'Missing fields for edit' }, { status: 400 });
//       }
//       const comment = await Comment.findById(commentId);
//       if (!comment) {
//         return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
//       }
//       if (comment.userId.toString() !== userId) {
//         return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
//       }
//       const updated = await Comment.findByIdAndUpdate(
//         commentId,
//         { text: text.trim(), tags: extractTags(text) || comment.tags, edited: true },
//         { new: true }
//       );
//       const user = await User.findById(userId, 'username profile.firstName profile.lastName').lean();
//       return NextResponse.json(
//         { ...updated.toObject(), username: user?.username || 'Anonymous', userDisplayName: userDisplayName(user) }
//       );
//     }

//     // Toggle like
//     if (action === 'toggle-like') {
//       if (!commentId) {
//         return NextResponse.json({ error: 'Missing commentId' }, { status: 400 });
//       }
//       const existing = await CommentLike.findOne({ commentId, userId });
//       if (existing) {
//         await CommentLike.deleteOne({ commentId, userId });
//         await Comment.findByIdAndUpdate(commentId, { $inc: { likes: -1 } });
//         return NextResponse.json({ liked: false });
//       } else {
//         await CommentLike.create({ commentId, userId });
//         await Comment.findByIdAndUpdate(commentId, { $inc: { likes: 1 } });
//         return NextResponse.json({ liked: true });
//       }
//     }

//     // Delete comment
//     if (action === 'delete') {
//       if (!commentId) {
//         return NextResponse.json({ error: 'Missing commentId' }, { status: 400 });
//       }
//       const comment = await Comment.findById(commentId);
//       if (!comment) {
//         return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
//       }
//       if (comment.userId.toString() !== userId) {
//         return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
//       }
//       await Promise.all([
//         Comment.findByIdAndDelete(commentId),
//         CommentLike.deleteMany({ commentId })
//       ]);
//       return NextResponse.json({ success: true });
//     }

//     return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
//   } catch (error) {
//     console.error('Error in comments API:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }

// // Helpers
// function extractTags(text) {
//   const tagRegex = /@(\w+)/g;
//   const tags = [];
//   let match;
//   while ((match = tagRegex.exec(text)) !== null) tags.push({ username: match[1] });
//   return tags;
// }

// function userDisplayName(user) {
//   if (user?.profile?.firstName && user?.profile?.lastName) {
//     return `${user.profile.firstName} ${user.profile.lastName}`;
//   }
//   return user?.username || 'Anonymous';
// }




// import { NextResponse } from 'next/server';
// import { getServerSession } from 'next-auth/next';
// import { authOptions } from '../auth/[...nextauth]/route';
// import { connectDB } from '@/lib/db';
// import { Comment } from '@/models/Comment';
// import { CommentLike } from '@/models/CommentLike';
// import { User } from '@/models/User';

// export async function GET(request) {
//   await connectDB();
//   const url = new URL(request.url);
//   const contentId = url.searchParams.get('content');
  
//   if (!contentId) {
//     return NextResponse.json({ error: 'Missing contentId' }, { status: 400 });
//   }

//   const session = await getServerSession(authOptions);
//   const userId = session?.user?.id;

//   try {
//     // Fetch comments with user information
//     const comments = await Comment.find({ contentId })
//       .sort({ createdAt: -1 })
//       .lean();

//     // Enrich comments with like status and user info
//     const enriched = await Promise.all(
//       comments.map(async (c) => {
//         const [likedByMe, user] = await Promise.all([
//           userId ? CommentLike.findOne({ commentId: c._id, userId }).lean() : null,
//           User.findById(c.userId, 'username profile.firstName profile.lastName').lean()
//         ]);

//         return { 
//           ...c, 
//           likedByMe: Boolean(likedByMe),
//           username: user?.username || 'Anonymous',
//           userDisplayName: user?.profile?.firstName && user?.profile?.lastName 
//             ? `${user.profile.firstName} ${user.profile.lastName}`
//             : user?.username || 'Anonymous'
//         };
//       })
//     );

//     return NextResponse.json(enriched);
//   } catch (error) {
//     console.error('Error fetching comments:', error);
//     return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
//   }
// }

// export async function POST(request) {
//   await connectDB();
//   const session = await getServerSession(authOptions);
  
//   if (!session) {
//     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//   }

//   const userId = session.user.id;
  
//   try {
//     const body = await request.json();
//     const { commentId, action, contentId, text } = body;

//     // Create new comment
//     if (action === 'comment') {
//       if (!contentId || !text?.trim()) {
//         return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
//       }
      
//       const comment = await Comment.create({ 
//         contentId, 
//         userId, 
//         text: text.trim() 
//       });
      
//       // Get user info for the response
//       const user = await User.findById(userId, 'username profile.firstName profile.lastName').lean();
      
//       return NextResponse.json({
//         ...comment.toObject(),
//         username: user?.username || 'Anonymous',
//         userDisplayName: user?.profile?.firstName && user?.profile?.lastName 
//           ? `${user.profile.firstName} ${user.profile.lastName}`
//           : user?.username || 'Anonymous'
//       }, { status: 201 });
//     }

//     // Edit comment
//     if (action === 'edit') {
//       if (!commentId || !text?.trim()) {
//         return NextResponse.json({ error: 'Missing fields for edit' }, { status: 400 });
//       }
      
//       const comment = await Comment.findById(commentId);
//       if (!comment) {
//         return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
//       }
      
//       if (comment.userId.toString() !== userId) {
//         return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
//       }
      
//       // Update the comment text and tags
//       const updated = await Comment.findByIdAndUpdate(
//         commentId,
//         { 
//           text: text.trim(),
//           tags: extractTags(text) || comment.tags,
//           edited: true
//         },
//         { new: true }
//       );

//       // Get user info for the response
//       const user = await User.findById(userId, 'username profile.firstName profile.lastName').lean();
      
//       return NextResponse.json({
//         ...updated.toObject(),
//         username: user?.username || 'Anonymous',
//         userDisplayName: user?.profile?.firstName && user?.profile?.lastName 
//           ? `${user.profile.firstName} ${user.profile.lastName}`
//           : user?.username || 'Anonymous'
//       });
//     }

//     // Toggle like on comment
//     if (action === 'toggle-like') {
//       if (!commentId) {
//         return NextResponse.json({ error: 'Missing commentId' }, { status: 400 });
//       }

//       const existing = await CommentLike.findOne({ commentId, userId });
      
//       if (existing) {
//         // Remove like
//         await CommentLike.deleteOne({ commentId, userId });
//         await Comment.findByIdAndUpdate(commentId, { $inc: { likes: -1 } });
//         return NextResponse.json({ liked: false });
//       } else {
//         // Add like
//         await CommentLike.create({ commentId, userId });
//         await Comment.findByIdAndUpdate(commentId, { $inc: { likes: 1 } });
//         return NextResponse.json({ liked: true });
//       }
//     }

//     // Delete comment
//     if (action === 'delete') {
//       if (!commentId) {
//         return NextResponse.json({ error: 'Missing commentId' }, { status: 400 });
//       }

//       // Check if user owns the comment
//       const comment = await Comment.findById(commentId);
//       if (!comment) {
//         return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
//       }

//       if (comment.userId.toString() !== userId) {
//         return NextResponse.json({ error: 'Forbidden - You can only delete your own comments' }, { status: 403 });
//       }

//       // Delete the comment and all its likes
//       await Promise.all([
//         Comment.findByIdAndDelete(commentId),
//         CommentLike.deleteMany({ commentId })
//       ]);

//       return NextResponse.json({ success: true });
//     }

//     return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
//   } catch (error) {
//     console.error('Error in comments API:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }


// export async function PUT(request) {
//   await connectDB();
//   const session = await getServerSession(authOptions);
  
//   if (!session) {
//     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//   }

//   const userId = session.user.id;
  
//   try {
//     const body = await request.json();
//     const { id, update } = body;

//     if (!id || !update?.text?.trim()) {
//       return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
//     }

//     // Check if user owns the comment
//     const comment = await Comment.findById(id);
//     if (!comment) {
//       return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
//     }

//     if (comment.userId.toString() !== userId) {
//       return NextResponse.json({ error: 'Forbidden - You can only edit your own comments' }, { status: 403 });
//     }

//     // Update the comment
//     const updatedComment = await Comment.findByIdAndUpdate(
//       id,
//       { 
//         text: update.text.trim(),
//         tags: extractTags(update.text) || comment.tags
//       },
//       { new: true }
//     );

//     // Get user info for the response
//     const user = await User.findById(userId, 'username profile.firstName profile.lastName').lean();
    
//     return NextResponse.json({
//       ...updatedComment.toObject(),
//       username: user?.username || 'Anonymous',
//       userDisplayName: user?.profile?.firstName && user?.profile?.lastName 
//         ? `${user.profile.firstName} ${user.profile.lastName}`
//         : user?.username || 'Anonymous'
//     });

//   } catch (error) {
//     console.error('Error updating comment:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }

// // Helper function to extract tags
// function extractTags(text) {
//   const tagRegex = /@(\\w+)/g;
//   const tags = [];
//   let match;
  
//   while ((match = tagRegex.exec(text)) !== null) {
//     tags.push({ username: match[1] });
//   }
  
//   return tags;
// }


// import { NextResponse } from 'next/server';
// import { getServerSession } from 'next-auth/next';
// import { authOptions } from '../auth/[...nextauth]/route';
// import { connectDB } from '@/lib/db';
// import { Comment } from '@/models/Comment';
// import { CommentLike } from '@/models/CommentLike';
// import { User } from '@/models/User';

// export async function GET(request) {
//   await connectDB();
//   const url = new URL(request.url);
//   const contentId = url.searchParams.get('content');

//   if (!contentId) {
//     return NextResponse.json({ error: 'Missing contentId' }, { status: 400 });
//   }

//   const session = await getServerSession(authOptions);
//   const userId = session?.user?.id;

//   try {
//     // Fetch all comments (including replies)
//     const allComments = await Comment.find({ contentId }).sort({ createdAt: 1 }).lean();

//     // Build map and tree
//     const map = {};
//     allComments.forEach(c => { map[c._id] = { ...c, replies: [] }; });
//     const roots = [];
//     allComments.forEach(c => {
//       if (c.parentId) {
//         const parent = map[c.parentId];
//         if (parent) parent.replies.push(map[c._id]);
//       } else {
//         roots.push(map[c._id]);
//       }
//     });

//     // Enrich with user info and like status recursively
//     async function enrich(nodes) {
//       return Promise.all(nodes.map(async node => {
//         const [likedByMe, user] = await Promise.all([
//           userId ? CommentLike.findOne({ commentId: node._id, userId }).lean() : null,
//           User.findById(node.userId, 'username profile.firstName profile.lastName').lean()
//         ]);
//         const enriched = {
//           ...node,
//           likedByMe: Boolean(likedByMe),
//           username: user?.username || 'Anonymous',
//           userDisplayName: userDisplayName(user),
//           replies: []
//         };
//         enriched.replies = await enrich(node.replies);
//         return enriched;
//       }));
//     }

//     const enrichedTree = await enrich(roots);
//     return NextResponse.json(enrichedTree);
//   } catch (error) {
//     console.error('Error fetching comments:', error);
//     return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
//   }
// }

// export async function POST(request) {
//   await connectDB();
//   const session = await getServerSession(authOptions);
//   if (!session) {
//     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//   }
//   const userId = session.user.id;

//   try {
//     const body = await request.json();
//     const { action, contentId, text, parentCommentId, commentId } = body;

//     // Top-level comment
//     if (action === 'comment') {
//       if (!contentId || !text?.trim()) {
//         return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
//       }
//       const comment = await Comment.create({ contentId, userId, text: text.trim() });
//       const user = await User.findById(userId, 'username profile.firstName profile.lastName').lean();
//       return NextResponse.json(
//         { ...comment.toObject(), username: user?.username || 'Anonymous', userDisplayName: userDisplayName(user) },
//         { status: 201 }
//       );
//     }

//     // Reply to a comment
//     if (action === 'reply') {
//       const parentId = parentCommentId;
//       if (!parentId || !text?.trim()) {
//         return NextResponse.json({ error: 'Missing fields for reply' }, { status: 400 });
//       }
//       const parentComment = await Comment.findById(parentId);
//       if (!parentComment) {
//         return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
//       }
//       const reply = await Comment.create({
//         contentId: parentComment.contentId,
//         userId,
//         text: text.trim(),
//         parentId
//       });
//       const user = await User.findById(userId, 'username profile.firstName profile.lastName').lean();
//       return NextResponse.json(
//         { ...reply.toObject(), username: user?.username || 'Anonymous', userDisplayName: userDisplayName(user) },
//         { status: 201 }
//       );
//     }

//     // Edit, toggle-like, delete omitted for brevity (unchanged)
//     // …

//     return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
//   } catch (error) {
//     console.error('Error in comments API:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }

// // Helpers
// function extractTags(text) {
//   const tagRegex = /@(\w+)/g;
//   const tags = [];
//   let match;
//   while ((match = tagRegex.exec(text)) !== null) tags.push({ username: match[1] });
//   return tags;
// }

// function userDisplayName(user) {
//   if (user?.profile?.firstName && user?.profile?.lastName) {
//     return `${user.profile.firstName} ${user.profile.lastName}`;
//   }
//   return user?.username || 'Anonymous';
// }


import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import { connectDB } from '@/lib/db';
import { Comment } from '@/models/Comment';
import { CommentLike } from '@/models/CommentLike';
import { User } from '@/models/User';

async function getSessionUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id;
}

export async function GET(request) {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const contentId = searchParams.get('content');

  if (!contentId) {
    return NextResponse.json({ error: 'Missing contentId' }, { status: 400 });
  }

  const userId = await getSessionUserId();

  try {
    const allComments = await Comment.find({ contentId }).sort({ createdAt: 1 }).lean();
    const map = {};
    allComments.forEach(c => { map[c._id] = { ...c, replies: [] }; });
    const roots = [];

    allComments.forEach(c => {
      if (c.parentId) {
        map[c.parentId]?.replies.push(map[c._id]);
      } else {
        roots.push(map[c._id]);
      }
    });

    const enrichNode = async (node) => {
      const [likedByMe, user] = await Promise.all([
        userId ? CommentLike.findOne({ commentId: node._id, userId }).lean() : null,
        User.findById(node.userId, 'username profile.firstName profile.lastName').lean(),
      ]);

      const enriched = {
        ...node,
        likedByMe: Boolean(likedByMe),
        likes: node.likes || 0,
        username: user?.username || 'Anonymous',
        userDisplayName:
          user?.profile?.firstName && user?.profile?.lastName
            ? `${user.profile.firstName} ${user.profile.lastName}`
            : user?.username || 'Anonymous',
        replies: [],
      };

      enriched.replies = await Promise.all(node.replies.map(enrichNode));
      return enriched;
    };

    const result = await Promise.all(roots.map(enrichNode));
    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/comments error:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(request) {
  await connectDB();
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, contentId, text, parentCommentId, commentId } = await request.json();

    switch (action) {
      case 'comment': {
        if (!contentId || !text?.trim()) {
          return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }
        const comment = await Comment.create({ contentId, userId, text: text.trim() });
        return await enrichSingle(comment, 201);
      }

      case 'reply': {
        const parentId = parentCommentId;
        if (!parentId || !text?.trim()) {
          return NextResponse.json({ error: 'Missing fields for reply' }, { status: 400 });
        }
        const parent = await Comment.findById(parentId);
        if (!parent) {
          return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
        }
        const reply = await Comment.create({ contentId: parent.contentId, userId, text: text.trim(), parentId });
        return await enrichSingle(reply, 201);
      }

      case 'edit': {
        if (!commentId || !text?.trim()) {
          return NextResponse.json({ error: 'Missing fields for edit' }, { status: 400 });
        }
        const cm = await Comment.findById(commentId);
        if (!cm) {
          return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
        }
        if (cm.userId.toString() !== userId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const updated = await Comment.findByIdAndUpdate(commentId, { text: text.trim(), edited: true }, { new: true });
        return await enrichSingle(updated);
      }

      case 'toggle-like': {
        if (!commentId) {
          return NextResponse.json({ error: 'Missing commentId' }, { status: 400 });
        }
        const already = await CommentLike.findOne({ commentId, userId });
        let liked;
        if (already) {
          await CommentLike.deleteOne({ commentId, userId });
          await Comment.findByIdAndUpdate(commentId, { $inc: { likes: -1 } });
          liked = false;
        } else {
          await CommentLike.create({ commentId, userId });
          await Comment.findByIdAndUpdate(commentId, { $inc: { likes: 1 } });
          liked = true;
        }
        const updatedComment = await Comment.findById(commentId, 'likes').lean();
        const likes = updatedComment?.likes || 0;
        return NextResponse.json({ liked, likes });
      }

      case 'delete': {
        if (!commentId) {
          return NextResponse.json({ error: 'Missing commentId' }, { status: 400 });
        }
        const toDel = await Comment.findById(commentId);
        if (!toDel) {
          return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
        }
        if (toDel.userId.toString() !== userId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await Promise.all([
          Comment.findByIdAndDelete(commentId),
          CommentLike.deleteMany({ commentId }),
        ]);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('POST /api/comments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function enrichSingle(commentDoc, status = 200) {
  const user = await User.findById(commentDoc.userId, 'username profile.firstName profile.lastName').lean();
  const enriched = {
    ...commentDoc.toObject(),
    likedByMe: false,
    likes: commentDoc.likes || 0,
    username: user?.username || 'Anonymous',
    userDisplayName:
      user?.profile?.firstName && user?.profile?.lastName
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : user?.username || 'Anonymous',
    replies: [],
  };
  return NextResponse.json(enriched, { status });
}
