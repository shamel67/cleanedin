/**
 * @file background.js
 * @description
 * Background service worker for the CleanedIn Chrome extension.
 * Handles installation, script injection into LI tabs,
 * badge updates, and extension UI events.
 */

// Handle installation or update of the extension
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`CleanedIn ${details.reason}`);
    await chrome.storage.local.clear();

    // Inject scripts into any existing LinkedIn tabs
    chrome.tabs.query({ url: "https://www.linkedin.com/*" }, (tabs) => {
        tabs.forEach(tab => injectScripts(tab.id));
    });

    // Automatically open the options page after install/update
    chrome.runtime.openOptionsPage();
});

// Get extension title from the manifest
const extensionTitle = chrome.runtime.getManifest().name;

// Listen for messages (e.g., badge update)
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "updateBadge") {
        updateBadge(message.text);
    }
});

// Update the action badge and tooltip
function updateBadge(text) {
    chrome.action.setBadgeText({ text });
    chrome.action.setTitle({
        title: `${extensionTitle} \nRatio of noise in your feed: ${text}`
    });
}

// Inject content scripts if not already present
function injectScripts(tabId) {
    console.info(`Injecting CleanedIn into tab ${tabId}`);
    chrome.scripting.executeScript({
        target: { tabId },
        files: ["cssContains.js", "settings.js", "content.js"]
    }).catch(err => {
        console.warn(`Could not inject CleanedIn into tab ${tabId}:`, err);
    });
}

// Open the options page when the extension icon is clicked
chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});