document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const statusPanel = document.getElementById('statusPanel');
  const tokenInput = document.getElementById('tokenInput');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginMessage = document.getElementById('loginMessage');
  const thresholdInput = document.getElementById('thresholdInput');
  const submitToken = document.getElementById('submitToken');
  const scoreDisplay = document.getElementById('scoreDisplay');
  const scoreValue = document.getElementById('scoreValue');
  const scoreTitle = document.getElementById('scoreTitle');
  const modelName = document.getElementById('modelName');
  const saveStatus = document.getElementById('saveStatus');
  const analyzeBtn = document.getElementById('analyzeBtn');

  // Check status on popup open
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (response && response.authenticated) {
      thresholdInput.value = response.threshold || 70;
      modelName.textContent = response.currentModel || 'Unknown';
      
      if (response.lastAnalysis) {
        displayAnalysis(response.lastAnalysis, response.threshold);
      }
      
      showStatus();
    } else {
      showLogin();
    }
  });

  // Analyze button
  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.textContent = 'Analyzing...';
    analyzeBtn.disabled = true;
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'analyzeCurrentPage' });
      
      if (response && !response.error) {
        const threshold = parseInt(thresholdInput.value);
        displayAnalysis(response, threshold);
        scoreDisplay.style.display = 'block';
      } else {
        showMessage('Analysis failed: ' + (response?.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      showMessage('Analysis failed', 'error');
    } finally {
      analyzeBtn.textContent = 'Analyze Current Page';
      analyzeBtn.disabled = false;
    }
  });

  // Login button
  loginBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:3000/extension' });
    showMessage('Copy JWT token from website and paste above', 'success');
  });

  // Submit token
  submitToken.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      showMessage('Please paste your JWT token', 'error');
      return;
    }

    submitToken.textContent = 'Connecting...';
    submitToken.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'login', 
        token: token 
      });
      
      if (response && response.success) {
        showMessage('Connected!', 'success');
        setTimeout(() => {
          showStatus();
          tokenInput.value = '';
        }, 800);
      } else {
        showMessage('Invalid token', 'error');
      }
    } catch (error) {
      showMessage('Connection failed', 'error');
    } finally {
      submitToken.textContent = 'Connect';
      submitToken.disabled = false;
    }
  });

  // Enter key to submit
  tokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitToken.click();
  });

  // Logout
  logoutBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['authToken'], () => {
      showLogin();
      showMessage('Disconnected', 'success');
    });
  });

  // Threshold change
  thresholdInput.addEventListener('change', () => {
    const threshold = parseInt(thresholdInput.value);
    if (threshold >= 0 && threshold <= 100) {
      chrome.runtime.sendMessage({ 
        action: 'updateSettings',
        settings: { qualityThreshold: threshold }
      });
    }
  });

  function displayAnalysis(analysis, threshold) {
    scoreValue.textContent = analysis.score;
    scoreTitle.textContent = analysis.title?.substring(0, 40) + '...' || 'Current page';
    
    // Style based on score
    scoreDisplay.className = 'score-display ' + (analysis.score >= threshold ? 'score-high' : 'score-low');
    
    // Show save status
    if (analysis.saved) {
      saveStatus.textContent = '✓ Saved to profile';
      saveStatus.style.color = '#10b981';
    } else if (analysis.score < threshold) {
      saveStatus.textContent = '× Below threshold';
      saveStatus.style.color = '#ef4444';
    } else {
      saveStatus.textContent = '• Processing...';
      saveStatus.style.color = '#6b7280';
    }
  }

  function showLogin() {
    loginForm.style.display = 'block';
    statusPanel.style.display = 'none';
    tokenInput.value = '';
    loginMessage.textContent = '';
  }

  function showStatus() {
    loginForm.style.display = 'none';
    statusPanel.style.display = 'block';
  }

  function showMessage(text, type) {
    loginMessage.textContent = text;
    loginMessage.className = type;
    setTimeout(() => {
      loginMessage.textContent = '';
      loginMessage.className = '';
    }, 3000);
  }
});