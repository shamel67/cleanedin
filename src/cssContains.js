/**
 * @file cssContains.js
 * @description 
 * Extends native DOM querying by enabling pseudo-selectors `:contains()` and `:has()` 
 * in CSS-style selectors. Allows dynamic filtering of content based on text (strings or regex) 
 * and nested content. Used heavily in CleanedIn’s content filtering logic.
 * 
 * Examples supported:
 * - element:contains("text")
 * - element:contains(/regex/)
 * - parent:has(child:contains("text"))
 * - parent:has(child):has(other:contains(/regex/))
 */

(function () {
    /**
     * Extended querySelectorAll with :contains() and :has() support.
     * 
     * @param {string} selector - The selector string including optional :contains or :has
     * @param {boolean} debug - Whether to return debug information
     * @returns {NodeList|Object} - Matching elements or debug details
     */
    function querySelectorAllContains(selector, debug = false) {
        // Fast path: no :contains(), use native
        if (!selector.includes(':contains(')) {
            if (debug) return {
                elements: this.querySelectorAll(selector),
                baseSelector: selector,
                hasFilters: [],
                containsFilters: []
            };
            return this.querySelectorAll(selector);
        }

        const hasFilters = [];
        const containsFilters = [];

        // Match :has(child:contains(...))
        const hasRegex = /:has\(((?:[^()]*?:contains\((["'/])(?:\\.|(?!\2)[^\\])*\2\)[^()]*)+)\)/gi;

        // Match :contains("string") or :contains(/regex/)
        const containsRegex = /:contains\(\s*(["'/])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g;

        let baseSelector = selector;

        // Step 1: Extract :has(...) with :contains(...) inside
        baseSelector = baseSelector.replace(hasRegex, (match, innerSelector) => {
            let filtered = innerSelector;

            const matches = [...innerSelector.matchAll(containsRegex)];
            matches.forEach(m => {
                const subSelector = filtered.split(":contains(")[0].trim();
                const regex = new RegExp(m[2]);
                hasFilters.push({ subSelector, regex });

                filtered = filtered.replace(m[0], '').trim(); // strip :contains
            });

            return `:has(${filtered})`; // keep :has, cleaned
        });

        // Step 2: Extract standalone :contains()
        baseSelector = baseSelector.replace(containsRegex, (match, quote, content) => {
            containsFilters.push(new RegExp(content));
            return '';
        }).trim();

        // Step 3: Run native querySelectorAll on the cleaned selector
        let elements = this.querySelectorAll(baseSelector);

        // Step 4: Filter by :has() content
        if (hasFilters.length > 0) {
            elements = [...elements].filter(el =>
                hasFilters.some(({ subSelector, regex }) =>
                    [...el.querySelectorAll(subSelector)].some(inner => regex.test(inner.innerText))
                )
            );
        }

        // Step 5: Filter by standalone :contains()
        if (containsFilters.length > 0) {
            elements = [...elements].filter(el =>
                containsFilters.some(regex => regex.test(el.innerText))
            );
        }

        if (debug) {
            return {
                elements,
                baseSelector,
                hasFilters,
                containsFilters
            };
        }

        return elements;
    }

    // Add method to both Document and Element prototypes
    Document.prototype.querySelectorAllContains = querySelectorAllContains;
    Element.prototype.querySelectorAllContains = querySelectorAllContains;
})();