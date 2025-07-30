// app/api/user/settings/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route'; // adjust path as needed
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      username,
      email,
      firstName,
      lastName,
      bio,
      avatar,
      theme,
      emailNotifications,
      contentNotifications,
      qualityThreshold
    } = body;

    // Basic validation - only require username/email if they're being updated
    if (username !== undefined && !username) {
      return NextResponse.json(
        { error: 'Username is required when provided' },
        { status: 400 }
      );
    }
    
    if (email !== undefined && !email) {
      return NextResponse.json(
        { error: 'Email is required when provided' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Username validation (alphanumeric + underscore, 3-30 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3-30 characters and contain only letters, numbers, and underscores' },
        { status: 400 }
      );
    }

    await connectDB();

    // Get current user data to show before/after values
    const currentUser = await User.findById(session.user.id).select('preferences.qualityThreshold').lean();
    console.log('[SETTINGS DEBUG] 📊 Current threshold in DB before update:', currentUser?.preferences?.qualityThreshold);

    // Check if username is taken by another user (only if username is being updated)
    if (username !== undefined) {
      const existingUser = await User.findOne({ 
        username, 
        _id: { $ne: session.user.id } 
      });
      
      if (existingUser) {
        return NextResponse.json(
          { error: 'Username is already taken' },
          { status: 400 }
        );
      }
    }

    // Check if email is taken by another user (only if email is being updated)
    if (email !== undefined) {
      const existingEmail = await User.findOne({ 
        email, 
        _id: { $ne: session.user.id } 
      });
      
      if (existingEmail) {
        return NextResponse.json(
          { error: 'Email is already in use' },
          { status: 400 }
        );
      }
    }

    // Update user in database - only include fields that are provided
    const updateFields = {
      updatedAt: new Date()
    };
    
    if (username !== undefined) updateFields.username = username;
    if (email !== undefined) updateFields.email = email;
    if (firstName !== undefined) updateFields['profile.firstName'] = firstName || '';
    if (lastName !== undefined) updateFields['profile.lastName'] = lastName || '';
    if (bio !== undefined) updateFields['profile.bio'] = bio || '';
    if (avatar !== undefined) updateFields['profile.avatar'] = avatar || '';
    if (theme !== undefined) updateFields['preferences.theme'] = theme || 'system';
    if (emailNotifications !== undefined) updateFields['preferences.emailNotifications'] = emailNotifications;
    if (contentNotifications !== undefined) updateFields['preferences.contentNotifications'] = contentNotifications;
    
    if (typeof qualityThreshold === 'number' && qualityThreshold >= 0 && qualityThreshold <= 100) {
      updateFields['preferences.qualityThreshold'] = qualityThreshold;
      console.log('[SETTINGS DEBUG] 🔄 Received PUT for qualityThreshold:', qualityThreshold);
      console.log('[SETTINGS DEBUG] 📝 Updating user ID:', session.user.id);
    }

    const updatedUser = await User.findByIdAndUpdate(
      session.user.id,
      updateFields,
      { 
        new: true,
        runValidators: true,
        upsert: false
      }
    ).select('-password'); // Exclude password from response

    if (!updatedUser) {
      console.log('[SETTINGS DEBUG] ❌ User not found or not updated for threshold:', qualityThreshold);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    console.log('[SETTINGS DEBUG] ✅ Updated user threshold to:', updatedUser.preferences?.qualityThreshold);
    console.log('[SETTINGS DEBUG] 📊 Before update - old threshold was:', currentUser?.preferences?.qualityThreshold);
    console.log('[SETTINGS DEBUG] 📊 After update - new threshold is:', updatedUser.preferences?.qualityThreshold);

    return NextResponse.json({
      message: 'Settings updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Settings update error:', error);
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return NextResponse.json(
        { error: `${field.charAt(0).toUpperCase() + field.slice(1)} is already taken` },
        { status: 400 }
      );
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { error: messages.join(', ') },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();
    
    // Fetch user data from database
    const user = await User.findById(session.user.id)
      .select('-password')
      .lean();

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Ensure all fields have default values for the frontend
    const userData = {
      id: user._id,
      username: user.username || '',
      email: user.email || '',
      profile: {
        firstName: user.profile?.firstName || '',
        lastName: user.profile?.lastName || '',
        bio: user.profile?.bio || '',
        avatar: user.profile?.avatar || ''
      },
      preferences: {
        theme: user.preferences?.theme || 'system',
        emailNotifications: user.preferences?.emailNotifications !== undefined ? user.preferences.emailNotifications : true,
        contentNotifications: user.preferences?.contentNotifications !== undefined ? user.preferences.contentNotifications : true,
        qualityThreshold: user.preferences?.qualityThreshold
      }
    };

    return NextResponse.json({ user: userData });

  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}