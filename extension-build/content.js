console.log('Content script loaded.');

const model = 'llama3.2-vision';

// Set your Ollama API host here. Use 'http://localhost:11434' for local, or 'http://<WSL_IP>:11434' for WSL.
const OLLAMA_API_HOST = 'http://localhost:11434'; // CHANGE THIS TO YOUR WSL IP IF NEEDED

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Request.Action:', request.action);
  if (request.action === 'extractText') {
    console.log('Received extractText action in content.js.');

    // Extract visible text from the webpage
    const visibleText = document.body.innerText || '';
    console.log('Extracted text:', visibleText.substring(0, 1000)); // Log a snippet of the text

    // Send the extracted text along with the selected model to background.js
    chrome.runtime.sendMessage({
      action: 'summarise',
      text: visibleText.trim(),
      model: model, // Include the selected model
    });
  }
});