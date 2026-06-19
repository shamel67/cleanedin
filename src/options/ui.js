/**
 * @file ui.js
 * @description UI components and rendering logic for FeedSift Options page.
 */

/**
 * Render a single setting (checkbox, label, inputs for custom filters).
 * @param {Object} setting
 * @param {Element} groupDiv
 * @param {Object} globalOptions
 * @param {Function} onSettingChange
 * @param {Function} onRemoveCustom
 * @param {Function} onValidateCustom
 */
export function createSettingUI(setting, groupDiv, globalOptions, onSettingChange, onRemoveCustom, onValidateCustom) {
    const isCustom = setting.id.startsWith("custom_");
    const div = document.createElement("div");
    div.className = isCustom ? "custom-setting-item single-row" : "setting-item";
    div.id = `wrapper_${setting.id}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = setting.id;
    checkbox.checked = globalOptions[setting.id]?.status ?? setting.status ?? false;

    checkbox.addEventListener("change", () => {
        onSettingChange(setting, checkbox.checked);
        if (isCustom) {
            const index = setting.id.split("_")[1];
            document.getElementById(`customRegex_${index}`).disabled = !checkbox.checked;
            document.getElementById(`customColor_${index}`).disabled = !checkbox.checked;
            onValidateCustom(index);
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
        textInput.disabled = !globalOptions[setting.id]?.status;
        textInput.addEventListener("input", () => onValidateCustom(index));
        div.appendChild(textInput);

        // 3. Color Picker
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.id = `customColor_${index}`;
        colorInput.value = globalOptions[setting.id]?.color || setting.color || "#D32727";
        colorInput.disabled = !globalOptions[setting.id]?.status;
        colorInput.title = "Pick highlight tone (must be checked to edit)";
        colorInput.addEventListener("input", () => onValidateCustom(index));
        div.appendChild(colorInput);

        // 4. Remove Button
        const removeBtn = document.createElement("button");
        removeBtn.innerHTML = "&#10006;"; // cross icon
        removeBtn.className = "remove-custom-button";
        removeBtn.title = "Delete filter";
        removeBtn.addEventListener("click", () => onRemoveCustom(setting.id));
        div.appendChild(removeBtn);

        // Error message container
        const error = document.createElement("div");
        error.id = `regexErrorMessage_${index}`;
        error.className = "regex-error";
        error.textContent = "Invalid regular expression.";
        div.appendChild(error);
    } else if (setting.id === 'ai') {
        const sliderContainer = document.createElement("div");
        sliderContainer.className = "slider-container";
        
        const label = document.createElement("label");
        label.htmlFor = setting.id;
        label.innerHTML = setting.label;
        div.appendChild(label);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.id = setting.id;
        slider.min = "0";
        slider.max = "5";
        slider.step = "0.5";
        
        const stored = globalOptions[setting.id];
        const currentVal = stored?.status === false
            ? 0
            : stored?.threshold ?? setting.threshold ?? 4;
        slider.value = currentVal;

        const valueDisplay = document.createElement("span");
        valueDisplay.className = "slider-value";
        valueDisplay.textContent = currentVal === "0" ? "Off" : (currentVal >= 5 ? "5+" : currentVal);

        let debounceTimer;
        slider.addEventListener("input", () => {
            const val = parseFloat(slider.value);
            valueDisplay.textContent = val === 0 ? "Off" : (val >= 5 ? "5+" : val);
            
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                onSettingChange(setting, val > 0, val);
            }, 300);
        });

        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(valueDisplay);
        div.appendChild(sliderContainer);
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
 * Extract regex string from a :contains() selector.
 * @param {string} selector
 * @returns {string}
 */
export function extractRegexFromSelector(selector) {
    const match = selector?.match(/:contains\(\/((?:\\.|[^\\/])*)\/(?:[a-z]*)\)/);
    return match ? match[1].replace(/\\\//g, "/") : "";
}
