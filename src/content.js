/**
 * @file content.js
 * @description 
 * Injected into LinkedIn pages, this script filters or restyles content 
 * based on user-defined settings. It observes DOM changes, applies 
 * filters dynamically, updates the badge with a "noise ratio," and 
 * rewrites copied LinkedIn post URLs to remove tracking.
 */

/** CSS class applied to matched elements in dim mode. */
const ELEMENT_CLASS = "CleanedIn";

/** Declared here; populated after settings JSON is fetched. */
let settingsGroups = [];

let options = {};
let lastUrl = location.href;

/**
 * Inject external CSS only once.
 */
function loadCSS() {
    if (!document.getElementById("cleanedin-style")) {
        const link = document.createElement("link");
        link.id = "cleanedin-style";
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = chrome.runtime.getURL("content.css");
        document.head.appendChild(link);
    }
}

/**
 * Flatten settingsGroups to a flat key-value map.
 */
function flattenSettings(settingsGroups) {
    const flatSettings = {};

    settingsGroups.forEach(group => {
        group.settings.forEach(({ id, selector, class: className, color }) => {
            const filtered = {};
            if (selector) filtered.selector = selector;
            if (className) filtered.class = className;
            if (color) filtered.color = color;

            if (Object.keys(filtered).length > 0) {
                flatSettings[id] = filtered;
            }
        });
    });

    return flatSettings;
}

/**
 * Migrate legacy stored values to current format.
 * Runs once on startup; writes corrections back to storage if needed.
 *  - Converts status:"true" (string) → true (boolean)
 *  - Removes the deprecated cleanedIn master toggle key
 * @param {Object} stored - Raw value from chrome.storage.local
 * @returns {Promise<Object>} Normalized options object
 */
function migrateStoredOptions(stored) {
    const patches = {};
    const removals = [];

    // Remove legacy master toggle key (CleanedIn is now always active)
    if ('cleanedIn' in stored) {
        removals.push('cleanedIn');
    }

    // Normalize any setting whose status is the string "true" or "false"
    Object.entries(stored).forEach(([id, value]) => {
        if (id === "cleanedIn" || typeof value !== "object" || value === null) return;
        if (value.status === "true" || value.status === "false") {
            patches[id] = { ...value, status: value.status === "true" };
        }
    });

    const hasWork = Object.keys(patches).length > 0 || removals.length > 0;
    if (!hasWork) return Promise.resolve(stored);

    return new Promise(resolve => {
        const apply = () => {
            const normalized = { ...stored, ...patches };
            removals.forEach(k => delete normalized[k]);
            resolve(normalized);
        };
        const afterSet = removals.length > 0
            ? () => chrome.storage.local.remove(removals, apply)
            : apply;
        Object.keys(patches).length > 0
            ? chrome.storage.local.set(patches, afterSet)
            : afterSet();
    });
}

/**
 * Merge stored options with flattened settings.
 * @param {Object} storedOptions - Normalized value from chrome.storage.local
 */
function mergeSettings(storedOptions) {
    const flatSettings = flattenSettings(settingsGroups);
    const merged = {};

    Object.entries(storedOptions).forEach(([id, stored]) => {
        const fallback = flatSettings[id] || {};
        const mergedSetting = { status: stored.status ?? false };

        if (stored.selector || fallback.selector) mergedSetting.selector = stored.selector || fallback.selector;
        if (stored.class || fallback.class) mergedSetting.class = stored.class || fallback.class;
        if (stored.color || fallback.color) mergedSetting.color = stored.color || fallback.color;

        merged[id] = mergedSetting;
    });

    options = merged;
}

/**
 * Apply filters to all DOM elements.
 * Scoped to the main content area for performance.
 */
function applySettings() {
    requestAnimationFrame(() => {
        // Clean up any settings flagged for deletion
        const toDelete = [];
        Object.entries(options).forEach(([id, setting]) => {
            if (setting.status === "delete") {
                document.querySelectorAll(`[data-cleanedin="${id}"]`).forEach(el => {
                    if (setting.class) el.classList.remove(setting.class);
                    if (setting.color) el.style.removeProperty("color");
                    el.removeAttribute("data-cleanedin");
                });
                toDelete.push(id);
            }
        });

        if (toDelete.length > 0) {
            chrome.storage.local.remove(toDelete, () => {
                toDelete.forEach(id => delete options[id]);
            });
        }

        // Scope to #main or fall back to body for performance
        const root = document.getElementById("main") || document.body;
        root.querySelectorAll('*').forEach(processNode);
    });
}

/**
 * Style or un-style a specific element based on its setting status.
 * @param {Element} node
 * @param {string} settingId
 * @param {Object} setting
 */
function processElement(node, settingId, setting) {
    if (!setting.status) {
        node.classList.remove(ELEMENT_CLASS, setting.class);
        node.style.removeProperty("color");
        node.removeAttribute("data-cleanedin");
        return;
    }

    if (setting.class === "CleanedInCustom") {
        node.classList.remove(ELEMENT_CLASS);
        node.classList.add(setting.class);
        node.style.color = setting.color;
    } else {
        node.classList.remove(ELEMENT_CLASS); // idempotent guard
        node.classList.add(ELEMENT_CLASS);
        node.style.removeProperty("color");
    }

    node.setAttribute("data-cleanedin", settingId);
}

/**
 * Throttle a function to run at most once per delay (ms).
 * Always attempts the call; errors in the callback are handled there.
 */
function throttle(fn, delay) {
    let lastCall = 0;
    return (...args) => {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            fn.apply(this, args);
        }
    };
}

const throttledUpdateBadge = throttle(updateBadge, 18000);

/**
 * Calculate and update badge text (noise ratio).
 * Sends a message to the background service worker; silently retries on the
 * next throttled call if the worker is temporarily asleep.
 */
function updateBadge() {
    requestAnimationFrame(() => {
        const cleanedCount = document.querySelectorAll(`.${ELEMENT_CLASS}`).length;
        const cleanedPostCount = document.querySelectorAll(`div[data-id] .${ELEMENT_CLASS}`).length;
        const totalCount = document.querySelectorAll('div[data-id]').length + cleanedCount - cleanedPostCount;
        const ratio = totalCount ? Math.round((cleanedCount / totalCount) * 100) : 0;

        try {
            chrome.runtime.sendMessage({
                type: "updateBadge",
                text: ratio > 0 ? `${ratio}%` : ""
            });
        } catch {
            // Service worker may be temporarily asleep (MV3 lifecycle).
            // The throttle will retry on the next interval.
        }
    });
}

/** Pending nodes collected from MutationObserver, flushed in one idle batch. */
let pendingNodes = [];
let flushScheduled = false;

/**
 * Flush the pending node queue in a single idle callback.
 */
function flushPendingNodes() {
    flushScheduled = false;
    const nodes = pendingNodes.splice(0);
    requestIdleCallback(() => {
        nodes.forEach(node => {
            if (!(node instanceof Element)) return;
            processNode(node);
        });
        throttledUpdateBadge();
    });
}

/**
 * Process a single node by checking all active settings.
 * @param {Element} node
 */
function processNode(node) {
    if (!(node instanceof Element)) return;

    Object.entries(options).forEach(([settingId, setting]) => {
        if (settingId === "ai") {
            if (setting.status === true) {
                const posts = node.querySelectorAll('div[data-id^="urn:li:"] div.feed-shared-update-v2:not([data-cleanedin-ai-check])');
                posts.forEach(post => {
                    const postTextEl = post.querySelector('.update-components-update-v2__commentary .tvm-parent-container');
                    if (!postTextEl) return;
                    const postText = postTextEl.innerText.trim();
                    const analysisResult = aiDetector(postText);
                    if (analysisResult.isLikelyAI) {
                        // Place it next to the author's name/title in the actor section instead of the header wrapper
                        const actorMeta = post.querySelector('.update-components-actor__meta') || post.querySelector('.update-components-actor__container');
                        if (actorMeta && !actorMeta.querySelector('.CleanedInAI')) {
                            const icon = document.createElement('span');
                            icon.className = 'CleanedInAI';
                            icon.textContent = '🤖'; // robot is more universally recognized for AI
                            icon.setAttribute('data-tooltip', `Likely AI Generated\nScore: ${analysisResult.score}\nReasons: ${analysisResult.reasons.join(', ')}`);
                            actorMeta.appendChild(icon);
                        }
                    }
                    post.setAttribute('data-cleanedin-ai-check', 'true');
                });
            } else {
                document.querySelectorAll('.CleanedInAI').forEach(el => el.remove());
            }
        } else if (setting.selector) {
            node.querySelectorAllContains(setting.selector).forEach(el => {
                processElement(el, settingId, setting);
            });
        }
    });
}

/**
 * Observe new elements and changes in DOM.
 * Batches added nodes through a shared flush queue.
 */
function observeMutations() {
    const observer = new MutationObserver(mutations => {
        mutations.forEach(({ addedNodes }) => {
            addedNodes.forEach(node => {
                if (!(node instanceof Element)) return;

                pendingNodes.push(node);

                // Modify LinkedIn link in toast message
                if (options.links && node.matches('div[data-test-artdeco-toast-item-type="success"]')) {
                    const link = node.querySelector('a[href*="//www.linkedin.com/posts/"]');
                    if (link) {
                        const cleanURL = new URL(link.href);
                        cleanURL.search = "";
                        link.href = cleanURL.toString();
                        navigator.clipboard.writeText(cleanURL.toString());
                    }
                }
            });
        });

        // Schedule a single batch flush
        if (!flushScheduled && pendingNodes.length > 0) {
            flushScheduled = true;
            requestIdleCallback(flushPendingNodes);
        }

        // Detect navigation changes (SPA)
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            applySettings();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// React to changes from the options page
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
        chrome.storage.local.get(null, storedOptions => {
            migrateStoredOptions(storedOptions).then(normalized => {
                mergeSettings(normalized);
                applySettings();
            });
        });
    }
});

/**
 * Notify background when focus is or isn't on a LinkedIn tab.
 * @param {boolean} isActive
 */
function notifyFocusChange(isActive) {
    try {
        chrome.runtime.sendMessage({ type: "linkedinFocus", isActive });
    } catch {
        // Service worker may be temporarily inactive; non-critical.
    }
}

// Notify on focus/blur changes
window.addEventListener("focus", () => notifyFocusChange(true));
window.addEventListener("blur", () => notifyFocusChange(false));

// Bootstrap the extension
(async () => {
    const lang = document.documentElement.lang?.slice(0, 2).toLowerCase() || 'en';
    const supported = ['en'];
    const selectedLang = supported.includes(lang) ? lang : 'en';

    try {
        const res = await fetch(chrome.runtime.getURL(`settings/${selectedLang}.json`));
        const data = await res.json();
        const POST_SELECTOR = 'div[data-id^="urn:li:"] div.feed-shared-update-v2';

        // Replace ${POST_SELECTOR} placeholder in any selector field
        data.forEach(group => {
            group.settings.forEach(setting => {
                if (setting.selector) {
                    if (Array.isArray(setting.selector)) {
                        setting.selector = setting.selector.map(sel => sel.replace(/\$\{POST_SELECTOR\}/g, POST_SELECTOR));
                    } else {
                        setting.selector = setting.selector.replace(/\$\{POST_SELECTOR\}/g, POST_SELECTOR);
                    }
                }
            });
        });

        settingsGroups = data;

        chrome.storage.local.get(null, storedOptions => {
            migrateStoredOptions(storedOptions).then(normalized => {
                mergeSettings(normalized);
                loadCSS();
                applySettings();
                observeMutations();
            });
        });
    } catch (err) {
        console.error('CleanedIn: Failed to load settings:', err);
    }

    notifyFocusChange(document.hasFocus());
})();