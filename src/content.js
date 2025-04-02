/**
 * @file content.js
 * @description 
 * Injected into LinkedIn pages, this script filters or restyles content 
 * based on user-defined settings. It observes DOM changes, applies 
 * filters dynamically, updates the badge with a "noise ratio," and 
 * rewrites copied LinkedIn post URLs to remove tracking.
 */

const ELEMENT_CLASS = "CleanedIn";
const REMOVE_CLASS = "CleanedInRemove";

let cleanedIn = 0;
let options = {};
let lastUrl = location.href;
let messagingAvailable = true;

/**
 * Inject external CSS only once
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
 * Flatten settingsGroups to a flat key-value map
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
 * Merge stored options with flattened settings
 */
function mergeSettings(storedOptions) {
    const flatSettings = flattenSettings(settingsGroups);
    const merged = {};

    Object.entries(storedOptions).forEach(([id, stored]) => {
        if (id === "cleanedIn") return;

        const fallback = flatSettings[id] || {};
        const mergedSetting = { status: stored.status ?? false };

        if (stored.selector || fallback.selector) mergedSetting.selector = stored.selector || fallback.selector;
        if (stored.class || fallback.class) mergedSetting.class = stored.class || fallback.class;
        if (stored.color || fallback.color) mergedSetting.color = stored.color || fallback.color;

        merged[id] = mergedSetting;
    });

    options = merged;
    cleanedIn = storedOptions.cleanedIn ?? 1;
}

/**
 * Apply filters to all DOM elements
 */
function applySettings() {
    requestAnimationFrame(() => {
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

        document.querySelectorAll('body *').forEach(processNode);
    });
}

/**
 * Style or unstyle a specific element
 */
function processElement(node, settingId, setting) {
    if (cleanedIn === 0 || !setting.status) {
        node.classList.remove(ELEMENT_CLASS, REMOVE_CLASS, setting.class);
        node.style.removeProperty("color");
        node.removeAttribute("data-cleanedin");
        return;
    }

    if (setting.class === "CleanedInCustom") {
        node.classList.remove(ELEMENT_CLASS, REMOVE_CLASS);
        node.classList.add(setting.class);
        node.style.color = setting.color;
    } else {
        node.classList.remove(cleanedIn === 1 ? REMOVE_CLASS : ELEMENT_CLASS);
        node.classList.add(cleanedIn === 1 ? ELEMENT_CLASS : REMOVE_CLASS);
        node.style.removeProperty("color");
    }

    node.setAttribute("data-cleanedin", settingId);
}

/**
 * Throttle a function to run at most once per delay
 */
function throttle(fn, delay) {
    let lastCall = 0;
    return (...args) => {
        const now = Date.now();
        if (now - lastCall >= delay && messagingAvailable) {
            lastCall = now;
            fn.apply(this, args);
        }
    };
}

const throttledUpdateBadge = throttle(updateBadge, 18000);

/**
 * Calculate and update badge text
 */
function updateBadge() {
    requestAnimationFrame(() => {
        const cleanedCount = document.querySelectorAll(`.${ELEMENT_CLASS},.${REMOVE_CLASS}`).length;
        const cleanedPostCount = document.querySelectorAll(`div[data-id] .${ELEMENT_CLASS},div[data-id] .${REMOVE_CLASS}`).length;
        const totalCount = document.querySelectorAll('div[data-id]').length + cleanedCount - cleanedPostCount;
        const ratio = totalCount ? Math.round((cleanedCount / totalCount) * 100) : 0;

        try {
            chrome.runtime.sendMessage({
                type: "updateBadge",
                text: ratio > 0 ? `${ratio}%` : ""
            });
        } catch {
            messagingAvailable = false;
        }
    });
}

/**
 * Process a single node by checking all settings
 */
function processNode(node) {
    if (!(node instanceof Element)) return;

    requestIdleCallback(() => {
        Object.entries(options).forEach(([settingId, setting]) => {
            if (settingId === "ai") {
                const posts = node.querySelectorAll('div[data-id^="urn:li:"] div.feed-shared-update-v2:not([data-cleanedin-ai-check])');
                posts.forEach(post => {
                    const postTextEl = post.querySelector('.update-components-update-v2__commentary .tvm-parent-container');
                    if(!postTextEl) return;
                    const postText = postTextEl.innerText.trim();
                    const analysisResult = aiDetector(postText);
                    if (analysisResult.isPotentiallyAI) {
                        console.info(post,analysisResult);
                        post.classList.add('CleanedInAI');
                        post.setAttribute('data-cleanedin', 'ai');
                    }
                    post.setAttribute('data-cleanedin-ai-check', 'true');
                });
            } else if (setting.selector) {
                node.querySelectorAllContains(setting.selector).forEach(el => {
                    processElement(el, settingId, setting);
                });
            }
        });

        throttledUpdateBadge();
    });
}

/**
 * Observe new elements and changes in DOM
 */
function observeMutations() {
    const observer = new MutationObserver(mutations => {
        mutations.forEach(({ addedNodes }) => {
            addedNodes.forEach(node => {
                if (!(node instanceof Element)) return;

                processNode(node);

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
            mergeSettings(storedOptions);
            applySettings();
        });
    }
});

// Bootstrap the extension
(async () => {
  const lang = document.documentElement.lang?.slice(0, 2).toLowerCase() || 'en';
  const supported = ['en'];
  const selectedLang = supported.includes(lang) ? lang : 'en';

  try {
    const res = await fetch(chrome.runtime.getURL(`settings/${selectedLang}.json`));
    const data = await res.json();
    const POST_SELECTOR = 'div[data-id^="urn:li:"] div.feed-shared-update-v2';
    // Replace ${POST_SELECTOR} in any .selector field
    data.forEach(group => {
      group.settings.forEach(setting => {
        if (setting.selector) {
          setting.selector = setting.selector.replace(/\$\{POST_SELECTOR\}/g, POST_SELECTOR);
        }
      });
    });
    settingsGroups = data;
    // run after settingsGroups is defined
    chrome.storage.local.get(null, storedOptions => {
        mergeSettings(storedOptions);
        loadCSS();
        applySettings();
        observeMutations();
    });
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
})();