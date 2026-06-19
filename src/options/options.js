import { getOptions } from '../lib/storage.js';
import { createSettingUI, extractRegexFromSelector } from './ui.js';

/**
 * @file options.js
 * @description 
 * Options page logic for FeedSift. Initializes and renders the UI,
 * loads and stores user preferences (including custom filters),
 * syncs changes with chrome.storage, and provides validation.
 */

// Stores all current settings (standard and custom)
let globalOptions = {};
let settingsGroups = [];
let POST_SELECTOR = '';

function escapeRegexLiteralForSelector(pattern) {
    return pattern.replace(/\//g, "\\/");
}

function buildCustomSelector(pattern) {
    return `${POST_SELECTOR}:contains(/${escapeRegexLiteralForSelector(pattern)}/i)`;
}

// ── Inspector / Debug Mode toggle ────────────────────────────────────────────

/**
 * Wire up the inspector mode checkbox.
 * Reads the persisted state from storage and writes changes back.
 */
function initInspectorToggle() {
    const checkbox = document.getElementById('inspectorToggle');
    if (!checkbox) return;

    const setStatus = (active) => {
        checkbox.checked = active;
    };

    // Read persisted state
    chrome.storage.local.get('inspectorMode', ({ inspectorMode }) => {
        setStatus(inspectorMode === true);
    });

    // Write on change
    checkbox.addEventListener('change', () => {
        const active = checkbox.checked;
        chrome.storage.local.set({ inspectorMode: active });
        setStatus(active);
    });
}

initInspectorToggle();

// ─────────────────────────────────────────────────────────────────────────────

fetch(chrome.runtime.getURL(`assets/settings/en.json`))
    .then(res => res.json())
    .then(data => {
        settingsGroups = data.groups;
        POST_SELECTOR = data.POST_SELECTOR;

        // Load saved options from chrome.storage, migrating legacy values first
        getOptions().then(normalized => {
            globalOptions = normalized;
            Object.keys(normalized).length === 0
                ? initializeDefaults()
                : initializeSettings();
        });
    })
    .catch(err => {
        console.error("FeedSift: Failed to load localized settings:", err);
    });

/**
 * Generate default options and persist to storage.
 */
function initializeDefaults() {
    const defaultSettings = {};

    settingsGroups.forEach(group => {
        group.settings.forEach(setting => {
            const settingDefaults = { status: setting.status ?? false };
            if (setting.class) settingDefaults.class = setting.class;
            if (setting.color) settingDefaults.color = setting.color;
            if (setting.threshold !== undefined) settingDefaults.threshold = setting.threshold;

            if (setting.id.startsWith("custom_") && setting.selector) {
                // Ensure placeholders are resolved before persisting
                settingDefaults.selector = setting.selector.replace(/\$\{POST_SELECTOR\}/g, POST_SELECTOR);
            }

            defaultSettings[setting.id] = settingDefaults;
        });
    });

    chrome.storage.local.set(defaultSettings, initializeSettings);
}

/**
 * Render the UI and wire up all elements and stored data.
 */
function initializeSettings() {
    const container = document.getElementById("settingsContainer");

    // Render all settings groups
    settingsGroups.forEach(group => {
        const groupDiv = document.createElement("div");
        groupDiv.className = "settings-group";

        // Use the "collapsed" field from the JSON to drive initial state
        if (group.collapsed) {
            groupDiv.classList.add("collapsed");
        }

        const groupToggle = document.createElement("h3");
        groupToggle.className = "group-toggle";
        groupToggle.textContent = group.group;

        // Make collapsible
        groupToggle.addEventListener("click", () => {
            groupDiv.classList.toggle("collapsed");
        });

        groupDiv.appendChild(groupToggle);

        group.settings.forEach(setting => createSettingUI(
            setting,
            groupDiv,
            globalOptions,
            handleSettingChange,
            removeCustomFilter,
            validateAndSaveCustom
        ));

        if (group.group === "Custom Filters") {
            const addButton = document.createElement("button");
            addButton.textContent = "Add Filter";
            addButton.className = "add-custom-button";
            addButton.addEventListener("click", () => addNewCustomFilter(groupDiv));
            groupDiv.appendChild(addButton);
        }

        container.appendChild(groupDiv);
    });

    // Re-render stored but undefined custom filters (not hardcoded in settings.json)
    const definedSettingIds = new Set(
        settingsGroups.flatMap(group => group.settings.map(s => s.id))
    );

    const customGroupDiv = Array.from(container.children).find(groupDiv =>
        groupDiv.querySelector("h3")?.textContent === "Custom Filters"
    );

    Object.entries(globalOptions)
        .filter(([key, value]) =>
            key.startsWith("custom_") &&
            value.status !== "delete" &&
            !definedSettingIds.has(key)
        )
        .forEach(([key, value]) => {
            const index = key.split("_")[1];
            const setting = {
                id: key,
                label: `Custom filter ${index}`,
                class: value.class || "FeedSiftCustom",
                color: value.color || "#0078D4",
                selector: value.selector || buildCustomSelector("example"),
                status: value.status === true
            };
            createSettingUI(
                setting,
                customGroupDiv,
                globalOptions,
                handleSettingChange,
                removeCustomFilter,
                validateAndSaveCustom
            );
        });
}

/**
 * Handle checkbox or slider changes and persist to storage.
 * @param {Object} setting 
 * @param {boolean} isChecked 
 * @param {number} [threshold]
 */
function handleSettingChange(setting, isChecked, threshold) {
    const updatedSetting = { [setting.id]: { status: isChecked } };
    if (threshold !== undefined) updatedSetting[setting.id].threshold = threshold;

    if (isChecked) {
        if (setting.class) updatedSetting[setting.id].class = setting.class;
        if (setting.color) updatedSetting[setting.id].color = setting.color;
    }
    chrome.storage.local.set(updatedSetting);
}

/**
 * Validate custom regex input, update UI, and persist.
 * @param {string|number} index
 */
function validateAndSaveCustom(index) {
    const regexInput = document.getElementById(`customRegex_${index}`);
    const error = document.getElementById(`regexErrorMessage_${index}`);
    const checkbox = document.getElementById(`custom_${index}`);

    try {
        regexInput.classList.remove("invalid");
        error.style.display = "none";

        const color = document.getElementById(`customColor_${index}`);
        const pattern = regexInput.value.trim();
        if (checkbox.checked && !pattern) {
            throw new Error("Empty custom regex");
        }
        if (pattern) new RegExp(pattern); // test validity

        const id = `custom_${index}`;
        const updated = {
            [id]: {
                status: checkbox.checked && !!pattern,
                class: "FeedSiftCustom",
                selector: buildCustomSelector(pattern || "(?!)"),
                color: color.value
            }
        };

        globalOptions[id] = updated[id];
        chrome.storage.local.set(updated);
    } catch {
        regexInput.classList.add("invalid");
        error.style.display = "block";
    }
}

/**
 * Create and save a new custom filter slot.
 * @param {Element} groupDiv
 */
function addNewCustomFilter(groupDiv) {
    chrome.storage.local.get(null, (data) => {
        const customKeys = Object.keys(data).filter(k => k.startsWith("custom_"));
        const nextIndex = customKeys.length > 0
            ? Math.max(...customKeys.map(k => parseInt(k.split("_")[1]))) + 1
            : 1;
        const newId = `custom_${nextIndex}`;

        const newSetting = {
            id: newId,
            label: `Custom filter ${nextIndex}`,
            class: "FeedSiftCustom",
            color: "#0078D4",
            selector: buildCustomSelector("example"),
            status: false
        };

        chrome.storage.local.set({ [newId]: newSetting }, () => {
            globalOptions[newId] = newSetting;
            createSettingUI(
                newSetting,
                groupDiv,
                globalOptions,
                handleSettingChange,
                removeCustomFilter,
                validateAndSaveCustom
            );
        });
    });
}

/**
 * Mark a custom filter for deletion and remove from UI.
 * @param {string} id
 */
function removeCustomFilter(id) {
    chrome.storage.local.get(id, (data) => {
        const current = data[id];
        if (!current) return;

        chrome.storage.local.set({ [id]: { ...current, status: "delete" } }, () => {
            document.getElementById(`wrapper_${id}`)?.remove();
        });
    });
}
