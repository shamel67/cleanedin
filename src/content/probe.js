/**
 * @file probe.js
 * @description 
 * Stealthily handles extension probing by LinkedIn's tracking scripts.
 * Focuses on the iframe method while maintaining core interceptors for fetch, XHR, and beacons.
 */

(() => {
    // Prevent duplicate injection
    if (window.__FeedSiftProbingBlocked) return;
    window.__FeedSiftProbingBlocked = true;

    // --- Stealth Stats ---
    window.__FeedSiftStats = { interceptions: 0 };

    /**
     * Check if protection is currently enabled in settings.
     * Uses a data attribute set by privacy.js (ISOLATED world).
     */
    const isEnabled = () => {
        return document.documentElement.getAttribute('data-FeedSift-probing') === 'true';
    };

    const getUrlString = (u) => {
        try {
            if (!u) return "";
            if (typeof u === 'string') return u;
            if (u instanceof URL) return u.href;
            if (u instanceof Request) return u.url;
            return String(u);
        } catch (e) { return ""; }
    };

    const isProbe = (url) => {
        if (!isEnabled()) return false;
        const s = getUrlString(url);
        return s && s.includes('chrome-extension://');
    };

    const countIntercept = () => {
        window.__FeedSiftStats.interceptions++;
    };

    /**
     * Applies interceptors to a given window object.
     */
    const applyInterceptors = (win) => {
        if (!win || win.__FeedSiftPatched) return;
        win.__FeedSiftPatched = true;

        // --- Fetch ---
        const originalFetch = win.fetch;
        win.fetch = async function (resource, options) {
            if (isProbe(resource)) {
                countIntercept();
                return new Response(null, { status: 404, statusText: 'Not Found' });
            }
            return originalFetch.apply(this, arguments);
        };

        // --- XMLHttpRequest ---
        const originalOpen = win.XMLHttpRequest.prototype.open;
        win.XMLHttpRequest.prototype.open = function (method, url) {
            this._isExtensionProbe = isProbe(url);
            return originalOpen.apply(this, arguments);
        };

        const originalSend = win.XMLHttpRequest.prototype.send;
        win.XMLHttpRequest.prototype.send = function () {
            if (this._isExtensionProbe) {
                countIntercept();
                Object.defineProperty(this, 'status', { value: 404 });
                Object.defineProperty(this, 'statusText', { value: 'Not Found' });
                Object.defineProperty(this, 'readyState', { value: win.XMLHttpRequest.DONE });
                if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
                this.dispatchEvent(new Event('loadstart'));
                this.dispatchEvent(new Event('load'));
                this.dispatchEvent(new Event('loadend'));
                return;
            }
            return originalSend.apply(this, arguments);
        };

        // --- Beacon ---
        if (win.navigator && win.navigator.sendBeacon) {
            const originalBeacon = win.navigator.sendBeacon;
            win.navigator.sendBeacon = function (url, data) {
                if (isProbe(url)) {
                    countIntercept();
                    return true;
                }
                return originalBeacon.apply(this, arguments);
            }
        }
    };

    // Apply to top window immediately
    if (isEnabled) {
        console.log("[FeedSift] Probing protection active. Check window.__FeedSiftStats for totals.");
        applyInterceptors(window);
    }

    // --- Iframe Bridge Protection ---
    // LinkedIn often creates hidden iframes to get "clean" API references.
    const iframeDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (iframeDescriptor && iframeDescriptor.get) {
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
            get: function () {
                const win = iframeDescriptor.get.call(this);
                if (win) {
                    try { applyInterceptors(win); } catch (e) { }
                }
                return win;
            },
            configurable: true
        });
    }
})();
