// src/app/api/profile/[username]/route.js - NEW FILE
import { NextResponse } from 'next/server';
import { ContentItem } from '../../../../models/ContentItem';
import { User } from '../../../../models/User';
import { connectDB } from '../../../../lib/db';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { username } = params;
    
    // Find user by username
    const user = await User.findOne({ username }).lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get post counts
    const counts = await ContentItem.getUserPostCounts(user._id);
    
    // Get qualified posts (for quality_posts section)
    const qualifiedPosts = await ContentItem.getUserQualifiedPosts(user._id, 20);
    
    // Get all posts (for posts section)  
    const allPosts = await ContentItem.getUserAllPosts(user._id, 20);

    return NextResponse.json({
      user: {
        username: user.username,
        profile: user.profile
      },
      stats: {
        totalPosts: counts.total,
        qualifiedPosts: counts.qualified
      },
      qualifiedPosts: qualifiedPosts.map(post => ({
        ...post,
        _id: post._id.toString()
      })),
      allPosts: allPosts.map(post => ({
        ...post,
        _id: post._id.toString()
      }))
    });
    
  } catch (error) {
    console.error('Profile API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}