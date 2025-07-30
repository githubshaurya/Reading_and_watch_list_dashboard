// src\app\api\follow\status\route.js

// import { NextResponse } from 'next/server';
// import { getServerSession } from 'next-auth/next';
// import { authOptions } from '../../auth/[...nextauth]/route';
// import { Follow } from '../../../../models/Follow';
// import { connectDB } from '../../../../lib/db';

// export async function GET(req) {
//   await connectDB();
//   const session = await getServerSession(authOptions);
//   if (!session) return NextResponse.json({ following: false });
//   const url = new URL(req.url);
//   const id = url.searchParams.get('followeeId');
//   const valid = typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);
//   if (!valid) return NextResponse.json({ following: false });
//   let exists = false;
//   try {
//     exists = await Follow.exists({ followerId: session.user.id, followeeId: id });
//   } catch { exists = false; }
//   return NextResponse.json({ following: Boolean(exists) });
// }

// import { NextResponse } from 'next/server';
// import { getServerSession } from 'next-auth/next';
// import { authOptions } from '../../auth/[...nextauth]/route';
// import { Follow } from '../../../../models/Follow';
// import { connectDB } from '../../../../lib/db';

// export async function GET(req) {
//   try {
//     await connectDB();
    
//     const session = await getServerSession(authOptions);
//     if (!session) {
//       return NextResponse.json({ following: false }, { status: 401 });
//     }

//     const url = new URL(req.url);
//     const followeeId = url.searchParams.get('followeeId');
    
//     // More robust validation
//     if (!followeeId || followeeId === 'undefined' || followeeId === 'null') {
//       return NextResponse.json(
//         { error: 'Valid followeeId is required' }, 
//         { status: 400 }
//       );
//     }

//     // Validate MongoDB ObjectId format
//     const isValidObjectId = /^[a-fA-F0-9]{24}$/.test(followeeId);
//     if (!isValidObjectId) {
//       return NextResponse.json(
//         { error: 'Invalid followeeId format' }, 
//         { status: 400 }
//       );
//     }

//     // Check if user is trying to check their own follow status
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


import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { Follow } from '../../../../models/Follow';
import { connectDB } from '../../../../lib/db';

export async function GET(request) {
  try {
    await connectDB();
    
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ following: false });
    }

    const url = new URL(request.url);
    const followeeId = url.searchParams.get('followeeId');
    
    if (!followeeId || followeeId === 'undefined' || followeeId === 'null') {
      return NextResponse.json(
        { error: 'Valid followeeId is required' }, 
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

    // Return false if checking own follow status
    if (session.user.id === followeeId) {
      return NextResponse.json({ following: false });
    }

    const exists = await Follow.exists({ 
      followerId: session.user.id, 
      followeeId 
    });
    
    return NextResponse.json({ following: Boolean(exists) });
    
  } catch (error) {
    console.error('Error checking follow status:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}