
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import { Follow } from '../../../models/Follow';
import { User } from '../../../models/User';
import { connectDB } from '../../../lib/db';

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { followeeId } = await request.json();
    
    if (!followeeId) {
      return NextResponse.json(
        { error: 'followeeId is required' },
        { status: 400 }
      );
    }

    // Validate MongoDB ObjectId format
    if (!/^[a-fA-F0-9]{24}$/.test(followeeId)) {
      return NextResponse.json(
        { error: 'Invalid followeeId format' },
        { status: 400 }
      );
    }

    // Prevent self-following
    if (session.user.id === followeeId) {
      return NextResponse.json(
        { error: 'Cannot follow yourself' },
        { status: 400 }
      );
    }

    // Check if target user exists
    const targetUser = await User.findById(followeeId);
    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if already following
    const existingFollow = await Follow.findOne({ 
      followerId: session.user.id, 
      followeeId 
    });

    if (existingFollow) {
      return NextResponse.json(
        { error: 'Already following this user' },
        { status: 400 }
      );
    }

    // Create follow relationship
    await Follow.create({ 
      followerId: session.user.id, 
      followeeId 
    });

    return NextResponse.json(
      { message: 'User followed successfully' },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error following user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { followeeId } = await request.json();
    
    if (!followeeId) {
      return NextResponse.json(
        { error: 'followeeId is required' },
        { status: 400 }
      );
    }

    // Validate MongoDB ObjectId format
    if (!/^[a-fA-F0-9]{24}$/.test(followeeId)) {
      return NextResponse.json(
        { error: 'Invalid followeeId format' },
        { status: 400 }
      );
    }

    // Remove follow relationship
    const result = await Follow.deleteOne({ 
      followerId: session.user.id, 
      followeeId 
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Follow relationship not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'User unfollowed successfully' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error unfollowing user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}