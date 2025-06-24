// src\app\api\content\user\[username]\route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { User } from '@/models/User';
import { ContentItem } from '@/models/ContentItem'
export async function GET(request, { params }) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const skip = (page - 1) * limit;
    
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Get session for privacy checks
    const session = await getServerSession(authOptions);
    
    // First, find the user to get their ID
    const user = await findUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Fetch user's content
    const content = await findUserContent(user.id, skip, limit, session);
    const totalCount = await getUserContentCount(user.id, session);
    
    return NextResponse.json({
      items: content,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching user content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function findUserByUsername(username) {
  try {
    // Validate username format (basic validation)
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return null;
    }

    // Find user by username (case-insensitive)
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    }).select('_id username profile createdAt').lean();
    
    return user;
  } catch (error) {
    console.error('Error finding user by username:', error);
    return null;
  }
}

async function findUserContent(userId, skip, limit, session) {
  // Example query structure:
  const isOwnProfile = session?.user?.id === userId;
  
  // MongoDB with Mongoose:
  return await ContentItem.find({ 
    authorId: userId,
    // Only show published content unless it's the user's own profile
    ...(isOwnProfile ? {} : { status: 'published' })
  })
  .populate('author', 'username profile.firstName profile.lastName profile.avatar')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
}

async function getUserContentCount(userId, session) {
  // Similar to findUserContent but just count
  const isOwnProfile = session?.user?.id === userId;
  
  // MongoDB:
  return await ContentItem.countDocuments({ 
    authorId: userId,
    ...(isOwnProfile ? {} : { status: 'published' })
  });
}