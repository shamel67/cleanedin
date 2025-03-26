/**
 * @file settings.js
 * @description
 * settingsGroups holds the status configuration for the extension.
 * Each group represents a category (Privacy, Recommendations, etc.)
 * and contains an array of settings. Each setting may define:
 * - id: a unique identifier for the setting.
 * - label: the text (or HTML) shown to the user.
 * - post: a CSS selector for posts to filter.
 * - selector: an alternative CSS selector for sidebar items.
 * - pattern: a regular expression (as a string) to validate the content.
 * - specialClass: an extra CSS class to add when the setting is enabled.
 * - status: the status value (true/false) if not present in storage.
 */
const POST_SELECTOR = 'div[data-id^="urn:li:"] div.feed-shared-update-v2';
const settingsGroups = [
    {
        group: "Privacy",
        settings: [
            {
                id: "probing",
                label: "<a href='https://www.linkedin.com/feed/update/urn:li:activity:7297327556846895104/' target='_blank'>Prevent extensions probing</a> (recommended)",
                status: true
            },
            {
                id: "links",
                label: "Strip tracker from copied links",
                status: true
            }
        ]
    },
    {
        group: "Recommendations",
        settings: [
            {
                id: "follow",
                label: "Brands to follow",
                selector: `${POST_SELECTOR}:has(:not(div.feed-shared-update-v2__update-content-wrapper) a[aria-label$="followers"]):has(span[aria-hidden="true"]:contains(/^Follow/))`,
                status: true
            },
            {
                id: "events",
                label: "Events",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/^Events recommended for you$/))`,
                status: true
            },
            {
                id: "courses",
                label: "Popular courses",
                selector: 'div[data-id^="urn:li:lyndaCourse:"] div.feed-shared-update-v2:has(span.update-components-header__text-view:contains(/^Popular course on LinkedIn Learning$/))',
                status: true
            },
            {
                id: "groups",
                label: "Groups",
                selector: 'section.groups-listing__recommendations,section[aria-labelledby^="groups-recommendations-"]',
                status: true
            },
            {
                id: "games",
                label: "Games",
                selector: 'hr + div:not([role="main"]):has(h2:contains(/Stay in touch through daily games/)),div[data-view-name="invitation-preview"] + section:has(h2:contains(/Stay in touch through daily games/))',
                status: true
            },
            {
                id: "jobs",
                label: "Jobs",
                selector: 'div[data-id*="urn:li:jobPosting:"] div.feed-shared-update-v2,div[data-id^="urn:li:inAppPromotion:"] div.feed-shared-update-v2',
                status: true
            },
            {
                id: "people",
                label: "People",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/^People who follow/))`,
                status: true
            },
            {
                id: "promoted",
                label: "Promoted",
                selector: `${POST_SELECTOR}:has(span[aria-hidden="true"]:contains(/^Promoted/))`,
                status: true
            },
            {
                id: "recommended",
                label: "For you",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/^Recommended for you$/))`,
                status: true
            },
            {
                id: "suggested",
                label: "Suggested",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/Suggested/))`,
                status: true
            },
            {
                id: "videos",
                label: "Videos",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/^Videos for you$/))`,
                status: true
            }
        ]
    },
    {
        group: "Celebrations",
        settings: [
            {
                id: "anniversary",
                label: "Anniversaries",
                selector: `${POST_SELECTOR}:has(div.update-components-celebration__headline:contains(/Anniversary/))`,
                status: true
            },
            {
                id: "celebrations",
                label: "Certifications",
                selector: `${POST_SELECTOR}:has(div.update-components-celebration__headline:contains(/Celebrating a New Certification/))`,
                status: true
            },
            {
                id: "education",
                label: "Education milestones",
                selector: `${POST_SELECTOR}:has(div.update-components-celebration__headline:contains(/Milestone/))`,
                status: true
            },
            {
                id: "jobUpdates",
                label: "Job updates",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/job update/))`,
                status: true
            },
            {
                id: "position",
                label: "Positions",
                selector: `${POST_SELECTOR}:has(div.update-components-celebration__headline:contains(/Starting a New Position/))`,
                status: true
            },
            {
                id: "project",
                label: "Projects",
                selector: `${POST_SELECTOR}:has(div.update-components-celebration__headline:contains(/Project/))`,
                status: true
            },
            {
                id: "promotion",
                label: "Promotions",
                selector: `${POST_SELECTOR}:has(div.update-components-showcase__title:contains(/has been promoted/))`,
                status: true
            },
            {
                id: "work",
                label: "Open to Work",
                selector: `${POST_SELECTOR}:has(div.update-components-showcase__title:contains(/open to work/))`,
                status: true
            }
        ]
    },
    {
        group: "Engagement",
        settings: [
            {
                id: "commented",
                label: "Commented on...",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/commented on this$/))`,
            },
            {
                id: "congrats",
                label: "Congratulate posts",
                selector: `${POST_SELECTOR}:has(span:contains(/congratulate/))`
            },
            {
                id: "reposted",
                label: "Reposts",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/reposted this$/))`,
            },
            {
                id: "polls",
                label: "Polls",
                selector: `${POST_SELECTOR}:has(div.update-components-poll)`,
            }
        ]
    },
    {
        group: "Sidebar & Premium",
        settings: [
            {
                id: "ads",
                label: "Ads",
                selector: "section iframe[title='Advertisement' i]",
                status: true
            },
            {
                id: "news",
                label: "News",
                selector: "section.artdeco-card:has(#feed-news-module)",
                status: true
            },
            {
                id: "premium",
                label: "Premium",
                selector: 'div.artdeco-card:has(a[class*="premium-upsell"]),div[data-id^="urn:li:inAppPromotion"] div.feed-shared-update-v2,section.premium-accent-bar,div[data-view-name="cohorts-section-freemium-service-provider-lead"] section',
                status: true
            }
        ]
    },
    {
        group: "Reactions",
        settings: [
            {
                id: "likes",
                label: "<img src='img/like.svg' class='icon'>Like",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/likes* this/))`
            },
            {
                id: "celebrates",
                label: "<img src='img/celebrate.svg' class='icon'>Celebrate",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/celebrates* this/))`
            },
            {
                id: "supports",
                label: "<img src='img/support.svg' class='icon'>Support",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/supports* this/))`
            },
            {
                id: "loves",
                label: "<img src='img/love.svg' class='icon'>Love",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/loves* this/))`
            },
            {
                id: "insightful",
                label: "<img src='img/insightful.svg' class='icon'>Insightful",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/finds* this insightful/))`
            },
            {
                id: "funny",
                label: "<img src='img/funny.svg' class='icon'>Funny",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/finds* this funny/))`
            },
            {
                id: "reacted",
                label: "Multiple",
                selector: `${POST_SELECTOR}:has(span.update-components-header__text-view:contains(/reacted to this/))`
            }
        ]
    },
    {
        group: "Custom Filters",
        settings: [
            {
                id: "brands",
                label: "Tone color on brands you follow",
                selector: `${POST_SELECTOR}:has(div.update-components-actor--with-control-menu-and-hide-post:contains(/\\d+\\s+followers\(?![\\s\\S]*Promoted\)/))`,
                class: "CleanedInHighlight",
                status: true
            },
            { id: "custom_1", label: "",class: "CleanedInCustom", color: "#0078D4", selector: `${POST_SELECTOR}:contains(/\b(Trump|Musk|Vance|MAGA)\b/)`}
        ]
    }
];