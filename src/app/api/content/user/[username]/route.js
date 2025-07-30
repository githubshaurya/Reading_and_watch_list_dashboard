// src\app\api\content\user\[username]\route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../../lib/db';
import { ContentItem } from '../../../../../models/ContentItem';
import { User } from '../../../../../models/User';

export async function GET(request, { params }) {
  try {
    await connectDB();
    
    const { username } = await params;
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const includeExtension = url.searchParams.get('includeExtension') === 'true';

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Find user by username
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    }).select('_id username preferences').lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log(`🔍 Found user: ${user.username} (ID: ${user._id})`);

    // IMPROVED: Build query for user's content - include all content types
    const query = { 
      userId: user._id, 
      status: 'active' 
    };

    console.log(`🔍 Query for content:`, query);

    // If including extension content, also fetch extension-specific content
    if (includeExtension) {
      console.log('🔍 Fetching content including extension data for user:', user._id);
    }

    // Find all content for the user, sorted by createdAt DESC
    const allItems = await ContentItem.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'username profile.firstName profile.lastName')
      .lean();

    // Deduplicate by URL: keep the latest post for each URL (by createdAt)
    const urlMap = new Map();
    for (const item of allItems) {
      const existing = urlMap.get(item.url);
      if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) {
        urlMap.set(item.url, item);
      }
    }
    const items = Array.from(urlMap.values());

    const total = items.length;

    // Use the highest score from all possible sources (0-100 scale)
    function getBestScore(item) {
      const scores = [
        item.qualityScore,
        item.extensionData?.score,
        item.extensionData?.analysisData?.score
      ].filter(s => typeof s === 'number' && s > 0);
      return scores.length > 0 ? Math.max(...scores) : 0;
    }

    // Qualified: any post with a qualityScore above threshold (0-100 scale)
    let threshold;
    if (user.preferences && typeof user.preferences.qualityThreshold === 'number') {
      threshold = user.preferences.qualityThreshold > 1 ? user.preferences.qualityThreshold : Math.round(user.preferences.qualityThreshold * 100);
    } else {
      // Use extension's default threshold (55) if not set in database
      threshold = 55;
      console.log(`[QUALIFIED DEBUG] No threshold set in database, using extension default: ${threshold}`);
    }
    const qualifiedItems = items.filter(item => {
      const score = getBestScore(item);
      const isQualified = score > threshold;
      console.log(`[QUALIFIED DEBUG] Title: ${item.title} | qualityScore: ${item.qualityScore} | extensionData.score: ${item.extensionData?.score} | BestScore: ${score} | Threshold: ${threshold} | Qualified: ${isQualified}`);
      return isQualified;
    });

    // Transform items for API response
    const transformedItems = items.map(item => {
      const bestScore = getBestScore(item);
      const hasExtensionData = item.hasExtensionData || item.extensionData?.hasExtensionData || false;
      return {
        _id: item._id,
        title: item.title,
        url: item.url,
        summary: item.summary,
        likes: item.likes || 0,
        createdAt: item.createdAt,
        isFromExtension: item.isFromExtension || !!item.extensionData,
        isQualified: item.isQualified || false,
        qualityScore: bestScore,
        extensionScore: item.extensionData?.score,
        extensionData: item.extensionData || null,
        metadata: item.metadata || {},
        author: {
          _id: item.userId._id,
          username: item.userId.username,
          profile: item.userId.profile
        },
        hasExtensionData
      };
    });

    // Map qualifiedItems to transformedItems
    const qualifiedTransformed = qualifiedItems.map(q => transformedItems.find(t => t._id.toString() === q._id.toString()));

    return NextResponse.json({
      items: transformedItems, // all deduplicated posts
      qualifiedItems: qualifiedTransformed,
      hasMore: page * limit < total,
      total,
      page,
      limit,
      user: {
        id: user._id,
        username: user.username
      },
      stats: {
        total: transformedItems.length,
        qualified: qualifiedTransformed.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}