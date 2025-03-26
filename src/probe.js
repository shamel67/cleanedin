/**
 * @file probe.js
 * @description 
 * Protects the user's privacy by preventing LI from being probed or fetched by 
 * external scripts via `fetch()`. If a request attempts to access 
 * `chrome-extension://` URLs, it is intercepted and blocked with a 
 * 403 Forbidden response.
 * 
 * This script is injected early into the page to override `window.fetch` 
 * in a secure and idempotent manner.
 */

(() => {
    // Prevent duplicate injection
    if (window.__cleanedInProbingBlocked) return;
    window.__cleanedInProbingBlocked = true;

    // Preserve original fetch reference
    const originalFetch = window.fetch;

    /**
     * Overrides `fetch()` to block access to chrome-extension URLs
     * @param {RequestInfo} resource - Request URL or object
     * @param {RequestInit} [options] - Optional fetch options
     * @returns {Promise<Response>}
     */
    function blockedFetch(resource, options) {
        if (typeof resource === "string" && resource.startsWith("chrome-extension://")) {
            return new Response(null, {
                status: 403,
                statusText: "Forbidden"
            });
        }

        // Forward all calls to original fetch
        return originalFetch.apply(window, arguments);
    }

    // Lock down `window.fetch` with the override
    Object.defineProperty(window, "fetch", {
        configurable: false,
        enumerable: false,
        writable: false,
        value: blockedFetch
    });
})();