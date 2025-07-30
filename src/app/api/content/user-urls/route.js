import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { ContentItem } from '../../../../models/ContentItem';
import { connectDB } from '../../../../lib/db';

export async function GET(request) {
  try {
    await connectDB();
    
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get all URLs that the user has saved (both regular and extension content)
    const userContent = await ContentItem.find({ 
      userId: userId,
      status: 'active'
    }).select('url').lean();

    const urls = userContent.map(item => item.url);

    console.log(`Found ${urls.length} saved URLs for user ${userId}`);

    return NextResponse.json({
      urls: urls,
      count: urls.length
    });

  } catch (error) {
    console.error('Error fetching user URLs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 