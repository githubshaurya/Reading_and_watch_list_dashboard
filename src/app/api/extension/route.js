// src/app/api/extension/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/db';
import { ContentItem } from '../../../models/ContentItem';
import { User } from '../../../models/User';
import { Follow } from '../../../models/Follow';
import { corsHeaders } from '../../../lib/cors';
import mongoose from 'mongoose';

export async function OPTIONS(request) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

// GET - Public access to extension user data (no auth required)
export async function GET(request) {
  try {
    await connectDB();
    const url = new URL(request.url);
    const extensionUserId = url.searchParams.get('extensionUserId');
    const username = url.searchParams.get('username'); // New: allow username lookup
    const action = url.searchParams.get('action');

    if (!extensionUserId && !username) {
      return NextResponse.json({ 
        error: 'Extension user ID or username required' 
      }, { 
        status: 400,
        headers: corsHeaders()
      });
    }

    // Find user by multiple possible fields for broader compatibility
    let user = null;
    
    if (username) {
      // Look up by username first
      user = await User.findOne({ username: username });
    } else if (extensionUserId) {
      // Build query conditions based on what extensionUserId could be
      const queryConditions = [
        { extensionUserId: extensionUserId },
        { userId: extensionUserId }, // Extension creates users with 'userId' field
        { username: extensionUserId }, // In case someone uses username in URL
      ];
      
      // Only add _id condition if extensionUserId is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(extensionUserId)) {
        queryConditions.push({ _id: extensionUserId });
      }
      
      user = await User.findOne({ 
        $or: queryConditions
      });
    }

    if (!user) {
      return NextResponse.json({ 
        error: 'User not found',
        message: 'This user does not exist or has no public content.',
        searchedFor: extensionUserId || username
      }, { 
        status: 404,
        headers: corsHeaders()
      });
    }

    switch (action) {
      case 'profile':
        return await handleGetPublicProfile(user);
      
      case 'content':
        return await handleGetPublicContent(url, user);
      
      case 'stats':
        return await handleGetPublicStats(user);
      
      case 'feed':
        return await handleGetPublicFeed(url, user);
      
      default:
        // Default action returns profile
        return await handleGetPublicProfile(user);
    }

  } catch (error) {
    console.error('Public Extension API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { 
      status: 500,
      headers: corsHeaders()
    });
  }
}

// Helper Functions

async function handleGetPublicProfile(user) {
  const contentCount = await ContentItem.countDocuments({ 
    userId: user._id, 
    status: 'active' 
  });
  
  const totalLikes = await ContentItem.aggregate([
    { $match: { userId: user._id, status: 'active' } },
    { $group: { _id: null, total: { $sum: '$likes' } } }
  ]);

  const followingCount = await Follow.countDocuments({ follower: user._id });
  const followersCount = await Follow.countDocuments({ following: user._id });

  return NextResponse.json({
    userId: user._id,
    username: user.username,
    displayName: user.profile?.firstName || user.displayName || user.username,
    bio: user.profile?.bio || null,
    avatar: user.profile?.avatar || null,
    isExtensionUser: user.isExtensionUser || false,
    stats: {
      contentCount,
      totalLikes: totalLikes[0]?.total || 0,
      followingCount,
      followersCount
    },
    joinedAt: user.createdAt,
    lastActive: user.lastLogin || user.updatedAt
  }, {
    headers: corsHeaders()
  });
}

async function handleGetPublicContent(url, user) {
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);
  const contentType = url.searchParams.get('contentType');

  // Limit the maximum items per request
  const actualLimit = Math.min(limit, 50);

  const query = { 
    userId: user._id, 
    status: 'active' 
  };
  
  if (contentType) {
    query['extensionData.contentType'] = contentType;
  }

  const items = await ContentItem.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * actualLimit)
    .limit(actualLimit)
    .populate('userId', 'username profile.firstName profile.lastName displayName')
    .lean();

  const total = await ContentItem.countDocuments(query);

  // Transform items for public consumption
  const publicItems = items.map(item => ({
    _id: item._id,
    title: item.title,
    url: item.url,
    summary: item.summary,
    likes: item.likes,
    createdAt: item.createdAt,
    extensionData: {
      score: item.extensionData?.score,
      contentType: item.extensionData?.contentType
    },
    metadata: {
      domain: item.metadata?.domain
    },
    author: {
      username: item.userId.username,
      displayName: item.userId.profile?.firstName || item.userId.displayName || item.userId.username
    }
  }));

  return NextResponse.json({
    items: publicItems,
    hasMore: page * actualLimit < total,
    total,
    page,
    limit: actualLimit
  }, {
    headers: corsHeaders()
  });
}

async function handleGetPublicFeed(url, user) {
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const actualLimit = Math.min(limit, 50);

  // Get high-quality content from this user
  const items = await ContentItem.find({ 
    userId: user._id, 
    status: 'active',
    'extensionData.score': { $gte: 0.7 } // Only high-quality content for feed
  })
    .sort({ createdAt: -1 })
    .skip((page - 1) * actualLimit)
    .limit(actualLimit)
    .populate('userId', 'username profile.firstName profile.lastName displayName')
    .lean();

  const total = await ContentItem.countDocuments({ 
    userId: user._id, 
    status: 'active',
    'extensionData.score': { $gte: 0.7 }
  });

  // Transform items for feed consumption
  const feedItems = items.map(item => ({
    _id: item._id,
    title: item.title,
    url: item.url,
    summary: item.summary,
    preview: item.summary || item.title,
    likes: item.likes,
    createdAt: item.createdAt,
    qualityScore: Math.round((item.extensionData?.score || 0) * 100),
    contentType: item.extensionData?.contentType || 'article',
    domain: item.metadata?.domain || new URL(item.url).hostname,
    author: {
      username: item.userId.username,
      displayName: item.userId.profile?.firstName || item.userId.displayName || item.userId.username
    }
  }));

  return NextResponse.json({
    user: {
      username: user.username,
      displayName: user.profile?.firstName || user.displayName || user.username,
      bio: user.profile?.bio || null,
      avatar: user.profile?.avatar || null
    },
    items: feedItems,
    hasMore: page * actualLimit < total,
    total,
    page,
    limit: actualLimit,
    feedInfo: {
      description: `Curated quality content from ${user.profile?.firstName || user.displayName || user.username}`,
      qualityThreshold: 70,
      updateFrequency: 'As content is discovered'
    }
  }, {
    headers: corsHeaders()
  });
}

async function handleGetPublicStats(user) {
  const contentStats = await ContentItem.aggregate([
    { $match: { userId: user._id, status: 'active' } },
    {
      $group: {
        _id: '$extensionData.contentType',
        count: { $sum: 1 },
        avgScore: { $avg: '$extensionData.score' },
        totalLikes: { $sum: '$likes' }
      }
    }
  ]);

  const recentActivity = await ContentItem.find({ 
    userId: user._id, 
    status: 'active' 
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('title url createdAt extensionData.score likes metadata.domain')
    .lean();

  const topContent = await ContentItem.find({ 
    userId: user._id, 
    status: 'active' 
  })
    .sort({ likes: -1 })
    .limit(5)
    .select('title url likes extensionData.score metadata.domain')
    .lean();

  const totalContent = await ContentItem.countDocuments({ 
    userId: user._id, 
    status: 'active' 
  });

  return NextResponse.json({
    contentStats: contentStats.map(stat => ({
      contentType: stat._id || 'unknown',
      count: stat.count,
      avgScore: Math.round((stat.avgScore || 0) * 100) / 100,
      totalLikes: stat.totalLikes
    })),
    recentActivity: recentActivity.map(item => ({
      title: item.title,
      url: item.url,
      domain: item.metadata?.domain || new URL(item.url).hostname,
      createdAt: item.createdAt,
      likes: item.likes,
      qualityScore: item.extensionData?.score
    })),
    topContent: topContent.map(item => ({
      title: item.title,
      url: item.url,
      domain: item.metadata?.domain || new URL(item.url).hostname,
      likes: item.likes,
      qualityScore: item.extensionData?.score
    })),
    summary: {
      totalContent,
      totalLikes: contentStats.reduce((sum, stat) => sum + stat.totalLikes, 0),
      avgQualityScore: contentStats.length > 0 ? 
        Math.round((contentStats.reduce((sum, stat) => sum + (stat.avgScore * stat.count), 0) / 
        contentStats.reduce((sum, stat) => sum + stat.count, 0)) * 100) / 100 : 0
    }
  }, {
    headers: corsHeaders()
  });
}