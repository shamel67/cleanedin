/**
 * @file cssContains.js
 * @description 
 * Extends native DOM querying by enabling pseudo-selectors `:contains()` and `:has()` 
 * in CSS-style selectors. Allows dynamic filtering of content based on text (strings or regex) 
 * and nested content. Used heavily in FeedSift's content filtering logic.
 * 
 * Examples supported:
 * - element:contains("text")
 * - element:contains(/regex/)
 * - parent:has(child:contains("text"))
 * - parent:has(child):has(other:contains(/regex/))
 */

const HAS_REGEX = /:has\(((?:[^()]*?:contains\((["'/])(?:\\.|(?!\2)[^\\])*\2(?:[a-z]*)\)[^()]*)+)\)/gi;
const CONTAINS_REGEX = /:contains\(\s*(["'/])((?:\\.|(?!\1)[^\\])*)\1([a-z]*)\s*\)/ig;

// Cache parsed selectors so we don't apply heavy regex string matching thousands of times per scroll
const selectorCache = new Map();

function parseSelector(selector) {
    if (selectorCache.has(selector)) {
        return selectorCache.get(selector);
    }

    const hasFilters = [];
    const containsFilters = [];
    let baseSelector = selector;

    // Safe to use global regexes in .replace() as it ignores lastIndex but matches all
    baseSelector = baseSelector.replace(HAS_REGEX, (match, innerSelectors) => {
        // Split multiple inner selectors
        let filtered = innerSelectors;
        const innerRegexMatches = [...innerSelectors.matchAll(CONTAINS_REGEX)];

        let strippedSubSelector = innerSelectors.replace(CONTAINS_REGEX, '').trim();
        if (strippedSubSelector.startsWith('>') || strippedSubSelector.startsWith('+') || strippedSubSelector.startsWith('~')) {
            strippedSubSelector = ':scope ' + strippedSubSelector;
        } else if (!strippedSubSelector) {
            strippedSubSelector = '*';
        }

        innerRegexMatches.forEach(m => {
            const quote = m[1];
            const content = m[2];
            const flags = m[3] || '';
            hasFilters.push({
                subSelector: strippedSubSelector,
                regex: new RegExp(content, quote === '/' ? flags : '')
            });
            filtered = filtered.replace(m[0], '').trim();
        });

        if (!filtered) {
            return '';
        }

        return `:has(${filtered})`;
    });

    baseSelector = baseSelector.replace(CONTAINS_REGEX, (match, quote, content, flags) => {
        containsFilters.push(new RegExp(content, quote === '/' ? (flags || '') : ''));
        return '';
    }).trim();

    if (!baseSelector) {
        baseSelector = '*';
    }

    const parsed = { baseSelector, hasFilters, containsFilters };
    selectorCache.set(selector, parsed);
    return parsed;
}

/**
 * Extended querySelectorAll with :contains() and :has() support.
 * 
 * @param {string|string[]} selectors - The selector string or an array of selectors including optional :contains or :has
 * @param {boolean} debug - Whether to return debug information
 * @returns {NodeList|Object} - Matching elements or debug details
 */
function querySelectorAllContains(selectors, debug = false) {
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
    let allElements = [];
    let allDebugInfo = [];

    for (const selector of selectorArray) {
        // Fast path: no :contains(), use native
        if (!selector.includes(':contains(')) {
            const result = this.querySelectorAll(selector);
            if (debug) {
                allDebugInfo.push({
                    selector,
                    elements: Array.from(result),
                    baseSelector: selector,
                    hasFilters: [],
                    containsFilters: []
                });
            } else {
                for (const el of result) allElements.push(el);
            }
            continue;
        }

        const { baseSelector, hasFilters, containsFilters } = parseSelector(selector);

        let elements = Array.from(this.querySelectorAll(baseSelector));

        if (hasFilters.length > 0) {
            elements = elements.filter(el => {
                for (const filter of hasFilters) {
                    const inners = el.querySelectorAll(filter.subSelector);
                    let found = false;
                    for (const inner of inners) {
                        if (filter.regex.test(inner.textContent || "")) {
                            found = true;
                            break;
                        }
                    }
                    if (found) return true;
                }
                return false;
            });
        }

        if (containsFilters.length > 0) {
            elements = elements.filter(el =>
                containsFilters.some(regex => regex.test(el.textContent || ""))
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
            for (const el of elements) allElements.push(el);
        }
    }

    if (debug) {
        return allDebugInfo;
    }

    // Remove duplicates
    return Array.from(new Set(allElements));
}

/**
 * Check if a single element matches an extended selector.
 * @param {string} selector 
 * @returns {boolean}
 */
function matchesContains(selector) {
    if (!selector.includes(':contains(')) {
        return this.matches(selector);
    }

    const { baseSelector, hasFilters, containsFilters } = parseSelector(selector);
    if (!this.matches(baseSelector)) return false;

    if (hasFilters.length > 0) {
        const found = hasFilters.some(filter => {
            const inners = this.querySelectorAll(filter.subSelector);
            return Array.from(inners).some(inner => filter.regex.test(inner.textContent || ""));
        });
        if (!found) return false;
    }

    if (containsFilters.length > 0) {
        const found = containsFilters.some(regex => regex.test(this.textContent || ""));
        if (!found) return false;
    }

    return true;
}

// Add methods to prototypes
Document.prototype.querySelectorAllContains = querySelectorAllContains;
Element.prototype.querySelectorAllContains = querySelectorAllContains;
Element.prototype.matchesContains = matchesContains;
