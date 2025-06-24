// src\app\api\user\[userId]\following\route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { Follow } from '../../../../../models/Follow';
import { User } from '../../../../../models/User';
import { connectDB } from '../../../../../lib/db';

export async function GET(request, { params }) {
  try {
    await connectDB();
    
    const { userId } = await params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Validate userId format
    if (!/^[a-fA-F0-9]{24}$/.test(userId)) {
      return NextResponse.json(
        { error: 'Invalid user ID format' },
        { status: 400 }
      );
    }

    // Check if user exists
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get URL parameters for pagination
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    const skip = (page - 1) * limit;

    // Fetch following with pagination
    const [following, totalCount] = await Promise.all([
      Follow.find({ followerId: userId })
        .populate('followeeId', 'username profile.firstName profile.lastName profile.avatar createdAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      Follow.countDocuments({ followerId: userId })
    ]);
    
    return NextResponse.json({
      following,
      count: totalCount,
      page,
      hasMore: skip + following.length < totalCount,
      totalPages: Math.ceil(totalCount / limit)
    });

  } catch (error) {
    console.error('Error fetching following:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}