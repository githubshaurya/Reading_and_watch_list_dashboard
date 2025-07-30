// src\app\api\user\[userId]\followers\route.js
// import { NextResponse } from 'next/server';
// import { getServerSession } from 'next-auth/next';
// import { authOptions } from '../../../auth/[...nextauth]/route';
// import { Follow } from '../../../../../models/Follow';
// import { connectDB } from '../../../../../lib/db';

// export async function GET(request) {
//   try {
//     await connectDB();
    
//     const session = await getServerSession(authOptions);
//     if (!session) {
//       return NextResponse.json({ following: false });
//     }

//     const url = new URL(request.url);
//     const followeeId = url.searchParams.get('followeeId');
    
//     if (!followeeId || followeeId === 'undefined' || followeeId === 'null') {
//       return NextResponse.json(
//         { error: 'Valid followeeId is required' }, 
//         { status: 400 }
//       );
//     }

//     // Validate MongoDB ObjectId format
//     if (!/^[a-fA-F0-9]{24}$/.test(followeeId)) {
//       return NextResponse.json(
//         { error: 'Invalid followeeId format' }, 
//         { status: 400 }
//       );
//     }

//     // Return false if checking own follow status
//     if (session.user.id === followeeId) {
//       return NextResponse.json({ following: false });
//     }

//     const exists = await Follow.exists({ 
//       followerId: session.user.id, 
//       followeeId 
//     });
    
//     return NextResponse.json({ following: Boolean(exists) });
    
//   } catch (error) {
//     console.error('Error checking follow status:', error);
//     return NextResponse.json(
//       { error: 'Internal server error' }, 
//       { status: 500 }
//     );
//   }
// }

// src/app/api/user/[userId]/followers/route.js
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

    // Get session for privacy checks (optional)
    const session = await getServerSession(authOptions);
    
    // Get URL parameters for pagination
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    const skip = (page - 1) * limit;

    // Fetch followers with pagination
    const [followers, totalCount] = await Promise.all([
      Follow.find({ followeeId: userId })
        .populate('followerId', 'username profile.firstName profile.lastName profile.avatar createdAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      Follow.countDocuments({ followeeId: userId })
    ]);
    
    return NextResponse.json({
      followers,
      count: totalCount,
      page,
      hasMore: skip + followers.length < totalCount,
      totalPages: Math.ceil(totalCount / limit)
    });

  } catch (error) {
    console.error('Error fetching followers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}