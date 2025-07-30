console.log('Content script loaded.');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Request.Action:', request.action);
  if (request.action === 'extractText') {
    console.log('Received extractText action in content.js.');

    // Extract visible text from the webpage
    const visibleText = document.body.innerText || '';
    console.log('Extracted text:', visibleText.substring(0, 1000)); // Log a snippet of the text

    // Retrieve the selected model from chrome.storage.sync
    chrome.storage.sync.get('ollamaModel', (data) => {
      if (!data.ollamaModel) {
        console.error('No model selected. Please configure a model in the extension settings.');
        // Notify background.js about the missing model
        chrome.runtime.sendMessage({
          action: 'summaryError',
          error: 'No model selected. Please configure a model in the extension settings.',
        });
      } else {
        console.log('Using model:', data.ollamaModel);

        // Send the extracted text along with the selected model to background.js
        chrome.runtime.sendMessage({
          action: 'summarise',
          text: visibleText.trim(),
          model: data.ollamaModel, // Include the selected model
        });
      }
    });
  }
});