import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

export async function GET(request) {
  await connectDB();
  
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);

  if (!query || query.length < 1) {
    return NextResponse.json([]);
  }

  try {
    // Search users by username or name
    const searchRegex = new RegExp(query, 'i');
    
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { 'profile.firstName': searchRegex },
        { 'profile.lastName': searchRegex }
      ],
      status: 'active' // Only search active users
    })
    .select('username profile.firstName profile.lastName profile.avatar')
    .limit(Math.min(limit, 20)) // Max 20 results
    .lean();

    return NextResponse.json(users);

  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}