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
