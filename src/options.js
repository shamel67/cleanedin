/**
 * @file options.js
 * @description 
 * Options page logic for CleanedIn. Initializes and renders the UI,
 * loads and stores user preferences (including custom filters),
 * syncs changes with chrome.storage, and provides validation.
 */

// Stores all current settings (standard and custom)
let globalOptions = {};
let settingsGroups = [];

/**
 * Migrate legacy stored values to current format.
 * Runs once on startup; writes corrections back to storage if needed.
 *  - Converts status:"true" (string) → true (boolean)
 *  - Maps cleanedIn:2 (deprecated Extreme mode) → 1 (Normal mode)
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

fetch(chrome.runtime.getURL(`settings/en.json`))
    .then(res => res.json())
    .then(data => {
        settingsGroups = data;

        // Load saved options from chrome.storage, migrating legacy values first
        chrome.storage.local.get(null, (storedOptions) => {
            migrateStoredOptions(storedOptions).then(normalized => {
                globalOptions = normalized;
                Object.keys(normalized).length === 0
                    ? initializeDefaults()
                    : initializeSettings();
            });
        });
    })
    .catch(err => {
        console.error("CleanedIn: Failed to load localized settings:", err);
    });

/**
 * Generate default options and persist to storage.
 */
function initializeDefaults() {
    const defaultSettings = {};
    document.getElementById("refreshMessage").style.display = "block";

    settingsGroups.forEach(group => {
        group.settings.forEach(setting => {
            const settingDefaults = { status: setting.status ?? false };
            if (setting.class) settingDefaults.class = setting.class;
            if (setting.color) settingDefaults.color = setting.color;
            if (setting.id.startsWith("custom_")) settingDefaults.selector = setting.selector;
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

        group.settings.forEach(setting => createSettingUI(setting, groupDiv));

        if (group.group === "Custom Filters") {
            const addButton = document.createElement("button");
            addButton.textContent = "+";
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
                class: value.class || "CleanedInCustom",
                color: value.color || "#0078D4",
                selector: value.selector || `div[data-id^="urn:li:"] div.feed-shared-update-v2:contains(/example/)`,
                status: value.status === true
            };
            createSettingUI(setting, customGroupDiv);
        });

}

/**
 * Render a single setting (checkbox, label, inputs for custom filters).
 * @param {Object} setting
 * @param {Element} groupDiv
 */
function createSettingUI(setting, groupDiv) {
    const isCustom = setting.id.startsWith("custom_");
    const div = document.createElement("div");
    div.className = isCustom ? "custom-setting-item single-row" : "setting-item";
    div.id = `wrapper_${setting.id}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = setting.id;
    checkbox.checked = globalOptions[setting.id]?.status ?? setting.status ?? false;

    checkbox.addEventListener("change", () => {
        const updatedSetting = { [setting.id]: { status: checkbox.checked } };
        if (checkbox.checked) {
            if (setting.class) updatedSetting[setting.id].class = setting.class;
            if (setting.color) updatedSetting[setting.id].color = setting.color;
        }

        chrome.storage.local.set(updatedSetting);

        if (isCustom) {
            const index = setting.id.split("_")[1];
            // Ensure inputs are correctly enabled/disabled when checkbox changes
            document.getElementById(`customRegex_${index}`).disabled = !checkbox.checked;
            document.getElementById(`customColor_${index}`).disabled = !checkbox.checked;
            validateAndSaveCustom(index);
        }
    });

    if (isCustom) {
        const index = setting.id.split("_")[1];

        // 1. Enable/Disable Checkbox
        div.appendChild(checkbox);

        // 2. Regex Input
        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.id = `customRegex_${index}`;
        textInput.value = extractRegexFromSelector(globalOptions[setting.id]?.selector || setting.selector || "");
        textInput.placeholder = "Regex pattern directly matches text...";
        textInput.disabled = !globalOptions[setting.id]?.status; // disabled if unchecked
        textInput.addEventListener("input", () => validateAndSaveCustom(index));
        div.appendChild(textInput);

        // 3. Color Picker
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.id = `customColor_${index}`;
        colorInput.value = globalOptions[setting.id]?.color || setting.color || "#D32727";
        colorInput.disabled = !globalOptions[setting.id]?.status; // disabled if unchecked
        colorInput.title = "Pick highlight tone (must be checked to edit)";
        colorInput.addEventListener("input", () => validateAndSaveCustom(index));
        div.appendChild(colorInput);

        // 4. Remove Button
        const removeBtn = document.createElement("button");
        removeBtn.innerHTML = "&#10006;"; // cross icon
        removeBtn.className = "remove-custom-button";
        removeBtn.title = "Delete filter";
        removeBtn.addEventListener("click", () => removeCustomFilter(setting.id));
        div.appendChild(removeBtn);

        // Error message container (hidden by default)
        const error = document.createElement("div");
        error.id = `regexErrorMessage_${index}`;
        error.className = "regex-error";
        error.textContent = "Invalid regular expression.";
        div.appendChild(error);
    } else {
        div.appendChild(checkbox);
        const label = document.createElement("label");
        label.htmlFor = setting.id;
        label.innerHTML = setting.label;
        div.appendChild(label);
    }

    groupDiv.insertBefore(div, groupDiv.querySelector(".add-custom-button"));
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
        if (regexInput.value.trim()) new RegExp(regexInput.value); // test validity

        chrome.storage.local.set({
            [`custom_${index}`]: {
                status: checkbox.checked,
                class: "CleanedInCustom",
                selector: `div[data-id^="urn:li:"] div.feed-shared-update-v2:contains(/${regexInput.value.trim()}/i)`,
                color: color.value
            }
        });
    } catch {
        regexInput.classList.add("invalid");
        error.style.display = "block";
    }
}

/**
 * Extract regex string from a :contains() selector.
 * @param {string} selector
 * @returns {string}
 */
function extractRegexFromSelector(selector) {
    const match = selector?.match(/:contains\(\/([^/]*)\/(?:[a-z]*)\)/);
    return match ? match[1] : "";
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
            class: "CleanedInCustom",
            color: "#0078D4",
            selector: `div[data-id^="urn:li:"] div.feed-shared-update-v2:contains(/example/)`,
            status: false
        };

        chrome.storage.local.set({ [newId]: newSetting }, () => {
            createSettingUI(newSetting, groupDiv);
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