// src/app/api/content/route.js - FIXED
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import { ContentItem } from '../../../models/ContentItem';
import { connectDB } from '../../../lib/db';
import { Comment } from '../../../models/Comment';
import { Like } from '../../../models/Like';
import { User } from '../../../models/User';
import { v4 as uuidv4 } from 'uuid';

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

    // Handle regular form posts (new content from AddContentForm)
    if (!action && url && title && summary) {
      // Check for duplicate URL per user with debugging
      console.log(`🔍 Checking for duplicate URL: ${url} for user: ${userId}`);
      const existingItem = await ContentItem.findOne({ url, userId });
      
      if (existingItem) {
        // Instead of returning an error, update the post
        existingItem.title = title;
        existingItem.summary = summary;
        if (typeof qualityScore === 'number') existingItem.qualityScore = qualityScore;
        if (extensionData) existingItem.extensionData = extensionData;
        existingItem.isFromExtension = !!isFromExtension;
        existingItem.isQualified = !!isFromExtension || (typeof qualityScore === 'number' && qualityScore > 0);
        await existingItem.save();
        const updatedItem = await ContentItem.findById(existingItem._id)
          .populate('userId', 'username profile.firstName profile.lastName')
          .lean();
        return NextResponse.json({
          ...updatedItem,
          _id: updatedItem._id.toString(),
          author: updatedItem.userId,
          saved: true,
          likedByMe: false
        }, { status: 200 });
      }
      
      console.log(`✅ No duplicate found, creating new post`);

      const newItem = await ContentItem.create({ 
        userId, 
        url, 
        title, 
        summary, 
        likes: 0,
        status: 'active',
        isFromExtension: false,
        isQualified: false // Regular posts are not automatically qualified
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

    // Handle extension posts (qualified content)
    if (isFromExtension && url && title && qualityScore !== undefined) {
      console.log('[DEBUG] Incoming extension post:', { userId, url, title, qualityScore, extensionData });
      console.log('🔍 Saving extension content for user ID:', userId);
      // Normalize URL (remove trailing slash for matching)
      const normalizeUrl = (u) => u ? u.replace(/\/$/, '') : '';
      const normalizedUrl = normalizeUrl(url);
      // Find all candidate posts for this user and similar URLs
      const candidates = await ContentItem.find({
        userId,
        $or: [
          { url: normalizedUrl },
          { url: normalizedUrl + '/' },
          { url: url },
          { url: url + '/' }
        ]
      });
      console.log('🔍 Candidate posts for upgrade:', candidates.map(c => ({ id: c._id, url: c.url, isFromExtension: c.isFromExtension, isQualified: c.isQualified, qualityScore: c.qualityScore })));
      // Use the first candidate if any
      let existingItem = candidates[0];
      const scanId = uuidv4();
      if (existingItem) {
        // Overwrite previous analysis, always set isFromExtension and isQualified to true
        existingItem.isFromExtension = true;
        existingItem.isQualified = true;
        existingItem.qualityScore = qualityScore;
        existingItem.extensionData = {
          ...extensionData,
          scanId,
          scannedAt: new Date().toISOString()
        };
        // Extra logging
        console.log('🔍 Upgrading existing post:', {
          id: existingItem._id,
          url: existingItem.url,
          isFromExtension: existingItem.isFromExtension,
          isQualified: existingItem.isQualified,
          qualityScore: existingItem.qualityScore,
          extensionData: existingItem.extensionData
        });
        await existingItem.save();
        // Fetch fresh from DB to ensure correct values
        const upgraded = await ContentItem.findById(existingItem._id).lean();
        console.log('[DEBUG] Saved/Upgraded extension post:', upgraded);
        return NextResponse.json({
          ...upgraded,
          _id: upgraded._id.toString(),
          author: upgraded.userId,
          saved: true,
          likedByMe: false
        }, { status: 200 });
      }

      const newItem = await ContentItem.create({
        userId,
        url: normalizedUrl,
        title,
        summary: summary || title,
        likes: 0,
        status: 'active',
        qualityScore: qualityScore,
        isFromExtension: true,
        isQualified: true,
        extensionData: {
          ...extensionData,
          scanId,
          scannedAt: new Date().toISOString()
        }
      });
      // Extra logging
      console.log('[DEBUG] Created new extension post:', newItem);
      return NextResponse.json({
        ...newItem.toObject(),
        _id: newItem._id.toString(),
        author: newItem.userId,
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