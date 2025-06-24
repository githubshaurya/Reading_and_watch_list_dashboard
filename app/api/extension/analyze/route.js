// app/api/extension/analyze/route.js
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      });
    }

    const token = authHeader.slice(7);
    jwt.verify(token, process.env.NEXTAUTH_SECRET);

    const { title, content, url, type } = await request.json();

    try {
      // Try local LLM first (Ollama)
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2:1b',
          prompt: `Analyze this ${type} for quality and relevance. Rate 0-1 where 1 is excellent quality.

Title: ${title}
Content: ${content.substring(0, 1000)}
URL: ${url}

Respond with JSON only:
{
  "score": 0.8,
  "summary": "Brief 2-3 sentence summary",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "tech|science|business|entertainment|education|news|other"
}`,
          stream: false
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (response.ok) {
        const result = await response.json();
        const analysis = JSON.parse(result.response);
        
        return NextResponse.json({
          success: true,
          analysis: {
            score: Math.min(Math.max(analysis.score || 0.5, 0), 1),
            summary: analysis.summary || title,
            tags: (analysis.tags || []).slice(0, 5),
            category: analysis.category || 'general'
          }
        }, {
          headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        });
      }
    } catch (llmError) {
      console.log('Local LLM unavailable, using fallback analysis');
    }

    // Fallback analysis
    const fallbackAnalysis = {
      score: calculateFallbackScore(title, content, url),
      summary: generateFallbackSummary(title, content),
      tags: extractFallbackTags(title, content),
      category: categorizeFallback(title, content, url)
    };

    return NextResponse.json({
      success: true,
      analysis: fallbackAnalysis,
      fallback: true
    }, {
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });

  } catch (error) {
    console.error('Extension analyze API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });
  }
}

function calculateFallbackScore(title, content, url) {
  let score = 0.5;
  
  // Quality indicators
  if (content.length > 1000) score += 0.1;
  if (title.length > 20 && title.length < 100) score += 0.1;
  if (!url.includes('ads') && !url.includes('popup')) score += 0.1;
  
  // Known quality domains
  const qualityDomains = ['medium.com', 'substack.com', 'wikipedia.org', 'github.com', 'stackoverflow.com'];
  if (qualityDomains.some(domain => url.includes(domain))) score += 0.15;
  
  return Math.min(score, 1);
}

function generateFallbackSummary(title, content) {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
  return sentences.slice(0, 2).join('. ').trim() || title;
}

function extractFallbackTags(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  const commonTags = {
    'javascript': ['javascript', 'js', 'node'],
    'python': ['python', 'django', 'flask'],
    'react': ['react', 'jsx', 'component'],
    'ai': ['ai', 'artificial intelligence', 'machine learning', 'ml'],
    'web': ['web', 'html', 'css', 'frontend'],
    'backend': ['backend', 'api', 'server'],
    'startup': ['startup', 'entrepreneur', 'business'],
    'science': ['research', 'study', 'experiment']
  };
  
  const tags = [];
  Object.entries(commonTags).forEach(([tag, keywords]) => {
    if (keywords.some(keyword => text.includes(keyword))) {
      tags.push(tag);
    }
  });
  
  return tags.slice(0, 3);
}

function categorizeFallback(title, content, url) {
  const text = (title + ' ' + content + ' ' + url).toLowerCase();
  
  const categories = {
    'tech': ['code', 'programming', 'software', 'tech', 'development'],
    'science': ['research', 'study', 'science', 'experiment', 'data'],
    'business': ['business', 'startup', 'entrepreneur', 'marketing'],
    'education': ['learn', 'tutorial', 'course', 'education', 'teach'],
    'news': ['news', 'breaking', 'report', 'update']
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }
  
  return 'general';
}