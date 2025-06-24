// app/api/extension/settings/route.js
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../../../../lib/mongodb';
import {User} from '../../../../models/User';

const ALLOWED_ORIGIN = 'http://localhost:3000';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

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

    await connectToDatabase();
    const user = await User.findById(decoded.userId).select('settings');

    const defaultSettings = {
      autoTrack: true,
      minReadTime: 30,
      minVideoTime: 60,
      qualityThreshold: 0.6,
      excludeDomains: ['gmail.com', 'calendar.google.com', 'docs.google.com'],
      trackingEnabled: true,
      qualityOnly: true
    };

    const extensionSettings = { ...defaultSettings, ...user.settings.extension };

    return NextResponse.json({
      success: true,
      settings: extensionSettings
    }, {
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });

  } catch (error) {
    console.error('Extension settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });
  }
}

export async function POST(request) {
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

    const settings = await request.json();

    await connectToDatabase();
    await User.findByIdAndUpdate(decoded.userId, {
      $set: {
        'settings.extension': settings,
        'settings.lastExtensionUpdate': new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully'
    }, {
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });

  } catch (error) {
    console.error('Extension settings POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });
  }
}