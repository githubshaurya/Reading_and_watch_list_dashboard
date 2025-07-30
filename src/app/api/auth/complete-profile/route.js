import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../[...nextauth]/route';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

export async function POST(req) {
  try {
    // Get session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { username, dob } = body;

    // Validate required fields
    if (!username || !dob) {
      return NextResponse.json(
        { error: 'Username and date of birth are required' }, 
        { status: 400 }
      );
    }

    // Validate username format
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return NextResponse.json(
        { error: 'Username must be between 3 and 20 characters' }, 
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return NextResponse.json(
        { error: 'Username can only contain letters, numbers, and underscores' }, 
        { status: 400 }
      );
    }

    // Validate age (must be at least 13)
    const birthDate = new Date(dob);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) 
      ? age - 1 
      : age;

    if (actualAge < 13) {
      return NextResponse.json(
        { error: 'You must be at least 13 years old to create an account' }, 
        { status: 400 }
      );
    }

    // Connect to database
    await connectDB();

    // Check if username is already taken (excluding current user)
    const existingUser = await User.findOne({ 
      username: trimmedUsername,
      _id: { $ne: session.user.id }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username is already taken' }, 
        { status: 409 }
      );
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      session.user.id,
      {
        username: trimmedUsername,
        dob: new Date(dob),
        isNewUser: false,
        profileCompleted: true,
        updatedAt: new Date()
      },
      { 
        new: true,
        runValidators: true 
      }
    );

    if (!updatedUser) {
      return NextResponse.json(
        { error: 'User not found' }, 
        { status: 404 }
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Profile completed successfully',
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        profileCompleted: updatedUser.profileCompleted
      }
    });

  } catch (error) {
    console.error('Complete profile API error:', error);
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'Username is already taken' }, 
        { status: 409 }
      );
    }

    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { error: 'Invalid data provided' }, 
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}