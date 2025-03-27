/**
 * @file options.js
 * @description 
 * Options page logic for CleanedIn. Initializes and renders the UI,
 * loads and stores user preferences (including custom filters),
 * syncs changes with chrome.storage, and provides validation.
 */

/**
 * @file en.js
 * @description
 * settingsGroups holds the status configuration for the extension.
 * Each group represents a category (Privacy, Recommendations, etc.)
 * and contains an array of settings. Each setting may define:
 * - id: a unique identifier for the setting.
 * - label: the text (or HTML) shown to the user.
 * - selector: an alternative CSS selector for sidebar items.
 * - class: a special CSS class to add when the setting is enabled.
 * - color: the color of custom selectors
 * - status: the status value (true/false) if not present in storage.
 */

// Stores all current settings (standard and custom)
let globalOptions = {};
let settingsGroups = [];

fetch(chrome.runtime.getURL(`settings/en.json`))
  .then(res => res.json())
  .then(data => {
    settingsGroups = data;

    // Load saved options from chrome.storage
    chrome.storage.local.get(null, (storedOptions) => {
      globalOptions = storedOptions;
      Object.keys(storedOptions).length === 0
        ? initializeDefaults()
        : initializeSettings();
    });
  })
  .catch(err => {
    console.error("Failed to load localized settings:", err);
  });

/**
 * Generate default options and persist to storage
 */
function initializeDefaults() {
    const defaultSettings = { cleanedIn: 1 };
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
 * Render the UI and wire up all elements and stored data
 */
function initializeSettings() {
    const masterToggle = document.getElementById("cleanedIn");
    const container = document.getElementById("settingsContainer");

    // Render all settings groups
    settingsGroups.forEach(group => {
        const groupDiv = document.createElement("div");
        groupDiv.className = "settings-group";
        if (["Recommendations", "Celebrations", "Engagement", "Reactions"].includes(group.group)) {
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

    // Re-render stored but undefined custom filters (not hardcoded in settings.js)
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

    // Master toggle slider
    masterToggle.value = globalOptions.cleanedIn ?? 1;
    updateSliderUI(parseInt(masterToggle.value));
    updateCheckboxState(masterToggle.value);

    masterToggle.addEventListener("input", function () {
        const newValue = parseInt(this.value);
        updateSliderUI(newValue);
        updateCheckboxState(newValue);
        chrome.storage.local.set({ cleanedIn: newValue });
    });
}

/**
 * Render a single setting (checkbox, label, inputs for custom filters)
 */
function createSettingUI(setting, groupDiv) {
    const div = document.createElement("div");
    div.className = "setting-item";
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

        if (setting.id.startsWith("custom_")) {
            const index = setting.id.split("_")[1];
            document.getElementById(`customRegex_${index}`).disabled = !checkbox.checked;
            document.getElementById(`customColor_${index}`).disabled = !checkbox.checked;
            validateAndSaveCustom(index);
        }
    });

    div.appendChild(checkbox);

    if (setting.id.startsWith("custom_")) {
        const index = setting.id.split("_")[1];

        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.id = `customRegex_${index}`;
        textInput.value = extractRegexFromSelector(globalOptions[setting.id]?.selector || setting.selector || "");
        textInput.disabled = !globalOptions[setting.id]?.status;
        textInput.addEventListener("input", () => validateAndSaveCustom(index));
        div.appendChild(textInput);

        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.id = `customColor_${index}`;
        colorInput.value = globalOptions[setting.id]?.color || setting.color || "#D32727";
        colorInput.disabled = !globalOptions[setting.id]?.status;
        colorInput.addEventListener("input", () => validateAndSaveCustom(index));
        div.appendChild(colorInput);

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "-";
        removeBtn.className = "remove-custom-button";
        removeBtn.title = "Remove this custom filter";
        removeBtn.addEventListener("click", () => removeCustomFilter(setting.id));
        div.appendChild(removeBtn);

        const error = document.createElement("div");
        error.id = `regexErrorMessage_${index}`;
        error.className = "regex-error";
        error.textContent = "Invalid regular expression.";
        div.appendChild(error);
    } else {
        const label = document.createElement("label");
        label.htmlFor = setting.id;
        label.innerHTML = setting.label;
        div.appendChild(label);
    }

    groupDiv.insertBefore(div, groupDiv.querySelector(".add-custom-button"));
}

/**
 * Update slider track and visibility of contextual messages
 */
function updateSliderUI(value) {
    const percent = (value / 2) * 100;
    document.querySelector(".slider-track").style.background =
        `linear-gradient(to right, #0073b1 ${percent}%, #ddd ${percent}%)`;

    document.querySelectorAll(".slider-label, .slider-icon").forEach(el => {
        el.classList.toggle("active", parseInt(el.dataset.value) === value);
    });

    document.getElementById("offMessage").style.display = value === 0 ? "block" : "none";
    document.getElementById("normalMessage").style.display = value === 1 ? "block" : "none";
    document.getElementById("extremeMessage").style.display = value === 2 ? "block" : "none";
}

/**
 * Enable or disable all setting checkboxes based on toggle state
 */
function updateCheckboxState(value) {
    document.querySelectorAll(".setting-item input[type='checkbox']").forEach(checkbox => {
        checkbox.disabled = value === 0;
    });
}

/**
 * Validate custom regex input, update UI, and persist
 */
function validateAndSaveCustom(index) {
    const regexInput = document.getElementById(`customRegex_${index}`);
    const error = document.getElementById(`regexErrorMessage_${index}`);
    const checkbox = document.getElementById(`custom_${index}`);

    try {
        regexInput.classList.remove("invalid");
        error.style.display = "none";

        if (!checkbox.checked) {
            chrome.storage.local.set({ [`custom_${index}`]: { status: false } });
            return;
        }

        const color = document.getElementById(`customColor_${index}`);
        if (regexInput.value.trim()) new RegExp(regexInput.value); // test validity

        chrome.storage.local.set({
            [`custom_${index}`]: {
                status: true,
                class: "CleanedInCustom",
                selector: `div[data-id^="urn:li:"] div.feed-shared-update-v2:contains(/${regexInput.value.trim()}/)`,
                color: color.value
            }
        });
    } catch {
        regexInput.classList.add("invalid");
        error.style.display = "block";
    }
}

/**
 * Extract regex string from selector
 */
function extractRegexFromSelector(selector) {
    const match = selector?.match(/:contains\(\/([^/]*)\/\)/);
    return match ? match[1] : "";
}

/**
 * Create and save a new custom filter slot
 */
function addNewCustomFilter(groupDiv) {
    chrome.storage.local.get(null, (data) => {
        const customKeys = Object.keys(data).filter(k => k.startsWith("custom_"));
        const nextIndex = customKeys.length > 0 ? Math.max(...customKeys.map(k => parseInt(k.split("_")[1]))) + 1 : 1;
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
 * Mark a custom filter for deletion and remove from UI
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