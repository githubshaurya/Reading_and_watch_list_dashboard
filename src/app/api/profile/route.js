import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import { connectDB } from '../../../lib/db';
import { ContentItem } from '../../../models/ContentItem';

export async function GET(request) {
  try {
    // 1. Ensure DB is connected
    await connectDB();

    // 2. Get the current user session
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 3. Fetch all ContentItem documents saved by this user (newest first)
    const posts = await ContentItem
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    // 4. Return them
    return NextResponse.json({ success: true, posts });
  } catch (error) {
    console.error('Error fetching profile posts:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}