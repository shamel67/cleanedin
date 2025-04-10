/**
 * @file privacy.js
 * @description 
 * Conditionally injects `probe.js` into the page to prevent malicious probing 
 * of extensions via `fetch()` or similar APIs.
 * 
 * This script checks if CleanedIn is enabled and if the probing protection option is active.
 * If so, it injects a script tag referencing `probe.js` and removes it after execution.
 */

// Retrieve CleanedIn state and probing protection setting
chrome.storage.local.get(["cleanedIn", "probing"], (options) => {
    const { cleanedIn, probing } = options;

    // Only inject if both extension and probing protection are enabled
    if (cleanedIn && probing.status) {
        const scriptElement = document.createElement("script");
        scriptElement.src = chrome.runtime.getURL("probe.js");
        scriptElement.type = "application/javascript";
        scriptElement.async = false;
        document.documentElement.appendChild(scriptElement);
        scriptElement.onload = () => scriptElement.remove();
        console.info("probing prevention");
    }
});