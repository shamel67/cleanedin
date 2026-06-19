/**
 * @file storage.js
 * @description Shared storage utility for FeedSift.
 * Handles configuration persistence and schema migrations.
 */

/**
 * Migrate legacy stored values to current format.
 * Runs on startup; writes corrections back to storage if needed.
 * @param {Object} stored - Raw value from chrome.storage.local
 * @returns {Promise<Object>} Normalized options object
 */
export function migrateStoredOptions(stored) {
    const patches = {};
    const removals = [];

    // Remove legacy master toggle key (the extension is now always active)
    if ('FeedSift' in stored) {
        removals.push('FeedSift');
    }

    // Normalize any setting whose status is the string "true" or "false"
    Object.entries(stored).forEach(([id, value]) => {
        if (id === "FeedSift" || typeof value !== "object" || value === null) return;
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
            ? () => chrome.runtime.lastError ? console.error(chrome.runtime.lastError) : chrome.storage.local.remove(removals, apply)
            : apply;

        if (Object.keys(patches).length > 0) {
            chrome.storage.local.set(patches, afterSet);
        } else {
            afterSet();
        }
    });
}

/**
 * Unified getter for storage that always returns normalized data.
 * @returns {Promise<Object>}
 */
export async function getOptions() {
    return new Promise(resolve => {
        chrome.storage.local.get(null, stored => {
            migrateStoredOptions(stored).then(resolve);
        });
    });
}
