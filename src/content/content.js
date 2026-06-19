/**
 * @file content.js
 * @description 
 * Injected into LinkedIn pages, this script filters or restyles content
 * based on user-defined settings. It observes DOM changes, applies 
 * filters dynamically, updates the badge with a "noise ratio," and 
 * rewrites copied LinkedIn post URLs to remove tracking.
 */

/** CSS class applied to matched built-in elements in hide mode. */
const ELEMENT_CLASS = "FeedSift";
const FILTER_CLASSES = [ELEMENT_CLASS, "FeedSiftCustom", "FeedSiftHighlight", "FeedSiftInspect", "FeedSiftInspectCustom"];
const FILTER_SELECTOR = FILTER_CLASSES.map(className => `.${className}`).join(", ");

/** Declared here; populated after settings JSON is fetched. */
let settingsGroups = [];

let options = {};
let lastUrl = location.href;
let inspectorMode = false;

function debugLog(...args) {
    if (inspectorMode) {
        console.debug(...args);
    }
}

/** Base selector for LinkedIn posts, loaded from settings JSON. */
let POST_SELECTOR = '';

const scheduleIdle = window.requestIdleCallback
    ? callback => window.requestIdleCallback(callback)
    : callback => window.setTimeout(callback, 0);

/**
 * Inject external CSS only once.
 */
function loadCSS() {
    if (!document.getElementById("FeedSift-style")) {
        const link = document.createElement("link");
        link.id = "FeedSift-style";
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = chrome.runtime.getURL("content/content.css");
        document.head.appendChild(link);
    }
}

/**
 * Flatten settingsGroups to a flat key-value map.
 */
function flattenSettings(settingsGroups) {
    const flatSettings = {};

    settingsGroups.forEach(group => {
        group.settings.forEach(({ id, selector, status, class: className, color, threshold }) => {
            const filtered = {};
            if (selector) filtered.selector = selector;
            if (status !== undefined) filtered.status = status;
            if (className) filtered.class = className;
            if (color) filtered.color = color;
            if (threshold !== undefined) filtered.threshold = threshold;

            if (Object.keys(filtered).length > 0) {
                flatSettings[id] = filtered;
            }
        });
    });

    return flatSettings;
}

/**
 * Merge stored options with flattened settings.
 * @param {Object} storedOptions - Normalized value from chrome.storage.local
 */
function mergeSettings(storedOptions) {
    const flatSettings = flattenSettings(settingsGroups);
    const merged = {};
    const allIds = new Set([...Object.keys(flatSettings), ...Object.keys(storedOptions)]);

    allIds.forEach(id => {
        const fallback = flatSettings[id] || {};
        const stored = storedOptions[id] || {};

        // Use stored status if available, otherwise default to JSON status or false
        const mergedSetting = { status: stored.status ?? fallback.status ?? false };

        const rawSelector = stored.selector || fallback.selector;
        if (rawSelector) {
            if (Array.isArray(rawSelector)) {
                mergedSetting.selector = rawSelector.map(s => s.replace(/\$\{POST_SELECTOR\}/g, POST_SELECTOR));
            } else {
                mergedSetting.selector = rawSelector.replace(/\$\{POST_SELECTOR\}/g, POST_SELECTOR);
            }
        }

        if (stored.class || fallback.class) mergedSetting.class = stored.class || fallback.class;
        if (stored.color || fallback.color) mergedSetting.color = stored.color || fallback.color;

        const threshold = stored.threshold !== undefined ? stored.threshold : fallback.threshold;
        if (threshold !== undefined) {
            mergedSetting.threshold = threshold;
        }

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
        const root = document.getElementById("main") || document.body;

        // When inspector mode is toggled off, scrub all inspector artifacts
        if (!inspectorMode) {
            document.querySelectorAll('.FeedSiftInspect').forEach(el => {
                el.classList.remove('FeedSiftInspect', 'FeedSiftInspectCustom');
                el.style.removeProperty("--feedsift-accent");
                el.querySelector('.FeedSiftInspect-label')?.remove();
            });
        }

        clearFilterState(root);
        if (!options.ai?.status) {
            clearAIState();
        }

        // Clean up any settings flagged for deletion
        const toDelete = [];
        Object.entries(options).forEach(([id, setting]) => {
            if (setting.status === "delete") {
                document.querySelectorAll(`[data-FeedSift="${id}"]`).forEach(el => {
                    if (setting.class) el.classList.remove(setting.class);
                    if (setting.color) el.style.removeProperty("color");
                    el.style.removeProperty("--feedsift-accent");
                    el.removeAttribute("data-FeedSift");
                });
                toDelete.push(id);
            }
        });

        if (toDelete.length > 0) {
            chrome.storage.local.remove(toDelete, () => {
                toDelete.forEach(id => delete options[id]);
            });
        }

        // Apply processing starting from root
        processNode(root);
    });
}

function clearFilterState(root) {
    const elements = [];
    if (root.matches?.(FILTER_SELECTOR)) {
        elements.push(root);
    }
    root.querySelectorAll?.(FILTER_SELECTOR).forEach(el => elements.push(el));

    elements.forEach(el => {
        el.classList.remove(...FILTER_CLASSES);
        el.style.removeProperty("color");
        el.style.removeProperty("--feedsift-accent");
        el.removeAttribute("data-FeedSift");
        el.querySelectorAll('.FeedSiftInspect-label').forEach(label => label.remove());
    });
}

function clearAIState() {
    document.querySelectorAll('.FeedSiftAI, .FeedSiftAI-popup').forEach(el => el.remove());
    document.querySelectorAll('.FeedSiftAI-highlight').forEach(el => el.classList.remove('FeedSiftAI-highlight'));
    document.querySelectorAll('[data-FeedSift-ai-check]').forEach(el => el.removeAttribute('data-FeedSift-ai-check'));
}

function isCustomFilterId(settingId) {
    return /^custom_\d+$/.test(settingId);
}

function isCustomFilterMatch(node) {
    return isCustomFilterId(node.getAttribute("data-FeedSift") || "");
}

/**
 * Style or un-style a specific element based on its setting status.
 * @param {Element} node
 * @param {string} settingId
 * @param {Object} setting
 * @param {string} matchedSelector
 */
function processElement(node, settingId, setting, matchedSelector) {
    node.classList.remove('FeedSiftAI-highlight');
    node.querySelectorAll('.FeedSiftAI').forEach(icon => icon.remove());

    if (inspectorMode && setting.status) {
        // Inspector: highlight + label chip, no dimming
        node.classList.remove(ELEMENT_CLASS, "FeedSiftCustom", "FeedSiftHighlight", "FeedSiftInspectCustom");
        node.style.removeProperty("color");
        if (setting.class === "FeedSiftCustom" && setting.color) {
            node.style.setProperty("--feedsift-accent", setting.color);
            node.classList.add("FeedSiftInspectCustom");
        } else {
            node.style.removeProperty("--feedsift-accent");
            node.classList.remove("FeedSiftInspectCustom");
        }
        node.classList.add("FeedSiftInspect");
        node.setAttribute("data-FeedSift", settingId);

        // Add label chip only once per element
        let chip = node.querySelector('.FeedSiftInspect-label');
        if (!chip) {
            chip = document.createElement('span');
            chip.className = 'FeedSiftInspect-label';
            node.prepend(chip);
        }

        // Update chip content with ID and matching selector
        chip.textContent = matchedSelector ? `${settingId} > ${matchedSelector}` : settingId;
        return;
    }

    // Normal (non-inspector) path — always remove inspector artifacts first
    node.classList.remove("FeedSiftInspect", "FeedSiftInspectCustom");
    node.querySelector('.FeedSiftInspect-label')?.remove();

    if (!setting.status) {
        node.classList.remove(...FILTER_CLASSES);
        node.style.removeProperty("color");
        node.style.removeProperty("--feedsift-accent");
        node.removeAttribute("data-FeedSift");
        return;
    }

    if (setting.class === "FeedSiftCustom" || setting.class === "FeedSiftHighlight") {
        node.classList.remove(ELEMENT_CLASS);
        node.classList.add(setting.class);
        if (setting.color) {
            node.style.setProperty("--feedsift-accent", setting.color);
            node.style.removeProperty("color");
        } else {
            node.style.removeProperty("color");
            node.style.removeProperty("--feedsift-accent");
        }
    } else {
        node.classList.remove(ELEMENT_CLASS, "FeedSiftCustom", "FeedSiftHighlight");
        node.classList.add(ELEMENT_CLASS);
        node.style.removeProperty("color");
        node.style.removeProperty("--feedsift-accent");
    }

    node.setAttribute("data-FeedSift", settingId);
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

const throttledUpdateBadge = throttle(updateBadge, 3000);

/**
 * Calculate and update badge text (noise ratio).
 * Sends a message to the background service worker; silently retries on the
 * next throttled call if the worker is temporarily asleep.
 */
function updateBadge() {
    requestAnimationFrame(() => {
        // Count all cleaned elements (standard, highlights, and custom)
        const cleanedSelector = `.${ELEMENT_CLASS}, .FeedSiftInspect, .FeedSiftCustom, .FeedSiftHighlight`;
        const cleanedElements = document.querySelectorAll(cleanedSelector);
        const cleanedCount = cleanedElements.length;

        // Use the defined POST_SELECTOR to find all items that qualify as a "post"
        // This is more reliable than the legacy div[data-id]
        const allPosts = POST_SELECTOR ? document.querySelectorAll(POST_SELECTOR) : [];

        // Identification of posts that are marked as cleaned
        const cleanedPosts = Array.from(allPosts).filter(post =>
            post.matches(cleanedSelector) || post.querySelector(cleanedSelector)
        );

        const cleanedPostCount = cleanedPosts.length;

        // Total = All potential posts + Cleaned items that ARE NOT posts (e.g. sidebar ads/modules)
        const totalCount = allPosts.length + (cleanedCount - cleanedPostCount);
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
 *
 * LinkedIn now renders posts via incremental/hydrated DOM updates: the outer
 * container (e.g. div[role="listitem"]) is inserted first, then inner content
 * (including label text like "Suggested" or "Promoted") is added via separate
 * mutations. If we ran processNode() on those deep inner nodes, the
 * querySelectorAllContains() calls would never find the ancestor container that
 * needs to be grayed out. Walking each added node up to the direct child of
 * #main gives querySelectorAllContains() the same vantage point as running it
 * from the document root (which the user confirmed works correctly).
 */
function flushPendingNodes() {
    flushScheduled = false;
    const nodes = pendingNodes.splice(0);
    scheduleIdle(() => {
        const main = document.getElementById('main') || document.body;
        const scanRoots = new Set();

        nodes.forEach(node => {
            if (!(node instanceof Element)) return;

            // Performance: Walk up until we're a direct child of #main (or body as fallback).
            // Skip traversal if an ancestor is already marked as a scan root in this batch.
            let el = node;
            while (el.parentElement && el.parentElement !== main && el.parentElement !== document.body) {
                el = el.parentElement;
                if (scanRoots.has(el)) return;
            }
            scanRoots.add(el);
        });

        scanRoots.forEach(root => processNode(root));
        throttledUpdateBadge();
    });
}

/**
 * Process a single node by checking all active settings.
 * @param {Element} node
 */
function processNode(node) {
    if (!(node instanceof Element)) return;

    // 1. Process non-AI filters first (so elements matched by other rules get flagged with 'data-FeedSift')
    Object.entries(options).forEach(([settingId, setting]) => {
        if (settingId !== "ai" && setting.selector && setting.status === true) {
            const selectorArray = Array.isArray(setting.selector) ? setting.selector : [setting.selector];
            selectorArray.forEach(selector => {
                // Check descendants
                node.querySelectorAllContains(selector).forEach(el => {
                    if (isCustomFilterId(settingId) && isCustomFilterMatch(el)) return;
                    processElement(el, settingId, setting, selector);
                });

                // Check if the node ITSELF matches efficiently
                if (
                    node.matchesContains(selector) &&
                    !(isCustomFilterId(settingId) && isCustomFilterMatch(node))
                ) {
                    processElement(node, settingId, setting, selector);
                }
            });
        }
    });

    // 2. Process AI filter (skipping elements already handled by other rules)
    const aiSetting = options.ai;
    if (aiSetting && aiSetting.status === true) {
        const candidates = [];
        if (POST_SELECTOR) {
            // Find all candidate posts (the node itself, plus any descendants)
            const posts = node.matches?.(POST_SELECTOR) ? [node] : [];
            node.querySelectorAll(POST_SELECTOR).forEach(post => posts.push(post));

            posts.forEach(post => {
                // Skip if already checked for AI or handled/filtered by another rule
                if (!post.hasAttribute('data-FeedSift-ai-check') &&
                    !post.hasAttribute('data-FeedSift') &&
                    !post.querySelector('[data-FeedSift]')) {
                    candidates.push(post);
                }
            });
        }

        if (candidates.length > 0) {
            debugLog(`FeedSift: Found ${candidates.length} candidate posts for formulaic-writing check.`);
        }

        candidates.forEach(wrapper => {
            const postTextEl = wrapper.querySelector("p[componentkey*='feed-commentary'], p[componentkey*='translatable-commentary']");
            if (!postTextEl) {
                debugLog("FeedSift: Could not find text element for post", wrapper);
            }
            processAIElement(wrapper, postTextEl);
        });
    }
}

/**
 * Find a stable anchor for the AI icon without relying on obfuscated classes.
 * Looks for author profile links and structural spacers (middle dots).
 * @param {Element} container 
 * @returns {Element|null}
 */
function findActorAnchor(container) {
    // 1. Try to find the supplementary info span (common even if class is partial/obfuscated)
    const supplementaryInfo = container.querySelector('span.update-components-actor__supplementary-actor-info')
        || container.querySelector('[class*="supplementary-actor-info"]');
    if (supplementaryInfo) return supplementaryInfo;

    // 2. Look for the "middle dot" which typically separates name/headline from time
    const spans = Array.from(container.querySelectorAll('span'));
    const metaSpan = spans.find(span => span.textContent.includes(' • '));
    if (metaSpan) return metaSpan;

    // 3. Fallback to the first author profile link's parent
    const authorLink = container.querySelector('a[href*="/in/"]');
    if (authorLink) {
        // Try to find a sibling or parent to anchor the icon
        return authorLink.nextElementSibling || authorLink.parentElement;
    }

    return null;
}

function processAIElement(container, textEl) {
    if (!textEl || container.hasAttribute('data-FeedSift-ai-check')) return;

    const text = (textEl.innerText || textEl.textContent || "").trim();
    if (!text) {
        debugLog("FeedSift: Post text is empty, skipping formulaic-writing check.");
        container.setAttribute('data-FeedSift-ai-check', 'true');
        return;
    }

    const analysis = aiDetector(text);
    const threshold = options.ai?.threshold ?? 2.5;

    debugLog(`FeedSift: Formulaic-writing score: ${analysis.score.toFixed(2)} (Threshold: ${threshold}) | Text: "${text.substring(0, 50)}..."`);

    // Only proceed if score meets threshold
    if (analysis.score < threshold) {
        container.setAttribute('data-FeedSift-ai-check', 'true');
        return;
    }

    debugLog(`FeedSift: Formulaic-writing signal meeting threshold (${analysis.score}) found. Placing icon.`);
    container.classList.add('FeedSiftAI-highlight');

    // Use robust structural anchor finding
    const iconAnchor = findActorAnchor(container);

    if (!iconAnchor) {
        debugLog("FeedSift: Could not find stable icon anchor for formulaic-writing icon placement.");
    }

    if (iconAnchor && !iconAnchor.querySelector('.FeedSiftAI')) {
        const icon = document.createElement('span');
        icon.className = 'FeedSiftAI';
        icon.textContent = '✨';

        let popup = null;
        let hideTimeout = null;

        const removePopup = () => {
            if (popup) {
                popup.remove();
                popup = null;
            }
        };

        const startHideTimer = () => {
            hideTimeout = setTimeout(removePopup, 300);
        };

        const clearHideTimer = () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
        };

        icon.onmouseenter = () => {
            clearHideTimer();
            if (!popup) {
                popup = showAIPopup(icon, analysis);
                popup.onmouseenter = clearHideTimer;
                popup.onmouseleave = startHideTimer;
            }
        };

        icon.onmouseleave = startHideTimer;

        iconAnchor.appendChild(icon);
    }

    container.setAttribute('data-FeedSift-ai-check', 'true');
}

/**
 * Show a small popup with AI detection details.
 * @param {Element} anchor 
 * @param {Object} analysis 
 * @returns {Element} The created popup element
 */
function showAIPopup(anchor, analysis) {
    // Remove existing popups
    document.querySelectorAll('.FeedSiftAI-popup').forEach(p => p.remove());

    const popup = document.createElement('div');
    popup.className = 'FeedSiftAI-popup';

    const content = document.createElement('div');
    content.className = 'FeedSiftAI-popup-content';
    content.innerHTML = `
        <div class="FeedSiftAI-popup-header">
            <strong>Formulaic Writing Signal</strong>
            <span class="FeedSiftAI-score-badge">${analysis.score.toFixed(1)}</span>
        </div>
        <div class="FeedSiftAI-reasons-title">Matched signals:</div>
        <ul class="FeedSiftAI-reasons-list">
            ${analysis.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
        <div class="FeedSiftAI-popup-footer">FeedSift Signal Check</div>
    `;

    popup.appendChild(content);
    document.body.appendChild(popup);

    // Position popup near the icon
    const rect = anchor.getBoundingClientRect();
    popup.style.top = `${rect.top + window.scrollY + 25}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;

    return popup;
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
                const alert = node.closest?.('div[role="alert"]');
                if (options.links?.status && alert) {
                    const link = alert.querySelector('a[href*="//www.linkedin.com/posts/"]');
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
            scheduleIdle(flushPendingNodes);
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
        // Inspector mode toggled from options page
        if (changes.inspectorMode) {
            inspectorMode = changes.inspectorMode.newValue === true;
            applySettings();
            return;
        }

        chrome.storage.local.get(null, storedOptions => {
            mergeSettings(storedOptions);
            if (changes.ai) clearAIState();
            applySettings();
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
        const res = await fetch(chrome.runtime.getURL(`assets/settings/${selectedLang}.json`));
        const data = await res.json();

        POST_SELECTOR = data.POST_SELECTOR;
        settingsGroups = data.groups;

        chrome.storage.local.get(null, storedOptions => {
            // Read inspector mode before first render
            inspectorMode = storedOptions.inspectorMode === true;

            // Migration is handled in background/options, but let's be safe
            mergeSettings(storedOptions);
            loadCSS();
            applySettings();
            observeMutations();
            updateBadge();
        });
    } catch (err) {
        console.error('FeedSift: Failed to load settings:', err);
    }

    notifyFocusChange(document.hasFocus());
})();
