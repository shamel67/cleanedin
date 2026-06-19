/**
 * @file privacy.js
 * @description 
 * Conditionally activates `probe.js` in the MAIN world by setting a 
 * data attribute on the document element.
 */

// Retrieve probing protection setting and share it with the MAIN world
chrome.storage.local.get(["probing"], (options) => {
    const enabled = !!options.probing?.status;
    document.documentElement.setAttribute('data-FeedSift-probing', enabled);
});

// Listen for storage changes to update the toggle in real-time
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.probing) {
        document.documentElement.setAttribute('data-FeedSift-probing', !!changes.probing.newValue?.status);
    }
});