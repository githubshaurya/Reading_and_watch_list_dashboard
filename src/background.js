// background.js - Fixed version with better duplicate handling
let authToken = null;
let userSettings = { qualityThreshold: 70 };
let lastAnalysis = null;
let currentModel = 'llama3.2:1b';
let autoAnalyzeTimeout = null;
let savedUrls = new Set(); // Track already saved URLs
let pendingSaves = new Set(); // Track URLs currently being saved

// Load token and settings on startup
chrome.storage.local.get(['authToken', 'userSettings', 'lastAnalysis', 'savedUrls'], (result) => {
  authToken = result.authToken;
  if (result.userSettings) userSettings = result.userSettings;
  if (result.lastAnalysis) lastAnalysis = result.lastAnalysis;
  if (result.savedUrls) savedUrls = new Set(result.savedUrls);
});

// Get current model from storage
chrome.storage.sync.get('ollamaModel', (data) => {
  if (data.ollamaModel) currentModel = data.ollamaModel;
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
    if (savedUrls.has(pageData.url)) {
      console.log('Content already saved, skipping:', pageData.title);
      lastAnalysis.saved = true;
      lastAnalysis.alreadyExists = true;
      chrome.storage.local.set({ lastAnalysis });
      return lastAnalysis;
    }

    if (pendingSaves.has(pageData.url)) {
      console.log('Content save already in progress, skipping:', pageData.title);
      return lastAnalysis;
    }

    // Mark as pending to prevent duplicate saves
    pendingSaves.add(pageData.url);

    try {
      const saved = await saveQualifiedContent({
        title: pageData.title,
        url: pageData.url,
        summary: analysis.summary,
        score: analysis.score,
        model: currentModel,
        analysisMethod: analysis.analysisMethod,
        wordCount: analysis.wordCount
      });
      
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
  
  const type = detectContentType(url);
  const wordCount = content.split(/\s+/).length;
  
  function detectContentType(url) {
    if (url.includes('youtube.com') || url.includes('vimeo.com')) return 'video';
    if (url.includes('github.com')) return 'code';
    if (url.includes('medium.com') || url.includes('substack.com')) return 'article';
    if (url.includes('stackoverflow.com')) return 'technical';
    if (url.includes('reddit.com')) return 'discussion';
    if (url.includes('news.ycombinator.com')) return 'tech-news';
    return 'article';
  }
  
  return { title, url, content, type, wordCount };
}

// Analyze content with LLM
async function analyzeContentLocal({ title, content, url, type, wordCount }) {
  try {
    console.log('Analyzing content with LLM...');
    
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: currentModel,
        prompt: `You are an expert content curator. Carefully analyze this ${type} and rate its quality from 0-100.

EVALUATION CRITERIA:
- Depth & Insight: How deep and valuable is the information?
- Credibility: Is the source and content trustworthy?
- Uniqueness: Does it offer unique perspectives or information?
- Usefulness: How useful is this for readers?
- Writing Quality: Is it well-written and structured?

Take your time to read through the content thoroughly. Consider:
- For articles: depth of analysis, research quality, practical value
- For technical content: accuracy, completeness, clarity of explanation  
- For videos: educational value, production quality (infer from description)
- For discussions: quality of insights and debate

RESPOND ONLY WITH VALID JSON:
{"score": [0-100], "summary": "2-3 sentence summary explaining why this content is valuable or not"}

CONTENT TO ANALYZE:
Title: ${title}
URL: ${url}
Word Count: ${wordCount}
Type: ${type}

Full Content:
${content}

Take at least 5 seconds to thoroughly analyze before responding.`,
        stream: false,
        options: {
          temperature: 0.3,
          top_p: 0.9
        }
      }),
      signal: AbortSignal.timeout(15000) // Increased timeout for thorough analysis
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Raw LLM response:', result.response);
      
      try {
        // Try to extract JSON from response (LLM might add extra text)
        const jsonMatch = result.response.match(/\{[^}]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : result.response;
        const analysis = JSON.parse(jsonStr);
        
        console.log('Parsed analysis:', analysis);
        
        return {
          score: Math.min(Math.max(analysis.score || 50, 0), 100),
          summary: analysis.summary || title.substring(0, 150),
          analysisMethod: 'llm',
          wordCount: wordCount
        };
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError, result.response);
        throw parseError;
      }
    }
  } catch (error) {
    console.log('LLM unavailable, using fallback scoring:', error);
  }

  // Fallback scoring when LLM is unavailable
  console.log('Using fallback scoring method');
  return {
    score: calculateFallbackScore(title, content, url, wordCount),
    summary: title.substring(0, 150),
    analysisMethod: 'fallback',
    wordCount: wordCount
  };
}

function calculateFallbackScore(title, content, url, wordCount) {
  let score = 40; // Start lower to be more discriminating
  
  // Content length and depth
  if (wordCount > 500) score += 15;
  if (wordCount > 1500) score += 15;
  if (wordCount > 3000) score += 10;
  
  // Title quality indicators
  if (title.length > 20 && title.length < 100) score += 8;
  if (title.includes('How to') || title.includes('Guide') || title.includes('Tutorial')) score += 5;
  
  // Quality domains with different weights
  const premiumDomains = ['arxiv.org', 'nature.com', 'science.org'];
  const goodDomains = ['medium.com', 'substack.com', 'wikipedia.org', 'github.com', 'stackoverflow.com'];
  const techDomains = ['techcrunch.com', 'arstechnica.com', 'wired.com', 'theverge.com'];
  
  if (premiumDomains.some(domain => url.includes(domain))) score += 25;
  else if (goodDomains.some(domain => url.includes(domain))) score += 15;
  else if (techDomains.some(domain => url.includes(domain))) score += 10;
  
  // Content quality indicators
  const qualityIndicators = ['research', 'study', 'analysis', 'methodology', 'findings', 'conclusion', 'abstract', 'introduction'];
  const foundIndicators = qualityIndicators.filter(indicator => 
    content.toLowerCase().includes(indicator)
  ).length;
  score += foundIndicators * 3;
  
  // Technical depth indicators
  if (content.includes('algorithm') || content.includes('implementation') || content.includes('code')) score += 8;
  if (content.includes('data') && content.includes('results')) score += 5;
  
  // Penalize low-quality indicators
  if (content.includes('click here') || content.includes('subscribe now')) score -= 10;
  if (title.includes('You Won\'t Believe') || title.includes('Shocking')) score -= 15;
  
  return Math.min(Math.max(score, 0), 100);
}

// IMPROVED: Save qualified content with better error handling and duplicate management
async function saveQualifiedContent(data) {
  try {
    console.log('Attempting to save qualified content:', { 
      title: data.title, 
      score: data.score, 
      threshold: userSettings.qualityThreshold,
      hasToken: !!authToken,
      url: data.url
    });
    
    // Double-check threshold
    if (data.score < userSettings.qualityThreshold) {
      console.log('Content below threshold, not saving');
      return false;
    }

    if (!authToken) {
      console.error('No auth token available');
      return false;
    }

    // Construct proper payload
    const payload = {
      title: data.title,
      url: data.url,
      summary: data.summary,
      qualityScore: data.score,
      isFromExtension: true,
      extensionData: {
        score: data.score,
        summary: data.summary,
        model: data.model || currentModel,
        analysisMethod: data.analysisMethod,
        wordCount: data.wordCount,
        analyzedAt: new Date().toISOString()
      }
    };

    console.log('Sending payload:', payload);

    const response = await fetch('http://localhost:3000/api/content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    console.log('Save response:', { status: response.status, text: responseText });
    
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
  
  if (request.action === 'updateModel') {
    currentModel = request.model;
    chrome.storage.sync.set({ ollamaModel: request.model });
    console.log('Model updated:', currentModel);
    sendResponse({ success: true });
    return true;
  }

  // IMPROVED: Manual save action with better duplicate handling
  if (request.action === 'saveQualifiedContent') {
    if (lastAnalysis && lastAnalysis.score >= userSettings.qualityThreshold) {
      // Check if already saved or currently being saved
      if (savedUrls.has(lastAnalysis.url)) {
        console.log('Content already saved locally');
        sendResponse({ success: true, alreadyExists: true });
        return true;
      }

      if (pendingSaves.has(lastAnalysis.url)) {
        console.log('Content save already in progress');
        sendResponse({ success: false, error: 'Save already in progress' });
        return true;
      }

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
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch('http://localhost:3000/api/content/user-urls', {
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
    console.log('Attempting login with token...');
    
    const response = await fetch('http://localhost:3000/api/extension/auth', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      authToken = token;
      chrome.storage.local.set({ authToken: token });
      console.log('✅ Login successful');
      
      // Sync saved URLs from server after login
      await syncSavedUrlsFromServer();
      
      return { success: true };
    } else {
      console.error('❌ Login failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ Login error:', error);
  }
  return { success: false };
}