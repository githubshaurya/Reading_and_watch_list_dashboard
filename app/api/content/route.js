// src/app/api/content/route.js - FIXED
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import { ContentItem } from '../../../models/ContentItem';
import { connectDB } from '../../../lib/db';
import { Comment } from '../../../models/Comment';
import { Like } from '../../../models/Like';
import { User } from '../../../models/User';

export async function POST(request) {
  try {
    let retries = 3;
    let connected = false;
    
    while (!connected && retries > 0) {
      try {
        await connectDB();
        connected = true;
      } catch (dbError) {
        retries--;
        console.error(`❌ Database connection attempt failed. Retries left: ${retries}`, dbError.message);
        
        if (retries === 0) {
          return NextResponse.json({ 
            error: 'Database connection failed. Please try again later.',
            details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
          }, { status: 503 });
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { action, id, update, url, title, summary, qualityScore, isFromExtension, extensionData } = body;
    const userId = session.user.id;

    // FIXED: Handle extension posts (qualified content)
      if (isFromExtension && url && title && qualityScore) {
    // Check for duplicate URL per user
    const existingItem = await ContentItem.findOne({ url, userId });
    if (existingItem) {
      return NextResponse.json({ error: 'Already posted' }, { status: 400 });
    }

    const newItem = await ContentItem.create({ 
      userId, 
      url, 
      title, 
      summary: summary || title, 
      likes: 0,
      status: 'active',
      qualityScore: qualityScore,
      isFromExtension: true,
      isQualified: true,
      extensionData: extensionData
    });

    const populatedItem = await ContentItem.findById(newItem._id)
      .populate('userId', 'username profile.firstName profile.lastName')
      .lean();

    return NextResponse.json({
      ...populatedItem,
      _id: populatedItem._id.toString(),
      author: populatedItem.userId,
      saved: true,
      likedByMe: false
    }, { status: 201 });
  }

    // Edit post
    if (action === 'edit-post' && id && update) {
      const item = await ContentItem.findById(id);
      if (!item) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      }
      
      if (item.userId.toString() !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      const edited = await ContentItem.findByIdAndUpdate(id, update, { new: true })
        .populate('userId', 'username profile.firstName profile.lastName')
        .lean();

      return NextResponse.json({
        ...edited,
        _id: edited._id.toString(),
        author: edited.userId
      });
    }

    // Delete post
    if (action === 'delete-post' && id) {
      const item = await ContentItem.findById(id);
      if (!item) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      }
      
      if (item.userId.toString() !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      await ContentItem.findByIdAndDelete(id);
      // Also delete associated likes and comments
      await Like.deleteMany({ contentId: id });
      await Comment.deleteMany({ contentId: id });
      
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Toggle like
    if (action === 'toggle-like' && id) {
      const item = await ContentItem.findById(id);
      if (!item) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      }

      const existing = await Like.findOne({ contentId: id, userId });
      if (existing) {
        await Like.deleteOne({ contentId: id, userId });
        await ContentItem.findByIdAndUpdate(id, { $inc: { likes: -1 } });
        return NextResponse.json({ liked: false });
      } else {
        await Like.create({ contentId: id, userId });
        await ContentItem.findByIdAndUpdate(id, { $inc: { likes: 1 } });
        return NextResponse.json({ liked: true });
      }
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

    if (action === 'get-user-urls') {
      const userItems = await ContentItem.find({ 
        userId, 
        status: 'active',
        isFromExtension: true 
      }).select('url').lean();
      
      const urls = userItems.map(item => item.url);
      return NextResponse.json({ urls });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    
  } catch (error) {
    console.error('POST /api/content error:', error);
    
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error.name === 'MongoServerSelectionError') {
      errorMessage = 'Database connection failed. Please try again later.';
      statusCode = 503;
    } else if (error.name === 'MongoTimeoutError') {
      errorMessage = 'Database query timed out. Please try again.';
      statusCode = 504;
    }
    
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: statusCode });
  }
}

export async function GET(request) {
  try {
    let retries = 3;
    let connected = false;
    
    while (!connected && retries > 0) {
      try {
        await connectDB();
        connected = true;
        console.log('✅ Database connection established');
      } catch (dbError) {
        retries--;
        console.error(`❌ Database connection attempt failed. Retries left: ${retries}`, dbError.message);
        
        if (retries === 0) {
          return NextResponse.json({ 
            error: 'Database connection failed. Please try again later.',
            details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
          }, { status: 503 });
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = page === 1 ? 15 : 10;
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // Check if this is a like status query
    const likedId = url.searchParams.get('liked');
    if (likedId && userId) {
      try {
        const liked = await Like.exists({ contentId: likedId, userId });
        return NextResponse.json({ liked: Boolean(liked) });
      } catch (queryError) {
        console.error('Error checking like status:', queryError);
        return NextResponse.json({ liked: false });
      }
    }

    let total = 0;
    try {
      total = await ContentItem.countDocuments({ status: 'active' });
    } catch (countError) {
      console.error('Error counting documents:', countError);
    }
    
    let items = [];
    try {
      items = await ContentItem.find({ status: 'active' })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'username profile.firstName profile.lastName isExtensionUser linkedAccountId')
        .lean()
        .maxTimeMS(10000);
    } catch (queryError) {
      console.error('Error fetching content items:', queryError);
      return NextResponse.json({ 
        error: 'Failed to fetch content. Please try again.',
        details: process.env.NODE_ENV === 'development' ? queryError.message : undefined
      }, { status: 500 });
    }

    // Enrich items with additional data
    const enriched = await Promise.all(
      items.map(async item => {
        try {
          const liked = userId
            ? await Like.exists({ contentId: item._id, userId })
            : false;
          const commentCount = await Comment.countDocuments({ contentId: item._id });
          
          let linkedAccount = null;
          if (item.userId?.isExtensionUser && item.userId?.linkedAccountId) {
            try {
              linkedAccount = await User.findById(item.userId.linkedAccountId)
                .select('username profile.firstName profile.lastName')
                .lean();
            } catch (linkedError) {
              console.warn('Failed to fetch linked account:', linkedError);
            }
          }
          
          return {
            ...item,
            _id: item._id.toString(),
            author: item.userId,
            linkedAccount,
            likedByMe: Boolean(liked),
            commentCount,
            isFromExtension: item.isFromExtension || item.userId?.isExtensionUser,
            qualityScore: item.qualityScore || item.extensionData?.score
          };

          
    
        } catch (enrichError) {
          console.error('Error enriching item:', enrichError);
          return {
            ...item,
            _id: item._id.toString(),
            author: item.userId,
            linkedAccount: null,
            likedByMe: false,
            commentCount: 0,
            isFromExtension: false,
            qualityScore: null
          };
        }
      })
    );

    return NextResponse.json({
      items: enriched,
      hasMore: total > 0 ? page * limit < total : false,
      total: total
    });
    
  } catch (error) {
    console.error('GET /api/content error:', error);
    
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error.name === 'MongoServerSelectionError') {
      errorMessage = 'Database connection failed. Please try again later.';
      statusCode = 503;
    } else if (error.name === 'MongoTimeoutError') {
      errorMessage = 'Database query timed out. Please try again.';
      statusCode = 504;
    }
    
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: statusCode });
  }
}