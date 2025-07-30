import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import { User } from '../../../../models/User';

export async function POST(request) {
  try {
    await connectDB();
    const { extensionUserId, preferences } = await request.json();
    
    const user = await User.findOne({ extensionUserId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user preferences
    Object.keys(preferences).forEach(key => {
      user.preferences[key] = preferences[key];
    });
    
    await user.save();
    
    return NextResponse.json({ 
      success: true, 
      preferences: user.preferences 
    });
  } catch (error) {
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}