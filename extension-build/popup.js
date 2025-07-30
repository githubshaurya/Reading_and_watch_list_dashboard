document.addEventListener('DOMContentLoaded', () => {
  // --- Ensure fileToBase64 is defined first ---
  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

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
  const userNameDisplay = document.getElementById('userNameDisplay');
  const syncThresholdBtn = document.getElementById('syncThresholdBtn');
  const mediaUploadInput = document.getElementById('mediaUploadInput');
  const mediaUploadBtn = document.getElementById('mediaUploadBtn');
  const mediaUploadStatus = document.getElementById('mediaUploadStatus');

  // Check status on popup open
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (response && response.authenticated) {
      thresholdInput.value = response.threshold || 55;
      
      // Fetch and display user name
      chrome.storage.local.get(['authToken'], async (result) => {
        const token = result.authToken;
        if (token) {
          try {
            const res = await fetch('http://localhost:3000/api/user/settings', {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
              const data = await res.json();
              const name = data.user?.profile?.firstName || data.user?.username || '';
              if (name) {
                userNameDisplay.textContent = `@${name}`;
              } else {
                userNameDisplay.textContent = '';
              }
            } else {
              userNameDisplay.textContent = '';
            }
          } catch (err) {
            userNameDisplay.textContent = '';
          }
        } else {
          userNameDisplay.textContent = '';
        }
      });
      
      // Always sync threshold with backend on popup open
      chrome.storage.local.get(['authToken'], async (result) => {
        const token = result.authToken;
        if (token) {
          const currentThreshold = parseInt(thresholdInput.value);
          console.log('[Popup Open Sync] 🔄 Starting threshold sync...');
          console.log('[Popup Open Sync] Current threshold from input:', currentThreshold);
          console.log('[Popup Open Sync] Auth token found:', !!token);
          
          try {
            console.log('[Popup Open Sync] 📤 Sending PUT request to backend...');
            const res = await fetch('http://localhost:3000/api/user/settings', {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ qualityThreshold: currentThreshold })
            });
            
            console.log('[Popup Open Sync] 📥 Response status:', res.status);
            const data = await res.json();
            console.log('[Popup Open Sync] ✅ Successfully synced threshold to backend:', currentThreshold, 'Response:', data);
            
            // Verify the sync worked by checking the user's current threshold
            setTimeout(async () => {
              try {
                const verifyRes = await fetch('http://localhost:3000/api/user/settings', {
                  method: 'GET',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                const verifyData = await verifyRes.json();
                console.log('[Popup Open Sync] 🔍 Verification - User threshold in DB:', verifyData.user?.preferences?.qualityThreshold);
              } catch (err) {
                console.error('[Popup Open Sync] ❌ Verification failed:', err);
              }
            }, 1000);
            
          } catch (err) {
            console.error('[Popup Open Sync] ❌ Error syncing threshold to backend:', err);
          }
        } else {
          console.warn('[Popup Open Sync] ⚠️ No auth token found in storage.');
        }
      });
      
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
    analyzeBtn.textContent = 'Analyzing with Llama 2...';
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
    console.log('[DEBUG] Login button clicked');
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
        showMessage('Connected to ContentFeed!', 'success');
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
      submitToken.textContent = 'Connect to Profile';
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
      showMessage('Disconnected from ContentFeed', 'success');
      userNameDisplay.textContent = '';
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
      // Also update backend directly from popup
      chrome.storage.local.get(['authToken'], async (result) => {
        const token = result.authToken;
        if (token) {
          try {
            const res = await fetch('http://localhost:3000/api/user/settings', {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ qualityThreshold: threshold })
            });
            const data = await res.json();
            console.log('[Threshold PUT] Sent to backend:', threshold, 'Response:', data);
          } catch (err) {
            console.error('[Threshold PUT] Error sending to backend:', err);
          }
        } else {
          console.warn('[Threshold PUT] No auth token found in storage.');
        }
      });
    }
  });

  // Manual sync threshold button
  syncThresholdBtn.addEventListener('click', async () => {
    const threshold = parseInt(thresholdInput.value);
    console.log('[Manual Sync] 🔄 Manually syncing threshold:', threshold);
    
    chrome.storage.local.get(['authToken'], async (result) => {
      const token = result.authToken;
      if (token) {
        try {
          const res = await fetch('http://localhost:3000/api/user/settings', {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ qualityThreshold: threshold })
          });
          const data = await res.json();
          console.log('[Manual Sync] ✅ Successfully synced threshold:', threshold, 'Response:', data);
          showMessage(`Threshold synced to ${threshold}`, 'success');
        } catch (err) {
          console.error('[Manual Sync] ❌ Error syncing threshold:', err);
          showMessage('Failed to sync threshold', 'error');
        }
      } else {
        console.warn('[Manual Sync] ⚠️ No auth token found.');
        showMessage('Not authenticated', 'error');
      }
    });
  });

  mediaUploadBtn.addEventListener('click', async () => {
    const file = mediaUploadInput.files[0];
    if (!file) {
      mediaUploadStatus.textContent = 'Please select an image or video file.';
      mediaUploadStatus.style.color = '#ef4444';
      return;
    }
    mediaUploadStatus.textContent = 'Uploading...';
    mediaUploadStatus.style.color = '#6b7280';

    // Convert file to base64 in the popup context
    const fileData = await fileToBase64(file);

    // Inject file into the first file input on the page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (fileName, fileType, fileData) => {
          // Find the first file input
          const input = document.querySelector('input[type="file"]');
          if (!input) {
            return 'No file input found on this page.';
          }
          // Create a new File object
          const bstr = atob(fileData);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) u8arr[n] = bstr.charCodeAt(n);
          const file = new File([u8arr], fileName, { type: fileType });
          // Create a DataTransfer to set the file input
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          // Trigger change event
          input.dispatchEvent(new Event('change', { bubbles: true }));
          // Optionally, scroll to the input
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return 'File injected into upload input.';
        },
        args: [file.name, file.type, fileData]
      }, (results) => {
        const result = results && results[0] && results[0].result;
        if (result && result.startsWith('File injected')) {
          mediaUploadStatus.textContent = 'File uploaded! Complete the post on the website.';
          mediaUploadStatus.style.color = '#10b981';
        } else {
          mediaUploadStatus.textContent = result || 'Upload failed. No file input found.';
          mediaUploadStatus.style.color = '#ef4444';
        }
      });
    });
  });

  function displayAnalysis(analysis, threshold) {
    if (typeof analysis.score !== 'number') {
      scoreValue.textContent = '--';
      scoreTitle.textContent = 'Analysis failed (LLM unavailable)';
      saveStatus.textContent = '× LLM unavailable or failed';
      saveStatus.style.color = '#ef4444';
      document.getElementById('visualAnalysisInfo').style.display = 'none';
      return;
    }
    scoreValue.textContent = analysis.score;
    scoreTitle.textContent = analysis.title?.substring(0, 40) + '...' || 'Current page';
    
    // Style based on score
    scoreDisplay.className = 'score-display ' + (analysis.score >= threshold ? 'score-high' : 'score-low');
    
    // Show visual analysis info if available
    const visualAnalysisInfo = document.getElementById('visualAnalysisInfo');
    const visualAnalysisDetails = document.getElementById('visualAnalysisDetails');
    
    if (analysis.visualAnalysis && analysis.visualAnalysis.length > 0) {
      // Check for vision-unavailable marker
      const unavailable = analysis.visualAnalysis.find(item => item.type === 'vision-unavailable');
      if (unavailable) {
        visualAnalysisInfo.style.display = 'block';
        visualAnalysisDetails.innerHTML = `<span style='color:#ef4444;'>${unavailable.summary}</span>`;
      } else {
        visualAnalysisInfo.style.display = 'block';
        const details = analysis.visualAnalysis.map(item => {
          const type = item.type === 'image' ? '🖼️' : '🎬';
          return `${type} ${item.type === 'video-frame' ? `Frame ${item.timestamp}` : 'Image'}: ${item.score}/100`;
        }).join('<br>');
        visualAnalysisDetails.innerHTML = details;
      }
    } else {
      visualAnalysisInfo.style.display = 'none';
    }
    
    // Show save status
    if (analysis.saved) {
      saveStatus.textContent = '✓ Saved to your profile';
      saveStatus.style.color = '#10b981';
    } else if (analysis.score < threshold) {
      saveStatus.textContent = '× Below quality threshold';
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