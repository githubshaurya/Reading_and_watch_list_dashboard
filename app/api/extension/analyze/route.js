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

    const { title, content, url, type, contentType, wordCount, mediaCount, qualityIndicators, platformInfo, analysisContext } = await request.json();

    // Try different models based on available memory
    const models = ['llama3.2-vision', 'llama3.2', 'llama2', 'mistral'];
    let model = 'llama3.2-vision';
    let lastError = null;

    for (const modelName of models) {
      try {
        console.log(`Trying model: ${modelName}`);
        
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            prompt: `You are an expert content quality analyst. Analyze the following content and rate its overall quality from 0-1.

CONTENT TO ANALYZE:
Title: ${title}
URL: ${url}
Content Type: ${type} (already determined)
Word Count: ${wordCount || 'Unknown'}
Content Length: ${content ? content.length : 0} characters

MEDIA CONTEXT:
Images: ${mediaCount?.images || 0}
Videos: ${mediaCount?.videos || 0}
Has Mixed Content: ${analysisContext?.isMixedContent ? 'Yes' : 'No'}

QUALITY INDICATORS:
Has Title: ${qualityIndicators?.hasTitle ? 'Yes' : 'No'}
Title Length: ${qualityIndicators?.titleLength || 0}
Content Length: ${qualityIndicators?.contentLength || 0}
Is Long Form: ${qualityIndicators?.isLongForm ? 'Yes' : 'No'}
Is Short Form: ${qualityIndicators?.isShortForm ? 'Yes' : 'No'}
Has Code Blocks: ${qualityIndicators?.hasCodeBlocks ? 'Yes' : 'No'}
Has Technical Terms: ${qualityIndicators?.hasTechnicalTerms ? 'Yes' : 'No'}
Has Research Terms: ${qualityIndicators?.hasResearchTerms ? 'Yes' : 'No'}
Has Educational Terms: ${qualityIndicators?.hasEducationalTerms ? 'Yes' : 'No'}

CONTENT TEXT:
${content ? content.substring(0, 2000) : 'No content provided'}

ANALYSIS INSTRUCTIONS:
Focus on analyzing the QUALITY of this ${type} content. Consider:
1. Content depth and insightfulness
2. Credibility and authority of the source
3. Uniqueness and originality of the information
4. Practical value and usefulness
5. Clarity and structure
6. Engagement potential
7. Appropriateness for the content type (${type})

Rate the overall quality from 0-1 where:
- 0.9-1.0: Exceptional, must-read content
- 0.8-0.89: Very high quality, highly recommended
- 0.7-0.79: Good quality, worth reading
- 0.6-0.69: Decent quality, some value
- 0.5-0.59: Average quality, mixed value
- 0.4-0.49: Below average, limited value
- 0.3-0.39: Poor quality, not recommended
- 0.0-0.29: Very poor quality, avoid

Respond with JSON only:
{
  "score": 0.75,
  "summary": "2-3 sentence analysis explaining the content's quality and why it received this score",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "tech|science|business|entertainment|education|news|other",
  "reasoning": "Brief explanation of your quality assessment"
}`,
            stream: false,
            options: {
              temperature: 0.3,
              top_p: 0.9,
              top_k: 40
            }
          }),
          signal: AbortSignal.timeout(3000000) // 30 second timeout for model loading
        });

        if (response.ok) {
          const result = await response.json();
          let analysis;
          
          try {
            // Try to extract JSON from response (LLM might add extra text)
            const jsonMatch = result.response.match(/\{[^}]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : result.response;
            analysis = JSON.parse(jsonStr);
          } catch (parseError) {
            console.error('Failed to parse LLM response:', parseError, result.response);
            throw new Error('Invalid LLM response format');
          }
          
          console.log(`Successfully used model: ${modelName}`);
          
          return NextResponse.json({
            success: true,
            analysis: {
              score: Math.min(Math.max(analysis.score || 0.5, 0), 1),
              summary: analysis.summary || title,
              tags: (analysis.tags || []).slice(0, 5),
              category: analysis.category || 'general',
              reasoning: analysis.reasoning || 'Analysis completed',
              modelUsed: modelName
            }
          }, {
            headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
          });
        } else {
          const errorText = await response.text();
          lastError = `Model ${modelName} failed: ${response.status} - ${errorText}`;
          console.log(`Model ${modelName} failed, trying next...`);
          continue;
        }
      } catch (error) {
        lastError = `Model ${modelName} error: ${error.message}`;
        console.log(`Model ${modelName} error, trying next...`);
        continue;
      }
    }

    // If all models failed, throw error
    throw new Error(`All LLM models failed. Last error: ${lastError}`);

  } catch (error) {
    console.error('Extension analyze API error:', error);
    return NextResponse.json({ 
      error: 'Analysis failed', 
      details: error.message 
    }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
    });
  }
}