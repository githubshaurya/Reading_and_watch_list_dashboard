// background.js - Fixed version with better duplicate handling
let authToken = null;
let userSettings = { qualityThreshold: 55 };
let lastAnalysis = null;
let currentModel = 'llama3.2-vision';
let autoAnalyzeTimeout = null;
let savedUrls = new Set(); // Track already saved URLs
let pendingSaves = new Set(); // Track URLs currently being saved

// Set your backend API host here. Use 'http://localhost:3000' for local, or 'http://<WSL_IP>:3000' for WSL.
const BACKEND_API_HOST = 'http://localhost:3000'; // Use localhost for Windows compatibility

// Load token and settings on startup
chrome.storage.local.get(['authToken', 'userSettings', 'lastAnalysis', 'savedUrls'], (result) => {
  authToken = result.authToken;
  if (result.userSettings) userSettings = result.userSettings;
  if (result.lastAnalysis) lastAnalysis = result.lastAnalysis;
  if (result.savedUrls) savedUrls = new Set(result.savedUrls);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    if (userSettings.autoAnalyze && authToken) {
      // Delay analysis to ensure page is fully loaded
      clearTimeout(autoAnalyzeTimeout);
      autoAnalyzeTimeout = setTimeout(() => {
        analyzeCurrentPage(tabId, true); // true = auto mode
      }, 3000);
    }
  }
});

// Tab activation listener
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (userSettings.autoAnalyze && authToken) {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        clearTimeout(autoAnalyzeTimeout);
        autoAnalyzeTimeout = setTimeout(() => {
          analyzeCurrentPage(activeInfo.tabId, true);
        }, 2000);
      }
    });
  }
});

// Manual analyze current page
async function analyzeCurrentPage(tabId, isAutoMode = false) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    function: extractPageContent
  });
  
  const pageData = results[0].result;
  
  if (!pageData || pageData.content.length < 200) {
    return;
  }

  const analysis = await analyzeContentLocal(pageData);
  
  lastAnalysis = {
    tabId,
    ...analysis,
    title: pageData.title,
    url: pageData.url,
    timestamp: new Date().toISOString(),
    model: currentModel,
    saved: false,
    isAutoMode: isAutoMode,
    alreadyExists: savedUrls.has(pageData.url)
  };
  
  chrome.storage.local.set({ lastAnalysis });
  
  // Check if content qualifies and save it (with improved duplicate handling)
  if (analysis.score >= userSettings.qualityThreshold && authToken) {
    // Skip if we already know this URL is saved or currently being saved
    // if (savedUrls.has(pageData.url)) {
    //   console.log('Content already saved, skipping:', pageData.title);
    //   lastAnalysis.saved = true;
    //   lastAnalysis.alreadyExists = true;
    //   chrome.storage.local.set({ lastAnalysis });
    //   return lastAnalysis;
    // }

    // if (pendingSaves.has(pageData.url)) {
    //   console.log('Content save already in progress, skipping:', pageData.title);
    //   return lastAnalysis;
    // }

    // Mark as pending to prevent duplicate saves
    pendingSaves.add(pageData.url);

    try {
      // --- ADDED: Set hasExtensionData if score > threshold ---
      const savePayload = {
        title: pageData.title,
        url: pageData.url,
        summary: analysis.summary,
        score: analysis.score,
        model: currentModel,
        analysisMethod: analysis.analysisMethod,
        wordCount: analysis.wordCount
      };
      if (analysis.score > userSettings.qualityThreshold) {
        savePayload.hasExtensionData = true;
      }
      // --- END ADDED ---

      const saved = await saveQualifiedContent(savePayload);
      
      if (saved) {
        lastAnalysis.saved = true;
        savedUrls.add(pageData.url);
        chrome.storage.local.set({ 
          lastAnalysis,
          savedUrls: Array.from(savedUrls)
        });
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'Qualified Content Saved!',
          message: `"${pageData.title.substring(0, 50)}..." (Score: ${analysis.score})`
        });
      }
    } finally {
      // Always remove from pending saves
      pendingSaves.delete(pageData.url);
    }
  }
  
  return lastAnalysis;
}

// Extract page content (injected function)
function extractPageContent() {
  const title = document.title;
  const url = window.location.href;
  
  // Extract more comprehensive content
  let content = '';
  let mediaContent = {
    videos: [],
    images: [],
    videoFrames: []
  };
  
  // Detect video content
  const videoElements = document.querySelectorAll('video');
  videoElements.forEach((video, index) => {
    const videoInfo = {
      src: video.src || video.currentSrc,
      poster: video.poster,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      title: video.title || `Video ${index + 1}`,
      element: video
    };
    mediaContent.videos.push(videoInfo);
  });
  
  // Detect image content
  const imageElements = document.querySelectorAll('img');
  imageElements.forEach((img, index) => {
    const imageInfo = {
      src: img.src,
      alt: img.alt,
      width: img.naturalWidth,
      height: img.naturalHeight,
      title: img.title || `Image ${index + 1}`,
      element: img
    };
    mediaContent.images.push(imageInfo);
  });
  
  // Try to get main article content first
  const articleSelectors = [
    'article', 
    '[role="main"]', 
    'main', 
    '.content', 
    '.post-content', 
    '.entry-content',
    '.article-body',
    '#content'
  ];
  
  let mainContent = null;
  for (const selector of articleSelectors) {
    mainContent = document.querySelector(selector);
    if (mainContent && mainContent.innerText.length > 200) break;
  }
  
  if (mainContent) {
    content = mainContent.innerText;
  } else {
    // Fallback to body content, but filter out navigation/sidebar
    const elementsToExclude = document.querySelectorAll('nav, aside, footer, header, .sidebar, .navigation, .menu');
    elementsToExclude.forEach(el => el.style.display = 'none');
    content = document.body.innerText;
    elementsToExclude.forEach(el => el.style.display = '');
  }
  
  // Get more content (up to 8000 chars for thorough analysis)
  content = content.substring(0, 8000).trim();
  
  const type = detectContentType(url, mediaContent);
  const wordCount = content.split(/\s+/).length;
  
  function detectContentType(url, mediaContent) {
    // Enhanced content type detection with multiple criteria
    
    // 1. URL-based detection (high priority)
    const urlLower = url.toLowerCase();
    
    // Video platforms
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'video';
    if (urlLower.includes('vimeo.com')) return 'video';
    if (urlLower.includes('twitch.tv')) return 'video';
    if (urlLower.includes('netflix.com')) return 'video';
    if (urlLower.includes('dailymotion.com')) return 'video';
    
    // Image platforms
    if (urlLower.includes('imgur.com')) return 'image';
    if (urlLower.includes('flickr.com')) return 'image';
    if (urlLower.includes('500px.com')) return 'image';
    if (urlLower.includes('deviantart.com')) return 'image';
    if (urlLower.includes('behance.net')) return 'image';
    if (urlLower.includes('pinterest.com')) return 'image';
    if (urlLower.includes('instagram.com')) return 'image';
    
    // Code/Technical platforms
    if (urlLower.includes('github.com')) return 'code';
    if (urlLower.includes('gitlab.com')) return 'code';
    if (urlLower.includes('bitbucket.org')) return 'code';
    if (urlLower.includes('stackoverflow.com')) return 'technical';
    if (urlLower.includes('stackexchange.com')) return 'technical';
    if (urlLower.includes('reddit.com/r/programming')) return 'technical';
    
    // News and articles
    if (urlLower.includes('medium.com')) return 'article';
    if (urlLower.includes('substack.com')) return 'article';
    if (urlLower.includes('wikipedia.org')) return 'article';
    if (urlLower.includes('news.ycombinator.com')) return 'tech-news';
    if (urlLower.includes('techcrunch.com')) return 'tech-news';
    if (urlLower.includes('arstechnica.com')) return 'tech-news';
    if (urlLower.includes('theverge.com')) return 'tech-news';
    if (urlLower.includes('wired.com')) return 'tech-news';
    
    // Social/Discussion platforms
    if (urlLower.includes('reddit.com')) return 'discussion';
    if (urlLower.includes('twitter.com')) return 'discussion';
    if (urlLower.includes('facebook.com')) return 'discussion';
    if (urlLower.includes('linkedin.com')) return 'discussion';
    
    // 2. Media-based detection (medium priority)
    const hasVideos = mediaContent.videos.length > 0;
    const hasImages = mediaContent.images.length > 0;
    const imageCount = mediaContent.images.length;
    const videoCount = mediaContent.videos.length;
    
    // If there are videos, it's likely video content
    if (hasVideos) {
      return 'video';
    }
    
    // If there are many images and little text, it's likely image content
    if (hasImages && imageCount > 3 && content.length < 1000) {
      return 'image';
    }
    
    // If there are some images but substantial text, it's mixed content
    if (hasImages && content.length > 500) {
      return 'mixed';
    }
    
    // 3. Content-based detection (low priority)
    const wordCount = content.split(/\s+/).length;
    const hasCodeBlocks = content.includes('```') || content.includes('function') || content.includes('class');
    const hasTechnicalTerms = content.includes('algorithm') || content.includes('implementation') || 
                             content.includes('API') || content.includes('framework');
    
    // Technical content indicators
    if (hasCodeBlocks || hasTechnicalTerms) {
      return 'technical';
    }
    
    // Long-form content
    if (wordCount > 1000) {
      return 'article';
    }
    
    // Short content
    if (wordCount < 200) {
      return 'brief';
    }
    
    // 4. Default fallback
    return 'article';
  }
  
  return { title, url, content, type, wordCount, mediaContent };
}

// Analyze content with LLM
async function analyzeContentLocal({ title, content, url, type, wordCount, mediaContent }) {
  try {
    // Enhanced content analysis
    const contentAnalysis = analyzeContentCharacteristics({ title, content, url, mediaContent, type });
    console.log('🔍 Content Analysis:', contentAnalysis);
    
    // Check if we have authentication token
    if (!authToken) {
      console.log('❌ No auth token available for analysis');
      throw new Error('Authentication required for content analysis');
    }

    console.log(`🤖 Analyzing ${type} content with LLM...`);
    
    // Analyze visual content if present
    let visualAnalysis = [];
    
    if (mediaContent && (mediaContent.videos.length > 0 || mediaContent.images.length > 0)) {
      console.log('🔍 Detected visual content, analyzing images...');
      
      if (mediaContent.images.length > 0) {
        visualAnalysis = await analyzeVisualContent(mediaContent.images, []);
        console.log(`🎨 Visual analysis complete: ${visualAnalysis.length} items analyzed`);
      }
    }
    
    // Enhanced LLM analysis with comprehensive context
    const response = await fetch(`${BACKEND_API_HOST}/api/extension/analyze`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title: title,
        content: content,
        url: url,
        type: type,
        contentType: type,
        wordCount: wordCount,
        mediaCount: contentAnalysis.mediaCount,
        qualityIndicators: contentAnalysis.qualityIndicators,
        platformInfo: contentAnalysis.platformInfo,
        // Enhanced context for LLM to think independently
        analysisContext: {
          hasImages: mediaContent.images.length > 0,
          hasVideos: mediaContent.videos.length > 0,
          imageCount: mediaContent.images.length,
          videoCount: mediaContent.videos.length,
          isMixedContent: mediaContent.images.length > 0 && content.length > 500,
          contentLength: content.length,
          platformType: contentAnalysis.platformInfo.platformType,
          isKnownPlatform: contentAnalysis.platformInfo.isKnownPlatform
        }
      }),
      signal: AbortSignal.timeout(30000) // Increased timeout for comprehensive analysis
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Backend analysis response:', result);
      
      if (result.success && result.analysis) {
        const analysis = result.analysis;
        console.log('🔍 [ANALYSIS RESULT]', analysis);
        
        // Log analysis method clearly
        console.log(`🤖 Analysis Method: LLM (Llama 2)`);
        console.log(`📊 Backend Score: ${analysis.score} (0-1 scale)`);
        
        // Convert backend score (0-1) to extension score (0-100)
        let finalScore = Math.round((analysis.score || 0.5) * 100);
        let finalSummary = analysis.summary || title.substring(0, 150);
        let analysisMethodLabel = 'llama2';
        
        console.log(`🎯 Final Score: ${finalScore}/100`);
        console.log(`📝 Summary: ${finalSummary}`);
        
        // If visual content was analyzed, combine scores
        if (visualAnalysis.length > 0) {
          const visualScores = visualAnalysis.map(item => item.score);
          const avgVisualScore = visualScores.reduce((a, b) => a + b, 0) / visualScores.length;
          
          console.log(`🎨 Visual Analysis Results:`);
          visualAnalysis.forEach((item, index) => {
            console.log(`  🖼️ ${item.type}: ${item.score}/100 - ${item.summary}`);
          });
          console.log(`📊 Average Visual Score: ${Math.round(avgVisualScore)}/100`);
          
          // Weight: 60% text, 40% visual for mixed content
          const textScore = finalScore;
          finalScore = Math.round((textScore * 0.6) + (avgVisualScore * 0.4));
          finalSummary += ` | Visual analysis: ${visualAnalysis.length} items, avg score: ${Math.round(avgVisualScore)}`;
          analysisMethodLabel = 'llama2+vision';
          
          console.log(`⚖️ Combined Analysis:`);
          console.log(`  📝 Text Score: ${textScore}/100 (60% weight)`);
          console.log(`  🎨 Visual Score: ${Math.round(avgVisualScore)}/100 (40% weight)`);
          console.log(`  🎯 Final Combined Score: ${finalScore}/100`);
        }
        
        // Log quality threshold comparison
        console.log(`🎯 Quality Threshold: ${userSettings.qualityThreshold}/100`);
        console.log(`✅ Content ${finalScore >= userSettings.qualityThreshold ? 'QUALIFIES' : 'DOES NOT QUALIFY'} for saving`);
        
        return {
          score: finalScore,
          summary: finalSummary,
          analysisMethod: analysisMethodLabel,
          wordCount: wordCount,
          visualAnalysis: visualAnalysis,
          videoFrames: [],
          tags: analysis.tags || [],
          category: analysis.category || 'general',
          contentType: type,
          contentAnalysis: contentAnalysis,
          backendAnalysis: analysis,
          isFallback: false
        };
      } else {
        throw new Error('Invalid response format from backend');
      }
    } else {
      const errorText = await response.text();
      console.error('Backend API error:', response.status, errorText);
      throw new Error('Backend response not OK: ' + response.status + ' ' + errorText);
    }
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw new Error('Analysis failed: ' + error.message);
  }
}

// Extract video frames for analysis
async function extractVideoFrames(videoElement, frameCount = 5) {
  const frames = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  try {
    // Wait for video to be ready
    if (videoElement.readyState < 2) {
      await new Promise(resolve => {
        videoElement.addEventListener('loadeddata', resolve, { once: true });
      });
    }
    
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const duration = videoElement.duration;
    const interval = duration / (frameCount + 1);
    
    for (let i = 1; i <= frameCount; i++) {
      const time = interval * i;
      videoElement.currentTime = time;
      
      await new Promise(resolve => {
        videoElement.addEventListener('seeked', () => {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const frameDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          frames.push({
            time: time,
            dataUrl: frameDataUrl,
            timestamp: `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`
          });
          resolve();
        }, { once: true });
      });
    }
  } catch (error) {
    console.error('Error extracting video frames:', error);
  }
  
  return frames;
}

// Analyze visual content using LLaMA 3.2 Vision (images only)
async function analyzeVisualContent(images, videoFrames = []) {
  const results = [];

  // Check if we have authentication token
  if (!authToken) {
    console.log('❌ No auth token available for visual analysis, skipping...');
    return results;
  }

  console.log(`🖼️ Starting visual analysis of ${images.length} images...`);

  // Analyze images only
  for (const image of images) {
    try {
      // Skip images that might cause download issues
      if (!image.src || image.src.startsWith('data:') || image.src.startsWith('blob:')) {
        console.log(`⏭️ Skipping image with unsupported source: ${image.src ? image.src.substring(0, 30) : 'no src'}`);
        continue;
      }
      
      console.log(`🔍 Analyzing image: ${image.src.substring(0, 50)}...`);
      
      const response = await fetch(`${BACKEND_API_HOST}/api/extension/analyze`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: `Image Analysis: ${image.alt || 'No description'}`,
          content: `Analyzing image: ${image.src}`,
          url: image.src,
          type: 'image'
        }),
        signal: AbortSignal.timeout(30000)
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.analysis) {
          const analysis = result.analysis;
          const score = Math.round((analysis.score || 0.5) * 100);
          
          console.log(`✅ Image analyzed (LLM): ${score}/100 - ${analysis.summary}`);
          
          results.push({
            type: 'image',
            src: image.src,
            score: score,
            summary: analysis.summary || `Image: ${image.alt || 'No description'}`,
            analysisMethod: 'llama3.2-vision'
          });
        }
      } else {
        const errorText = await response.text();
        console.error(`❌ Image analysis failed: ${response.status} - ${errorText}`);
        // Continue with other images instead of throwing error
      }
    } catch (error) {
      console.error(`❌ Error analyzing image: ${error.message}`);
      // Continue with other images instead of throwing error
    }
  }

  console.log(`🎨 Visual analysis complete: ${results.length}/${images.length} images analyzed successfully`);
  return results;
}

// Enhanced content analysis function
function analyzeContentCharacteristics({ title, content, url, mediaContent, type }) {
  const analysis = {
    contentType: type,
    wordCount: content.split(/\s+/).length,
    characterCount: content.length,
    mediaCount: {
      images: mediaContent.images.length,
      videos: mediaContent.videos.length
    },
    qualityIndicators: {},
    contentFeatures: {},
    platformInfo: {}
  };
  
  // Quality indicators
  analysis.qualityIndicators = {
    hasTitle: title && title.length > 10,
    titleLength: title ? title.length : 0,
    contentLength: content.length,
    hasImages: mediaContent.images.length > 0,
    hasVideos: mediaContent.videos.length > 0,
    isLongForm: content.length > 2000,
    isShortForm: content.length < 500,
    hasCodeBlocks: content.includes('```') || content.includes('function') || content.includes('class'),
    hasTechnicalTerms: content.includes('algorithm') || content.includes('implementation') || 
                      content.includes('API') || content.includes('framework'),
    hasResearchTerms: content.includes('research') || content.includes('study') || 
                     content.includes('analysis') || content.includes('data'),
    hasEducationalTerms: content.includes('tutorial') || content.includes('guide') || 
                        content.includes('learn') || content.includes('how to')
  };
  
  // Content features
  analysis.contentFeatures = {
    isVideoPlatform: url.includes('youtube.com') || url.includes('vimeo.com') || url.includes('twitch.tv'),
    isImagePlatform: url.includes('imgur.com') || url.includes('flickr.com') || url.includes('instagram.com'),
    isCodePlatform: url.includes('github.com') || url.includes('gitlab.com') || url.includes('stackoverflow.com'),
    isNewsPlatform: url.includes('medium.com') || url.includes('substack.com') || url.includes('techcrunch.com'),
    isSocialPlatform: url.includes('reddit.com') || url.includes('twitter.com') || url.includes('facebook.com'),
    hasMixedContent: mediaContent.images.length > 0 && content.length > 500,
    isTechnicalContent: type === 'technical' || type === 'code',
    isEducationalContent: type === 'article' && analysis.qualityIndicators.hasEducationalTerms
  };
  
  // Platform-specific information
  analysis.platformInfo = {
    domain: new URL(url).hostname,
    isKnownPlatform: analysis.contentFeatures.isVideoPlatform || 
                    analysis.contentFeatures.isImagePlatform || 
                    analysis.contentFeatures.isCodePlatform || 
                    analysis.contentFeatures.isNewsPlatform || 
                    analysis.contentFeatures.isSocialPlatform,
    platformType: analysis.contentFeatures.isVideoPlatform ? 'video' :
                  analysis.contentFeatures.isImagePlatform ? 'image' :
                  analysis.contentFeatures.isCodePlatform ? 'code' :
                  analysis.contentFeatures.isNewsPlatform ? 'news' :
                  analysis.contentFeatures.isSocialPlatform ? 'social' : 'other'
  };
  
  return analysis;
}

// IMPROVED: Save qualified content with better error handling and duplicate management
async function saveQualifiedContent(data) {
  try {
    console.log('🔍 Attempting to save qualified content:', { 
      title: data.title, 
      score: data.score, 
      qualityScore: data.qualityScore,
      threshold: userSettings.qualityThreshold,
      hasToken: !!authToken,
      url: data.url
    });
    
    // Double-check threshold
    if (data.score < userSettings.qualityThreshold) {
      console.log('❌ Content below threshold, not saving');
      return false;
    }

    if (!authToken) {
      console.error('❌ No auth token available');
      return false;
    }

    // Decode token to see user info
    try {
      const tokenPayload = JSON.parse(atob(authToken.split('.')[1]));
      console.log('🔍 Extension saving for user ID:', tokenPayload.userId);
    } catch (e) {
      console.log('🔍 Could not decode token, but proceeding with save');
    }

    // IMPROVED: Construct proper payload with all necessary fields
    const payload = {
      title: data.title,
      url: data.url,
      summary: data.summary || data.title,
      qualityScore: data.qualityScore !== undefined ? data.qualityScore : data.score,
      isFromExtension: true, // Explicitly mark as extension content
      isQualified: true, // Explicitly mark as qualified
      extensionData: {
        score: data.score,
        summary: data.summary,
        model: data.model || currentModel,
        analysisMethod: data.analysisMethod || 'llm-analysis',
        wordCount: data.wordCount || 0,
        analyzedAt: new Date().toISOString(),
        contentType: data.contentType || 'article',
        threshold: userSettings.qualityThreshold,
        visualAnalysis: data.visualAnalysis || [],
        videoFrames: data.videoFrames || []
      }
    };
    // --- ADDED: propagate hasExtensionData ---
    if (data.hasExtensionData) {
      payload.hasExtensionData = true;
      payload.extensionData.hasExtensionData = true;
    }
    // --- END ADDED ---

    console.log('📤 [SAVE PAYLOAD] Sending to server:', payload);

    const response = await fetch(`${BACKEND_API_HOST}/api/content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    console.log('📥 Save response:', { status: response.status, text: responseText });
    
    if (response.ok) {
      console.log('✅ Qualified content saved to profile:', data.title, 'Score:', data.score);
      return true;
    } else if (response.status === 400 && responseText.includes('Already posted')) {
      console.log('✅ Content already exists in profile - marking as saved');
      // Add to our local cache so we don't try again
      savedUrls.add(data.url);
      chrome.storage.local.set({ savedUrls: Array.from(savedUrls) });
      return true; // Consider this a success since it's already saved
    } else {
      console.error('❌ Failed to save qualified content:', response.status, responseText);
      return false;
    }
  } catch (error) {
    console.error('❌ Save failed with error:', error);
    return false;
  }
}

// Handle popup messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request.action);
  
  if (request.action === 'login') {
    handleLogin(request.token).then(sendResponse);
    return true;
  }
  
  if (request.action === 'getStatus') {
    sendResponse({ 
      authenticated: !!authToken,
      threshold: userSettings.qualityThreshold,
      lastAnalysis: lastAnalysis,
      currentModel: currentModel
    });
    return true;
  }
  
  if (request.action === 'analyzeCurrentPage') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        analyzeCurrentPage(tabs[0].id, false).then(sendResponse).catch(error => {
          console.error('Analysis error:', error);
          sendResponse({ error: error.message });
        });
      } else {
        sendResponse({ error: 'No active tab found' });
      }
    });
    return true;
  }
  
  if (request.action === 'updateSettings') {
    userSettings = { ...userSettings, ...request.settings };
    chrome.storage.local.set({ userSettings });
    console.log('Settings updated:', userSettings);
    sendResponse({ success: true });
    return true;
  }

  // IMPROVED: Manual save action with better duplicate handling
  if (request.action === 'saveQualifiedContent') {
    if (lastAnalysis && lastAnalysis.score >= userSettings.qualityThreshold) {
      // Check if already saved or currently being saved
      // if (savedUrls.has(lastAnalysis.url)) {
      //   console.log('Content already saved locally');
      //   sendResponse({ success: true, alreadyExists: true });
      //   return true;
      // }

      // if (pendingSaves.has(lastAnalysis.url)) {
      //   console.log('Content save already in progress');
      //   sendResponse({ success: false, error: 'Save already in progress' });
      //   return true;
      // }

      // Mark as pending
      pendingSaves.add(lastAnalysis.url);

      saveQualifiedContent({
        title: lastAnalysis.title,
        url: lastAnalysis.url,
        summary: lastAnalysis.summary,
        score: lastAnalysis.score,
        model: lastAnalysis.model,
        analysisMethod: lastAnalysis.analysisMethod,
        wordCount: lastAnalysis.wordCount
      }).then(saved => {
        if (saved) {
          lastAnalysis.saved = true;
          savedUrls.add(lastAnalysis.url);
          chrome.storage.local.set({ 
            lastAnalysis,
            savedUrls: Array.from(savedUrls)
          });
        }
        sendResponse({ success: saved });
      }).catch(error => {
        console.error('Save error:', error);
        sendResponse({ success: false, error: error.message });
      }).finally(() => {
        // Always remove from pending saves
        pendingSaves.delete(lastAnalysis.url);
      });
    } else {
      sendResponse({ success: false, error: 'No qualified content to save' });
    }
    return true;
  }

  // IMPROVED: Sync saved URLs from server
  if (request.action === 'syncSavedUrls') {
    syncSavedUrlsFromServer().then(sendResponse);
    return true;
  }

  // ADDED: Clear saved URLs cache
  if (request.action === 'clearSavedCache') {
    savedUrls.clear();
    pendingSaves.clear();
    chrome.storage.local.remove('savedUrls');
    console.log('Cleared saved URLs cache');
    sendResponse({ success: true });
    return true;
  }
});

// NEW: Sync saved URLs from server to prevent duplicates
async function syncSavedUrlsFromServer() {
  try {
    if (!authToken) {
      console.log('No auth token, skipping URL sync');
      return { success: false, error: 'Not authenticated' };
    }

    console.log('Syncing saved URLs from server...');
    const response = await fetch(`${BACKEND_API_HOST}/api/content/user-urls`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      const serverUrls = new Set(data.urls || []);
      
      // Merge with existing cache
      for (const url of serverUrls) {
        savedUrls.add(url);
      }
      
      chrome.storage.local.set({ savedUrls: Array.from(savedUrls) });
      console.log(`✅ Synced ${serverUrls.size} URLs from server`);
      
      return { success: true, count: serverUrls.size };
    } else if (response.status === 404) {
      console.log('⚠️ URL sync endpoint not found (server may be starting up)');
      return { success: false, error: 'Endpoint not available' };
    } else {
      console.error('Failed to sync URLs from server:', response.status);
      return { success: false, error: 'Failed to fetch from server' };
    }
  } catch (error) {
    console.error('Error syncing URLs:', error);
    return { success: false, error: error.message };
  }
}

async function handleLogin(token) {
  try {
    // Sanitize and debug token
    if (typeof token !== 'string') {
      token = String(token);
    }
    token = token.trim();
    console.log('Token for login:', token, typeof token, JSON.stringify(token));
    if (!/^[A-Za-z0-9\-_.]+$/.test(token.split(' ').pop())) {
      throw new Error('Token contains invalid characters');
    }
    console.log('Attempting login with token...');
    
    const response = await fetch(`${BACKEND_API_HOST}/api/extension/auth`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      authToken = token;
      chrome.storage.local.set({ authToken: token });
      console.log('✅ Login successful');
      
      // Try to sync saved URLs from server after login (but don't fail if it doesn't work)
      try {
        await syncSavedUrlsFromServer();
      } catch (syncError) {
        console.log('⚠️ URL sync failed, but login was successful:', syncError.message);
      }
      
      return { success: true };
    } else {
      console.error('❌ Login failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ Login error:', error);
  }
  return { success: false };
}