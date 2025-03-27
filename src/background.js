/**
 * @file background.js
 * @description Background service worker for the CleanedIn Chrome extension.
 * Handles installation, badge updates, and extension UI events.
 */

// Handle installation or update of the extension
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`CleanedIn ${details.reason}`);
    //await chrome.storage.local.clear();

    // Automatically open the options page after install/update
    chrome.runtime.openOptionsPage();
});

// Open the options page when the extension icon is clicked
chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});

// Get extension title from the manifest
const extensionTitle = chrome.runtime.getManifest().name;

// Listen for messages (e.g., badge update)
chrome.runtime.onMessage.addListener((message) => {
    // Update the action badge and tooltip
    if (message.type === "updateBadge") {
        chrome.action.setBadgeText(message.text);
        chrome.action.setTitle({
            title: `${extensionTitle} \nRatio of noise in your feed: ${message.text}`
        });
    }
});