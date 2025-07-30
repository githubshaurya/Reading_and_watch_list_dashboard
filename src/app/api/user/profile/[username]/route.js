// src\app\api\user\profile\[username]\route.js

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { User } from '@/models/User';
import { ContentItem } from '@/models/ContentItem';
import { Follow } from '@/models/Follow';

export async function GET(request, { params }) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const includeExtensionContent = searchParams.get('includeExtensionContent') === 'true';

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Get session for privacy checks
    const session = await getServerSession(authOptions);

    // Find the user
    const user = await User.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    }).select('_id username profile createdAt isExtensionUser preferences').lean();

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get basic profile stats
    const stats = await getProfileStats(user._id, session);

    // Get recent content (regular website content)
    const recentContent = await getRecentContent(user._id, 5, session);

    // Get extension quality content if user is an extension user
    let extensionContent = null;
    if (user.isExtensionUser && includeExtensionContent) {
      extensionContent = await getExtensionQualityContent(user, session);
    }

    const response = {
      user: {
        id: user._id,
        username: user.username,
        displayName: user.profile?.firstName || user.username,
        bio: user.profile?.bio,
        avatar: user.profile?.avatar,
        joinedAt: user.createdAt,
        isExtensionUser: user.isExtensionUser
      },
      stats,
      recentContent,
      extensionContent,
      isOwnProfile: session?.user?.id === user._id.toString()
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getProfileStats(userId, session) {
  const isOwnProfile = session?.user?.id === userId.toString();

  // Get content count
  const contentCount = await ContentItem.countDocuments({
    userId: userId,
    ...(isOwnProfile ? {} : { status: { $ne: 'deleted' } })
  });

  // Get total likes
  const likesResult = await ContentItem.aggregate([
    {
      $match: {
        userId: userId,
        ...(isOwnProfile ? {} : { status: { $ne: 'deleted' } })
      }
    },
    { $group: { _id: null, total: { $sum: '$likes' } } }
  ]);

  // Get follow counts
  const followingCount = await Follow.countDocuments({ follower: userId });
  const followersCount = await Follow.countDocuments({ following: userId });

  return {
    contentCount,
    totalLikes: likesResult[0]?.total || 0,
    followingCount,
    followersCount
  };
}

async function getRecentContent(userId, limit, session) {
  const isOwnProfile = session?.user?.id === userId.toString();

  return await ContentItem.find({
    userId: userId,
    ...(isOwnProfile ? {} : { status: { $ne: 'deleted' } })
  })
    .populate('userId', 'username profile.firstName profile.lastName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

async function getExtensionQualityContent(user, session) {
  try {
    console.log('Fetching extension content for user:', user._id);
    
    // Get user's quality threshold (default to 0.6 to match extension default)
    const qualityThreshold = user.preferences?.qualityThreshold || 0.6;
    const isOwnProfile = session?.user?.id === user._id.toString();

    // More flexible query - don't require specific status
    const baseQuery = {
      userId: user._id,
      // Remove strict status requirement - extension might save with different statuses
      $or: [
        { status: 'active' },
        { status: { $exists: false } },
        { status: null }
      ]
    };

    // First, let's check what extension content exists
    const allExtensionContent = await ContentItem.find({
      ...baseQuery,
      $or: [
        { 'extensionData': { $exists: true, $ne: null } },
        { 'extensionData.score': { $exists: true } },
        // Also check for alternative field names the extension might use
        { 'extension': { $exists: true } },
        { 'qualityScore': { $exists: true } },
        { 'analysis': { $exists: true } }
      ]
    }).lean();

    console.log('Found extension content items:', allExtensionContent.length);

    // Build quality query with multiple score field options
    const qualityQuery = {
      ...baseQuery,
      $or: [
        { 'extensionData.score': { $gte: qualityThreshold } },
        { 'extension.score': { $gte: qualityThreshold } },
        { 'analysis.score': { $gte: qualityThreshold } },
        { 'qualityScore': { $gte: qualityThreshold } },
        // Also check percentage format (70-100 instead of 0.7-1.0)
        { 'extensionData.score': { $gte: qualityThreshold * 100 } },
        { 'extension.score': { $gte: qualityThreshold * 100 } }
      ]
    };

    // Get quality content with flexible field selection
    const qualityContent = await ContentItem.find(qualityQuery)
      .sort({ 
        $or: [
          { 'extensionData.score': -1 },
          { 'extension.score': -1 },
          { 'analysis.score': -1 }
        ],
        createdAt: -1 
      })
      .limit(20)
      .select('title url summary likes createdAt extensionData extension analysis qualityScore metadata')
      .lean();

    console.log('Found quality content items:', qualityContent.length);

    // Get content type distribution with flexible field names
    const contentTypeStats = await ContentItem.aggregate([
      { $match: qualityQuery },
      {
        $addFields: {
          contentType: {
            $ifNull: [
              '$extensionData.contentType',
              { $ifNull: ['$extension.contentType', '$analysis.contentType'] }
            ]
          }
        }
      },
      {
        $group: {
          _id: '$contentType',
          count: { $sum: 1 },
          avgScore: { 
            $avg: {
              $ifNull: [
                '$extensionData.score',
                { $ifNull: ['$extension.score', '$analysis.score'] }
              ]
            }
          },
          totalLikes: { $sum: '$likes' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get top domains
    const topDomains = await ContentItem.aggregate([
      { $match: qualityQuery },
      {
        $addFields: {
          domain: {
            $ifNull: ['$metadata.domain', { $literal: 'unknown' }]
          },
          score: {
            $ifNull: [
              '$extensionData.score',
              { $ifNull: ['$extension.score', '$analysis.score'] }
            ]
          }
        }
      },
      {
        $group: {
          _id: '$domain',
          count: { $sum: 1 },
          avgScore: { $avg: '$score' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get quality score distribution
    const scoreDistribution = await ContentItem.aggregate([
      { $match: qualityQuery },
      {
        $addFields: {
          score: {
            $ifNull: [
              '$extensionData.score',
              { $ifNull: ['$extension.score', '$analysis.score'] }
            ]
          }
        }
      },
      {
        $bucket: {
          groupBy: '$score',
          boundaries: [0.6, 0.7, 0.8, 0.9, 1.0],
          default: 'high',
          output: {
            count: { $sum: 1 },
            avgLikes: { $avg: '$likes' }
          }
        }
      }
    ]);

    // Transform the data with fallback field handling
    const transformedItems = qualityContent.map(item => {
      // Get score from any available field
      const score = item.extensionData?.score || 
                   item.extension?.score || 
                   item.analysis?.score || 
                   item.qualityScore || 0;

      // Get content type from any available field
      const contentType = item.extensionData?.contentType || 
                         item.extension?.contentType || 
                         item.analysis?.contentType || 
                         'article';

      return {
        _id: item._id,
        title: item.title,
        url: item.url,
        summary: item.summary,
        likes: item.likes,
        createdAt: item.createdAt,
        qualityScore: Math.round((score > 1 ? score : score * 100)),
        contentType: contentType,
        domain: item.metadata?.domain || extractDomain(item.url)
      };
    });

    return {
      threshold: Math.round(qualityThreshold * 100),
      totalQualityItems: transformedItems.length,
      items: transformedItems,
      debug: {
        totalExtensionItems: allExtensionContent.length,
        qualityItems: qualityContent.length,
        thresholdUsed: qualityThreshold
      },
      stats: {
        contentTypes: contentTypeStats.map(stat => ({
          type: stat._id || 'unknown',
          count: stat.count,
          avgScore: Math.round((stat.avgScore || 0) * (stat.avgScore > 1 ? 1 : 100)),
          totalLikes: stat.totalLikes
        })),
        topDomains: topDomains.map(domain => ({
          domain: domain._id || 'unknown',
          count: domain.count,
          avgScore: Math.round((domain.avgScore || 0) * (domain.avgScore > 1 ? 1 : 100))
        })),
        scoreDistribution: scoreDistribution.map(bucket => ({
          range: bucket._id === 'high' ? '100%+' :
                bucket._id === 0.6 ? '60-70%' :
                bucket._id === 0.7 ? '70-80%' :
                bucket._id === 0.8 ? '80-90%' :
                bucket._id === 0.9 ? '90-100%' :
                'Other',
          count: bucket.count,
          avgLikes: Math.round(bucket.avgLikes || 0)
        }))
      }
    };
  } catch (error) {
    console.error('Error fetching extension quality content:', error);
    return {
      error: 'Failed to load extension content',
      threshold: 60,
      totalQualityItems: 0,
      items: [],
      debug: { error: error.message },
      stats: {
        contentTypes: [],
        topDomains: [],
        scoreDistribution: []
      }
    };
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return 'unknown';
  }
}
