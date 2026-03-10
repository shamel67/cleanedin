/**
 * @file background.js
 * @description Background service worker for the CleanedIn Chrome extension.
 * Handles installation, badge updates, and extension UI events.
 */

// Handle installation or update of the extension
chrome.runtime.onInstalled.addListener(async (details) => {
    // Automatically open the options page after install or extension update
    if (details.reason === 'install' || details.reason === 'update') {
        chrome.runtime.openOptionsPage();
    }
});

// Open the options page when the extension icon is clicked
chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});

// Get extension title from the manifest
const extensionTitle = chrome.runtime.getManifest().name;

// Listen for messages (e.g., badge update)
chrome.runtime.onMessage.addListener((msg, sender) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;

    if (msg.type === "linkedinFocus") {
        chrome.action.setIcon({
            tabId,
            path: msg.isActive ? "img/cleanedin.png" : "img/cleanedin-inactive.png"
        });
        return;
    }

    // Update the action badge and tooltip
    if (msg.type === "updateBadge") {
        const text = msg.text;
        chrome.action.setBadgeText({ tabId, text });
        chrome.action.setTitle({
            tabId,
            title: text
                ? `${extensionTitle}\nRatio of noise in your feed: ${text}`
                : extensionTitle
        });
    }
});