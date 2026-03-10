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

/**
 * Extended querySelectorAll with :contains() and :has() support.
 * 
 * @param {string} selectors - The selector string or an array of selectors including optional :contains or :has
 * @param {boolean} debug - Whether to return debug information
 * @returns {NodeList|Object} - Matching elements or debug details
 */
function querySelectorAllContains(selectors, debug = false) {
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
    let allElements = [];
    let allDebugInfo = [];

    for (let selector of selectorArray) {
        // Fast path: no :contains(), use native
        if (!selector.includes(':contains(')) {
            const result = this.querySelectorAll(selector);
            if (debug) {
                allDebugInfo.push({
                    selector,
                    elements: result,
                    baseSelector: selector,
                    hasFilters: [],
                    containsFilters: []
                });
            } else {
                allElements.push(...result);
            }
            continue;
        }

        const hasFilters = [];
        const containsFilters = [];

        const hasRegex = /:has\(((?:[^()]*?:contains\((["'/])(?:\\.|(?!\2)[^\\])*\2(?:[a-z]*)\)[^()]*)+)\)/gi;
        const containsRegex = /:contains\(\s*(["'/])((?:\\.|(?!\1)[^\\])*)\1([a-z]*)\s*\)/ig;

        let baseSelector = selector;

        baseSelector = baseSelector.replace(hasRegex, (match, innerSelectors) => {
            // Split multiple inner selectors ...
            let filtered = innerSelectors;
            const innerRegexMatches = [...innerSelectors.matchAll(containsRegex)];
            innerRegexMatches.forEach(m => {
                const quote = m[1];
                const content = m[2];
                const flags = m[3] || '';
                hasFilters.push({
                    subSelector: filtered.replace(m[0], '').trim(),
                    regex: new RegExp(content, quote === '/' ? flags : '')
                });
                filtered = filtered.replace(m[0], '').trim();
            });
            return `:has(${filtered})`;
        });

        baseSelector = baseSelector.replace(containsRegex, (match, quote, content, flags) => {
            containsFilters.push(new RegExp(content, quote === '/' ? (flags || '') : ''));
            return '';
        }).trim();

        let elements = this.querySelectorAll(baseSelector);

        if (hasFilters.length > 0) {
            elements = [...elements].filter(el =>
                hasFilters.some(({ subSelector, regex }) =>
                    [...el.querySelectorAll(subSelector)].some(inner => regex.test(inner.innerText))
                )
            );
        }

        if (containsFilters.length > 0) {
            elements = [...elements].filter(el =>
                containsFilters.some(regex => regex.test(el.innerText))
            );
        }

        if (debug) {
            allDebugInfo.push({
                selector,
                elements,
                baseSelector,
                hasFilters,
                containsFilters
            });
        } else {
            allElements.push(...elements);
        }
    }

    if (debug) {
        return allDebugInfo;
    }

    // Remove duplicates
    return [...new Set(allElements)];
}

// Add method to both Document and Element prototypes
Document.prototype.querySelectorAllContains = querySelectorAllContains;
Element.prototype.querySelectorAllContains = querySelectorAllContains;