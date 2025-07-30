// File: app/api/extension/auth/route.js

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { connectDB } from '../../../../lib/db';;
import {User} from '../../../../models/User';
import jwt from 'jsonwebtoken'; // Install with: npm install jsonwebtoken

const ALLOWED_ORIGIN = 'http://localhost:3000';

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// POST: issue extension token
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    await connectDB();
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    // Generate extension token
    const extensionToken = jwt.sign(
      {
        userId: session.user.id,
        email: session.user.email,
        username: user.username,
        type: 'extension',
      },
      process.env.NEXTAUTH_SECRET,
      { expiresIn: '30d' }
    );

    // Update user's last extension connection
    await User.findByIdAndUpdate(session.user.id, {
      lastExtensionConnect: new Date(),
      'settings.extensionEnabled': true,
    });

    return NextResponse.json({
      success: true,
      token: extensionToken,
      user: {
        id: session.user.id,
        email: session.user.email,
        username: user.username,
        avatar: user.avatar,
      }
    }, {
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });

  } catch (error) {
    console.error('Extension auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });
  }
}

// GET: validate extension token
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
    if (decoded.type !== 'extension') {
      return NextResponse.json({ error: 'Invalid token type' }, {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    await connectDB();
    const user = await User.findById(decoded.userId).select('username email avatar settings');
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    return NextResponse.json({
      valid: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        username: user.username,
        avatar: user.avatar,
        settings: user.settings,
      }
    }, {
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });

  } catch (error) {
    const status = (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') ? 401 : 500;
    const msg = status === 401 ? 'Invalid or expired token' : 'Internal server error';
    console.error('Token validation error:', error);
    return NextResponse.json({ error: msg }, {
      status,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });
  }
}

// DELETE: revoke extension access
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    await connectDB();
    await User.findByIdAndUpdate(session.user.id, {
      'settings.extensionEnabled': false,
      lastExtensionDisconnect: new Date(),
    });

    return NextResponse.json({ success: true, message: 'Extension access revoked' }, {
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });

  } catch (error) {
    console.error('Extension revoke error:', error);
    return NextResponse.json({ error: 'Internal server error' }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });
  }
}
