// app/api/extension/content/route.js - Enhanced for better content saving
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { connectDB } from '../../../../lib/db';
import { ContentItem } from '../../../../models/ContentItem';
import { User } from '../../../../models/User';

const ALLOWED_ORIGIN = 'http://localhost:3000';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request) {
  try {
    // Verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
    
    const { 
      title, 
      url, 
      content, 
      type, 
      score, 
      summary, 
      qualified, 
      model, 
      analysisMethod,
      analyzedAt 
    } = await request.json();

    const model = 'llama3.2-vision';

    // Only save if marked as qualified by extension
    if (!qualified) {
      return NextResponse.json({
        success: false,
        message: 'Content not qualified',
        score: score || 0
      }, {
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    await connectDB();

    // Check if content already exists
    const existing = await ContentItem.findOne({
      userId: decoded.userId,
      url
    });

    if (existing) {
      // Update score if new analysis is better
      if (score && score > (existing.extensionData?.score * 100 || 0)) {
        await ContentItem.findByIdAndUpdate(existing._id, {
          'extensionData.score': score / 100,
          'extensionData.model': model,
          'extensionData.analysisMethod': analysisMethod,
          'extensionData.lastAnalyzed': new Date(analyzedAt)
        });
        
        return NextResponse.json({
          success: true,
          action: 'updated_score',
          contentId: existing._id,
          newScore: score
        }, {
          headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        });
      }

      return NextResponse.json({
        success: true,
        action: 'already_exists',
        contentId: existing._id
      }, {
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    // Create new qualified content item
    const contentItem = new ContentItem({
      userId: decoded.userId,
      title: title?.substring(0, 200) || 'Untitled',
      url,
      content: content?.substring(0, 2000) || '',
      summary: summary?.substring(0, 500) || title?.substring(0, 150) || '',
      source: 'extension',
      status: 'active',
      isPublic: true, // Qualified content is public
      extensionData: {
        contentType: type || 'article',
        score: (score || 50) / 100, // Store as decimal
        summary: summary || '',
        qualified: true,
        model: model || 'unknown',
        analysisMethod: analysisMethod || 'unknown',
        analyzedAt: new Date(analyzedAt || Date.now()),
        lastAnalyzed: new Date()
      },
      metadata: {
        domain: extractDomain(url),
        readingTime: Math.ceil((content?.length || 0) / 200),
        wordCount: (content?.split(' ') || []).length
      },
      createdAt: new Date(),
      lastViewed: new Date()
    });

    await contentItem.save();

    // Update user stats
    const updateQuery = {
      $inc: {
        'stats.totalContent': 1,
        'stats.qualifiedContent': 1
      },
      lastActivity: new Date()
    };

    // Increment specific content type counter
    if (type) {
      updateQuery.$inc[`stats.${type}Count`] = 1;
    }

    await User.findByIdAndUpdate(decoded.userId, updateQuery);

    return NextResponse.json({
      success: true,
      contentId: contentItem._id,
      action: 'saved_qualified',
      score: score,
      title: title,
      message: `Content saved with ${score}/100 quality score`
    }, {
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });

  } catch (error) {
    console.error('Extension content API error:', error);
    
    // More specific error handling
    let status = 500;
    let message = 'Server error';
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      status = 401;
      message = 'Invalid or expired token';
    } else if (error.name === 'ValidationError') {
      status = 400;
      message = 'Invalid content data';
    }
    
    return NextResponse.json({ 
      error: message,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, {
      status,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });
  }
}

// Helper function to extract domain from URL
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}