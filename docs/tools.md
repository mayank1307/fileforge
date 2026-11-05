# Tool reference

<!-- Generated from the tool registry by `npm run docs:tools` in mcp-server/. Do not edit by hand. -->

FileForge registers 26 tools with 228 actions in all. Every tool takes a required `action` parameter that picks what it does; the other parameters apply to the actions that use them. An unknown or missing `action` falls back to the closest match, or to the first action, and the response's `warnings` say so.

| Tool | Actions | Description |
| --- | --- | --- |
| [fileforge_a11y_action](#fileforge_a11y_action) | 4 | Run accessibility audits and checks. |
| [fileforge_api_action](#fileforge_api_action) | 6 | Discover and export REST and GraphQL API calls. |
| [fileforge_app_action](#fileforge_app_action) | 6 | Inspect app framework, routing, client storage, feature flags, and framework-specific state. |
| [fileforge_audit_action](#fileforge_audit_action) | 12 | Unified audit tool. Primary action: query_audit (GraphQL-feel modules + presets). Also: compare_audit_snapshots, plus legacy route/content/policy/security/recommendation/comparison/export/summary actions. |
| [fileforge_browser_action](#fileforge_browser_action) | 9 | Control browser tabs and read browser state. Use query_context to read state; navigate/history/wait for tab control. |
| [fileforge_coding_action](#fileforge_coding_action) | 4 | Capture coding-focused page, route, bug, and article context bundles. |
| [fileforge_devtools_action](#fileforge_devtools_action) | 14 | Unified DevTools tool. Primary action: query_devtools (GraphQL-feel modules + presets). Plus session lifecycle, evaluate, replay_request, export_har, and legacy get_* read actions. |
| [fileforge_export_action](#fileforge_export_action) | 2 | Export stored results and SQL query output. |
| [fileforge_extension_action](#fileforge_extension_action) | 8 | Inspect and test Chrome extension manifest, permissions, storage, service worker, injection, and errors. |
| [fileforge_eye_action](#fileforge_eye_action) | 16 | God's Eye — cross-tab browser monitoring. Watch chosen tabs, or every open tab with all: true: live network traffic, console errors, JS exceptions, DOM mutations, WebSocket frames. Lock onto a target tab for enhanced capture (auto-screenshots on errors). Plant tripwires that fire silently when conditions hit any tab. |
| [fileforge_file_action](#fileforge_file_action) | 9 | Fetch, parse, convert, inspect, and decode files and Data URIs. |
| [fileforge_memory_action](#fileforge_memory_action) | 8 | Manage local page memory, diffing, and result slicing. |
| [fileforge_note_action](#fileforge_note_action) | 3 | Create, list, and search local notes. |
| [fileforge_page_interaction](#fileforge_page_interaction) | 27 | Interact with the DOM, extract page info, run QA checks, and debug failures (click, fill, assert, smoke_test, debug_clickability, capture_debug_bundle, etc.) |
| [fileforge_perf_action](#fileforge_perf_action) | 1 | Run performance audits and collect metrics. |
| [fileforge_qa_testing](#fileforge_qa_testing) | 9 | Run QA checks, smoke tests, element watches, and route tests. |
| [fileforge_report_action](#fileforge_report_action) | 3 | Generate bug reports, PR evidence bundles, and full debug bundles. |
| [fileforge_responsive_action](#fileforge_responsive_action) | 4 | Scan layout and find responsive issues across widths. |
| [fileforge_result_action](#fileforge_result_action) | 4 | Retrieve, list, search, and slice stored FileForge results. |
| [fileforge_runtime_action](#fileforge_runtime_action) | 4 | Runtime health, status, capabilities, and request log actions. |
| [fileforge_scrape_action](#fileforge_scrape_action) | 15 | Scrape and extract content via the GraphQL-style query_scrape action, plus legacy actions (scrape_page, extract_tables, extract_metadata, …). |
| [fileforge_search_action](#fileforge_search_action) | 5 | Search across saved pages, results, notes, browser history, and bookmarks. |
| [fileforge_sql_action](#fileforge_sql_action) | 4 | List, describe, query, and export SQL-backed FileForge data. |
| [fileforge_task_action](#fileforge_task_action) | 30 | Create, run, schedule, plan, inspect, validate, dry-run, and export FileForge routines (and legacy task pipelines). |
| [fileforge_visual_action](#fileforge_visual_action) | 15 | Capture, compare, inspect, and export visual browser artifacts. |
| [fileforge_workflow_action](#fileforge_workflow_action) | 6 | Record, list, run, export, and delete browser workflow recipes. |

## fileforge_a11y_action

Run accessibility audits and checks.

### Actions

- `audit`: Run an accessibility audit against the active or specified tab.
- `get_tree`: Get the accessibility tree for the current page.
- `check_keyboard`: Check keyboard navigability.
- `check_contrast`: Check color contrast across the page.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Default: `active`. |
| `standard` | string | One of: `wcag2a`, `wcag2aa`, `wcag21aa`. Default: `wcag2aa`. |
| `store` | boolean | Default: `true`. |

## fileforge_api_action

Discover and export REST and GraphQL API calls.

### Actions

- `discover`
- `get_graphql_operations`
- `find_openapi_specs`
- `export_curl`
- `export_postman`
- `generate_msw_mocks`

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Default: `active`. |
| `groupBy` | string | One of: `route`, `method`, `status`. Default: `route`. |
| `includeBodies` | boolean | Default: `false`. |
| `export` | array of string | One of: `markdown`, `postman`, `msw`. |
| `store` | boolean | Default: `true`. |
| `filter` | object |  |
| `filename` | string |  |

## fileforge_app_action

Inspect app framework, routing, client storage, feature flags, and framework-specific state.

### Actions

- `detect_framework`: Detect the frontend framework used by the page (React, Vue, Next.js, etc.).
- `get_next_data`: Extract Next.js __NEXT_DATA__ and server-side props.
- `get_route_info`: Get current route information from the SPA router.
- `get_client_storage`: Get localStorage, sessionStorage, and accessible cookies.
- `get_feature_flags`: Detect feature flags exposed in the page (LaunchDarkly, GrowthBook, etc.).
- `get_react_tree_hint`: Get a React component tree hint from the page.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Default: `active`. |
| `includeStateHints` | boolean | Default: `false`. |

## fileforge_audit_action

Unified audit tool. Primary action: query_audit (GraphQL-feel modules + presets). Also: compare_audit_snapshots, plus legacy route/content/policy/security/recommendation/comparison/export/summary actions.

### Actions

- `query_audit`: Unified GraphQL-feel audit. Select audit modules (seo, accessibility, performance, conversion, visual, technical, privacyTrust, structuredData, crawl), presets, scores, issues, roadmap, report, and snapshots in one call.
- `compare_audit_snapshots`: Compare two audit snapshots (by ID) and report score deltas, new issues, resolved issues, and changed modules. Requires `beforeSnapshotId`, `afterSnapshotId`.
- `site_route`: Audit site routes and links for broken routes, invalid links, duplicate titles, missing canonicals, redirects, and route health. Requires `url`.
- `content_consistency`: Detect pricing, subscription, feature-count, product-identity, and limitation contradictions across crawled pages. Requires `url`.
- `extension_policy`: Review site/listing/manifest copy for Chrome extension policy and claim-safety risks. Requires `url`.
- `client_side_security`: Inspect client-side storage for Pro/license flags, exposed secrets, debug flags, tokens, and sensitive state with redacted evidence. Requires `url`.
- `reveal_client_security_value`: Reveal one exact redacted client-storage value after an explicit scoped agent request, and log the reveal. Requires `url`.
- `recommendations_rank`: Deduplicate and rank issues by impact, severity, confidence, project type, and affected pages.
- `compare_runs`: Compare two stored audit runs for added/resolved issues and high-level performance/evidence changes. Requires `beforeRef`, `afterRef`.
- `export_package`: Export a stored audit result as a ZIP package with report.md, issues.json, summary.json, and evidence/result.json. Requires `ref`.
- `summary`: Return a stored audit result in an agent-friendly summary mode such as developer, seo, compliance, conversion, detailed, short, or json-only. Requires `ref`.
- `sensitive_session_check`: Classify whether a URL appears sensitive/private before deep authenticated-page scraping. Requires `url`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `target` | object |  |
| `preset` | string | One of: `quick_audit`, `full_page_audit`, `full_site_audit`, `seo_audit`, `accessibility_audit`, `performance_audit`, `landing_page_audit`, `chrome_extension_landing_audit`, `conversion_audit`, `technical_audit`, `privacy_trust_audit`, `pre_launch_audit`, `post_deploy_audit`, `competitor_audit`, `regression_audit`. |
| `query` | object |  |
| `tabId` | string |  |
| `beforeSnapshotId` | string |  |
| `afterSnapshotId` | string |  |
| `url` | string |  |
| `routes` | array of string |  |
| `maxPages` | number | Default: `20`. |
| `maxChecks` | number | Default: `50`. |
| `crawlRef` | string |  |
| `store` | boolean | Default: `true`. |
| `project` | string | Default: `default`. |
| `listingCopy` | string |  |
| `manifest` | object |  |
| `namespace` | string | One of: `localStorage`, `sessionStorage`. |
| `key` | string |  |
| `location` | string |  |
| `ref` | string |  |
| `issues` | array of object |  |
| `projectType` | string | Default: `generic`. |
| `beforeRef` | string |  |
| `afterRef` | string |  |
| `filename` | string |  |
| `summaryMode` | string | Default: `short`. |
| `title` | string |  |
| `text` | string |  |

## fileforge_browser_action

Control browser tabs and read browser state. Use query_context to read state; navigate/history/wait for tab control.

### Actions

- `navigate`
- `open_url_with_capture`
- `activate_tab`
- `close_tab`
- `reload_tab`
- `history`
- `wait`
- `query_context`
- `close_tabs_matching`

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `preset` | string | Preset for query_context. "snapshot" is the automation sweet spot (active tab + nav + compact tabs). "basic" is cheaper (no nav fields). One of: `basic`, `active_only`, `snapshot`, `tabs_compact`, `navigation_state`, `dedupe_state`, `recovery_state`. |
| `query` | object | Fine-grained projection for query_context. Sections: activeTab, tabs, windows, summary, privacy. Merged on top of preset. |
| `tabId` | string | Tab ID or "active". Omit in navigate for smart URL-reuse behaviour. |
| `url` | string | URL for navigate or open_url_with_capture. |
| `active` | boolean | Focus the tab after navigate / open. Default: `true`. |
| `newTab` | boolean | Force a new tab in navigate even if an existing tab has the same URL. Default: `false`. |
| `bypassCache` | boolean | Default: `false`. |
| `direction` | string | Direction for history action. One of: `back`, `forward`. Default: `back`. |
| `until` | string | Condition to wait for. One of: `load`, `url`, `idle`. Default: `load`. |
| `urlIncludes` | string | URL substring — required for wait(until="url") and close_tabs_matching. |
| `timeoutMs` | number | Default: `15000`. |
| `idleMs` | number | Quiet period before considering tab idle. Default: `1500`. |
| `titleIncludes` | string | Title substring for close_tabs_matching. |
| `keepActiveTab` | boolean | Protect active tab from close_tabs_matching. Default: `true`. |
| `dryRun` | boolean | Simulate without closing. Default: `false`. |
| `keepOpen` | boolean | Leave tab open after capture. Default: `false`. |
| `includeApiBodies` | boolean | Default: `false`. |
| `includePerformance` | boolean | Default: `true`. |
| `includeScreenshot` | boolean | Default: `false`. |
| `includeHar` | boolean | Default: `true`. |
| `settleMs` | number | Default: `500`. |
| `networkIdleMs` | number | Default: `500`. |
| `networkIdleTimeoutMs` | number | Default: `5000`. |
| `store` | boolean | Default: `true`. |
| `project` | string | Default: `default`. |

## fileforge_coding_action

Capture coding-focused page, route, bug, and article context bundles.

### Actions

- `inspect_page`: One-shot Chrome coding context for a URL or active tab: DOM, selectors, forms, framework, console, network, API, a11y, responsive, perf, and optional screenshot.
- `audit_routes`: Fast hidden-Chrome route sweep for coding: captures load-time console, network, API failures, a11y/responsive issues, selectors, and compact summaries per route. Requires `baseUrl`, `routes`.
- `bug_context`: Capture a compact bug-fix bundle from Chrome for Codex: page context, issues, HAR-style network export, and optional screenshot/API bodies. Requires `url`.
- `article_context`: Extract and store an article/documentation context bundle for research debugging. Captures article text, heading outline, metadata, links, code blocks, framework info, and page route state. Ideal for docs, blogs, changelogs, README pages, and research pages that an agent needs to consume.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | string | Optional URL to open. If omitted, use the active tab. |
| `tabId` | string | Default: `active`. |
| `reload` | boolean | Default: `false`. |
| `keepOpen` | boolean | Default: `false`. |
| `includeScreenshot` | boolean | Default: `true`. |
| `includeApiBodies` | boolean | Default: `true`. |
| `includeStorage` | boolean | Default: `false`. |
| `includePerformance` | boolean | Default: `true`. |
| `domDepth` | number | Default: `3`. |
| `timeoutMs` | number | Default: `15000`. |
| `settleMs` | number | Default: `750`. |
| `store` | boolean | Default: `true`. |
| `project` | string | Default: `default`. |
| `baseUrl` | string |  |
| `routes` | array of string |  |
| `title` | string |  |
| `maxTextLength` | number | Default: `50000`. |
| `includeComparison` | boolean | Include visible vs article comparison data Default: `true`. |

## fileforge_devtools_action

Unified DevTools tool. Primary action: query_devtools (GraphQL-feel modules + presets). Plus session lifecycle, evaluate, replay_request, export_har, and legacy get_* read actions.

### Actions

- `query_devtools`: Unified GraphQL-feel DevTools query. Select modules (console, jsErrors, network, apiResponses, graphql, performance, webSockets, coverage, storageSummary, sourceMaps, requestChains, apiInsights, harSummary, security, thirdParties, issues, recommendations, summary) and presets in one call.
- `start_session`: Start an instrumented DevTools capture session for a tab.
- `stop_session`: Stop the DevTools capture session.
- `clear_session`: Clear captured DevTools session data without detaching.
- `session`: Unified session lifecycle action: operation = start \| stop \| clear \| status. Requires `operation`.
- `get_console`: Read recent console messages. Legacy action — prefer query_devtools with console module.
- `get_js_errors`: Get JavaScript errors. Legacy action — prefer query_devtools with jsErrors module.
- `get_network`: Inspect network requests. Legacy action — prefer query_devtools with network module.
- `get_api_responses`: Extract API response bodies. Legacy action — prefer query_devtools with apiResponses module.
- `get_performance`: Get performance timing metrics. Legacy action — prefer query_devtools with performance module.
- `get_websockets`: Inspect WebSocket frames. Legacy action — prefer query_devtools with webSockets module.
- `evaluate`: Run JS in page context via DevTools. Guarded: dryRun supported, dangerous patterns blocked unless allowDangerous=true. Requires `expression`.
- `replay_request`: Replay a captured network request. Guarded: dryRun supported, non-idempotent methods and risky endpoints blocked unless allowUnsafeMethods=true. Requires `requestId`.
- `export_har`: Export the captured session as a HAR archive on disk.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Default: `active`. |
| `preset` | string | One of: `debug_page`, `qa_failure_bundle`, `js_error_debug`, `network_debug`, `api_debug`, `graphql_debug`, `performance_debug`, `security_debug`, `third_party_audit`, `full_diagnostics`, `har_summary`. |
| `query` | object |  |
| `autoStartSession` | boolean |  |
| `captureForMs` | number |  |
| `stopAfterCapture` | boolean |  |
| `operation` | string | One of: `start`, `stop`, `clear`, `status`. |
| `levels` | array of string |  |
| `store` | boolean | Default: `true`. |
| `includeBodies` | boolean |  |
| `filter` | object |  |
| `expression` | string |  |
| `dryRun` | boolean |  |
| `allowDangerous` | boolean |  |
| `requestId` | string |  |
| `overrides` | object |  |
| `allowUnsafeMethods` | boolean |  |
| `filename` | string |  |

## fileforge_export_action

Export stored results and SQL query output.

### Actions

- `result`: Export a stored result ref to a file. Requires `ref`.
- `query`: Run a SQL query and export results to a file. Requires `query`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `ref` | string |  |
| `format` | string | One of: `json`, `csv`, `markdown`, `html`, `har`, `sqlite`, `zip`, `postman`, `msw`. Default: `csv`. |
| `filename` | string |  |
| `query` | string |  |

## fileforge_extension_action

Inspect and test Chrome extension manifest, permissions, storage, service worker, injection, and errors.

### Actions

- `inspect_manifest`: Inspect the loaded FileForge extension manifest and declared runtime surfaces.
- `inspect_storage`: Inspect extension chrome.storage areas with redacted values and reveal metadata.
- `inspect_service_worker`: Inspect the extension service-worker status and runtime identity.
- `reveal_storage_value`: Reveal one exact redacted extension storage value after an explicit scoped agent request, and log the reveal. Requires `key`.
- `inspect_injection`: Inspect content-script/page injection evidence on a tab, including selectors and FileForge DOM nodes.
- `inspect_permissions`: Inspect declared extension permissions, host permissions, and content-script matches.
- `collect_errors`: Collect recent extension/MCP bridge failures with structured failure details.
- `run_extension_check`: Run a composable extension QA check: manifest, permissions, storage, service worker, injection, and errors.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `store` | boolean | Default: `true`. |
| `project` | string | Default: `default`. |
| `area` | string | One of: `all`, `local`, `sync`, `session`. Default: `local`. |
| `key` | string |  |
| `tabId` | string | Default: `active`. |
| `selectors` | array of string |  |

## fileforge_eye_action

God's Eye — cross-tab browser monitoring. Watch chosen tabs, or every open tab with all: true: live network traffic, console errors, JS exceptions, DOM mutations, WebSocket frames. Lock onto a target tab for enhanced capture (auto-screenshots on errors). Plant tripwires that fire silently when conditions hit any tab.

### Actions

- `scan`: One-shot snapshot of ALL open browser tabs: URL, title, load status, audible state. The God's Eye view of your entire browser.
- `start_watch`: Attach DevTools to the given tabs, or to every open http(s) tab with all: true, and begin capturing network requests, console output, JS errors, DOM mutations, and WebSocket frames in real time. Requires tabs or all: true.
- `stop_watch`: Detach from all watched tabs and stop the live capture session. Returns a session summary.
- `get_feed`: Pull the live event feed from the active watch session — all network traffic, console messages, errors, and DOM changes across every watched tab, sorted newest-first.
- `lock_target`: Lock onto a specific tab as the primary target. On a locked tab, JS errors trigger an automatic screenshot so you can see exactly what the user saw when things broke. Requires `tabId`.
- `unlock_target`: Release the current target lock and return to standard multi-tab monitoring.
- `set_tripwire`: Plant a tripwire that fires silently the moment a matching event hits any watched tab. Check get_tripwires to see which ones have fired. Requires `tripwire`.
- `get_tripwires`: List all active tripwires and whether any have fired, including the timestamp and event that triggered them.
- `clear_tripwire`: Remove a tripwire by its ID. Requires `tripwireId`.
- `get_status`: Get current God's Eye session status: whether a watch is active, how many tabs are watched, which tab is locked, event count, and tripwire summary.
- `auto_track`: Auto-attach to every newly-created or newly-navigated http(s) tab while the watch is active. Only allowed in a watch started with all: true. Toggle with enabled: true/false.
- `watch_person`: Tail an identity (email, user id, name, etc.) across every watched tab. Events whose URL, request body, console text, or error text contain the identity are tagged target_hit: true.
- `open_incognito`: Open an incognito window, or add a new incognito tab to an existing incognito window. Pass url to navigate, or urls (array) to open multiple tabs in one window. Pass windowId to attach a new tab to that existing incognito window instead of creating a new one.
- `list_incognito`: List every incognito window currently open and the tabs inside each one (id, url, title, active).
- `close_incognito`: Close an incognito window (by windowId), a specific incognito tab (by tabId), or all incognito windows (pass all: true). Errors if the target window/tab is not incognito.
- `get_report`: Generate a session report: top domains by request count, errors by tab and type, timeline of key moments (first error, first 5xx, first JS exception, first tripwire fire), tripwire summary, identity hits, and locked-target screenshot count.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabs` | array of number | Tab IDs to watch (from scan). Required unless all: true. |
| `all` | boolean | start_watch: attach DevTools to every open http(s) tab. close_incognito: close every incognito window. Default: `false`. |
| `filter` | object | Optional filters to narrow the feed. |
| `limit` | number | Max events to return (default 100). Default: `100`. |
| `tabId` | number | Incognito tab ID to close. |
| `tripwire` | object | Tripwire definition. |
| `tripwireId` | string | ID returned by set_tripwire. |
| `enabled` | boolean | Turn auto-track on (true) or off (false). Default: `true`. |
| `identity` | string | The string to scan for — e.g. "user@example.com" or a user id. |
| `clear` | boolean | Clear the current identity target. Default: `false`. |
| `url` | string | Optional URL to open in the new window/tab. |
| `urls` | array of string | Optional list of URLs — opens a window with one tab per URL. Ignored if windowId is provided. |
| `windowId` | number | Incognito window ID to close. |
| `focused` | boolean | Whether the new window should be focused (default true). Default: `true`. |

## fileforge_file_action

Fetch, parse, convert, inspect, and decode files and Data URIs.

### Actions

- `convert`: Convert a file to another format. Requires `url`, `to`.
- `extract_text`: Extract plain text from a file (PDF, DOCX, etc.). Requires `url`.
- `parse_data_uri`: Parse and decode a Data URI. Requires `dataUri`.
- `inspect_data_uri`: Inspect a Data URI: MIME, encoding, decoded size, preview-safe text, image dimensions, and warnings. Requires `dataUri`.
- `decode_data_uri`: Decode a Data URI into a local artifact and return compact metadata. Requires `dataUri`.
- `extract_data_uris_from_page`: Find Data URIs embedded in the active page DOM, styles, links, images, media, and scripts.
- `convert_data_uri_image`: Convert an image Data URI to PNG, JPEG, or WebP using the browser canvas and store it as an artifact. Requires `dataUri`.
- `fetch_resource`: Fetch a resource URL and save it locally. Requires `url`.
- `parse_resource`: Fetch and parse a resource (JSON, CSV, XML, etc.). Requires `url`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | string | URL or local path of the file |
| `from` | string | Source format |
| `to` | string | Target format |
| `dataUri` | string |  |
| `textPreviewLimit` | number | Default: `1200`. |
| `includeTextPreview` | boolean | Default: `true`. |
| `project` | string | Default: `default`. |
| `run` | string |  |
| `name` | string | Default: `converted-data-uri`. |
| `tabId` | string | Default: `active`. |
| `store` | boolean | Default: `true`. |
| `limit` | number | Default: `200`. |
| `format` | string | Default: `png`. |
| `quality` | number | Default: `0.92`. |

## fileforge_memory_action

Manage local page memory, diffing, and result slicing.

### Actions

- `save_page`
- `query`
- `semantic_search`
- `answer`
- `find_previous_visit`
- `diff_page`
- `compact_result`
- `get_result_slice`

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Default: `active`. |
| `project` | string | Default: `default`. |
| `query` | string |  |
| `question` | string |  |
| `url` | string |  |
| `limit` | number | Default: `10`. |
| `ref` | string |  |
| `offset` | number | Default: `0`. |
| `store` | boolean | Default: `true`. |

## fileforge_note_action

Create, list, and search local notes.

### Actions

- `create`: Create a local note. Requires `title`, `body`.
- `list`: List saved notes.
- `search`: Search notes by text. Requires `query`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `title` | string |  |
| `body` | string |  |
| `tags` | array of string |  |
| `url` | string | Associated URL, if any |
| `tag` | string |  |
| `limit` | number | Default: `20`. |
| `offset` | number | Default: `0`. |
| `query` | string |  |

## fileforge_page_interaction

Interact with the DOM, extract page info, run QA checks, and debug failures (click, fill, assert, smoke_test, debug_clickability, capture_debug_bundle, etc.)

### Actions

- `get_text`: Get visible text from a page or selector.
- `get_dom_snapshot`: Snapshot the DOM tree.
- `get_layered_snapshot`: Layered DOM snapshot with screenshots.
- `get_accessibility_tree`: Get the page accessibility tree.
- `get_interactive_elements`: List interactive elements on the page.
- `get_forms`: Extract forms on the page.
- `wait_for_selector`: Wait for a selector to appear.
- `click`: Click a selector.
- `fill`: Fill a form field.
- `scroll`: Scroll the page.
- `reveal`: Scroll a selector into view.
- `get_element_debug_info`: Debug info for an element.
- `hide_elements`: Hide elements matching selectors.
- `restore_hidden_elements`: Restore previously hidden elements.
- `extract_article`: Extract the article-style main content.
- `compare_visible_vs_article`: Compare visible text against extracted article.
- `assert`: Run assertions against page state (url, title, text, selectors, inputs).
- `smoke_test`: Quick health check: loaded, text, interactives, errors, images, layout.
- `find_errors`: Find visible error text patterns on the page.
- `check_broken_images`: Detect broken or unloaded images.
- `check_links`: Inspect all anchor links for missing hrefs, javascript:, external, etc.
- `check_layout`: Detect layout issues: overflow, zero-size clickables, overlapping elements, modals.
- `debug_selector`: Debug a CSS selector: match count, visibility, alternatives, warnings.
- `debug_clickability`: Check why an element can or cannot be clicked.
- `capture_debug_bundle`: One-call diagnostic bundle: page info, errors, layout, images, links, screenshot.
- `wait_for_page_change`: Poll until page state changes (url, title, text, elements) or timeout.
- `compare_snapshots`: Compare two stored page state snapshots by stateId.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Default: `active`. |
| `store` | boolean | Default: `false`. |
| `selector` | string | CSS selector. |
| `selectors` | array of string |  |
| `timeoutMs` | number | Default: `10000`. |
| `depth` | number | Depth for DOM snapshot |
| `fallback` | boolean | Default: `true`. |
| `maxHtmlLength` | number | Default: `200000`. |
| `textSampleLimit` | number | Default: `5000`. |
| `includeScreenshotFallback` | boolean | Default: `false`. |
| `project` | string | Default: `default`. |
| `includeSelectors` | boolean | Default: `true`. |
| `value` | string | Value to fill |
| `direction` | string | One of: `up`, `down`, `top`, `bottom`. Default: `down`. |
| `amount` | number | Default: `500`. |
| `maxTextLength` | number | Default: `50000`. |
| `assertions` | array of object | List of assertions. Each has: type, value?, selector?, text?, count?. |
| `checks` | array of string | Specific checks to run (smoke_test or check_layout). Defaults apply if omitted. |
| `includeHidden` | boolean | Include hidden elements in find_errors / check_broken_images / check_links. Default: `false`. |
| `maxMatches` | number | Max matches for find_errors. Default: `50`. |
| `mode` | string | Link checking mode. One of: `extract_only`, `validate_same_origin`, `validate_all`. Default: `extract_only`. |
| `includeExternal` | boolean | Default: `true`. |
| `include` | array of string | Bundle sections: pageInfo, viewport, visibleText, interactiveElements, forms, screenshot, errors, layoutIssues, brokenImages, links. |
| `maxTextChars` | number | Default: `6000`. |
| `maxElements` | number | Default: `100`. |
| `previousStateId` | string | stateId from a previous query_page / smoke_test / capture_debug_bundle. |
| `previousUrl` | string |  |
| `previousTextHash` | string |  |
| `changeTypes` | array of string | Which change types to watch. Defaults to all. One of: `url`, `title`, `visibleText`, `dom`, `interactiveElements`. |
| `beforeStateId` | string |  |
| `afterStateId` | string |  |

## fileforge_perf_action

Run performance audits and collect metrics.

### Actions

- `audit`: Run a performance audit (Core Web Vitals) across viewports.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | string |  |
| `viewports` | array of string | One of: `desktop`, `tablet`, `mobile`. Default: `["desktop","mobile"]`. |
| `includeScreenshot` | boolean | Default: `false`. |
| `timeoutMs` | number | Default: `15000`. |
| `settleMs` | number | Default: `750`. |
| `networkIdleMs` | number | Default: `500`. |
| `networkIdleTimeoutMs` | number | Default: `5000`. |
| `store` | boolean | Default: `true`. |
| `project` | string | Default: `default`. |

## fileforge_qa_testing

Run QA checks, smoke tests, element watches, and route tests.

### Actions

- `run_frontend_check`
- `run_smoke_test`
- `check_page_boot`
- `check_routes`
- `check_console_clean`
- `check_network_clean`
- `check_forms`
- `watch_element`
- `capture_element_change`

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | string |  |
| `baseUrl` | string |  |
| `routes` | array of string |  |
| `viewports` | array of string | One of: `mobile`, `tablet`, `desktop`. |
| `checks` | array of string |  |
| `store` | boolean | Default: `true`. |
| `tabId` | string | Default: `active`. |
| `selector` | string |  |
| `watchId` | string |  |
| `timeoutMs` | number | Default: `30000`. |
| `project` | string | Default: `default`. |

## fileforge_report_action

Generate bug reports, PR evidence bundles, and full debug bundles.

### Actions

- `bug`: Generate a bug report bundle from the active tab. Requires `title`.
- `pr_evidence`: Generate a PR evidence bundle (screenshots, QA results, diff). Requires `title`.
- `debug_bundle`: Create a debug bundle with full diagnostics. Requires `title`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Default: `active`. |
| `title` | string |  |
| `include` | array of string |  |
| `format` | string | One of: `zip`, `markdown`. Default: `zip`. |
| `urls` | array of string |  |

## fileforge_responsive_action

Scan layout and find responsive issues across widths.

### Actions

- `scan_layout`: Scan layout for responsive issues across widths.
- `find_overflow`: Find horizontal overflow at responsive widths.
- `find_overlaps`: Find overlapping element boxes.
- `capture_matrix`: Capture screenshots at a width matrix.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | string |  |
| `widths` | array of number | Viewport widths to test |
| `checks` | array of string | One of: `overflow`, `overlap`, `clipping`, `layoutShift`. |
| `tabId` | string | Default: `active`. |
| `store` | boolean | Default: `true`. |

## fileforge_result_action

Retrieve, list, search, and slice stored FileForge results.

### Actions

- `get`: Retrieve a stored result by its ref. Requires `ref`.
- `list`: List stored results, newest first. Optionally filter by project.
- `search`: Search stored results by keyword across URL, tool name, and data. Requires `query`.
- `slice`: Get a paginated slice of a stored result. Requires `ref`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `ref` | string | The result ref (e.g. scrape_page_20260509_abc123) |
| `project` | string | Filter by project name. |
| `limit` | number | Default: `100`. |
| `offset` | number | Default: `0`. |
| `query` | string |  |

## fileforge_runtime_action

Runtime health, status, capabilities, and request log actions.

### Actions

- `ping`: Check that the MCP server is alive.
- `status`: Get the current status of the MCP bridge and extension connection.
- `capabilities`: List all registered tools and their availability.
- `request_log`: Get recent RPC request log entries.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `limit` | number | Max entries to return Default: `50`. |
| `failuresOnly` | boolean | Default: `false`. |
| `includeDetails` | boolean | Default: `true`. |

## fileforge_scrape_action

Scrape and extract content via the GraphQL-style query_scrape action, plus legacy actions (scrape_page, extract_tables, extract_metadata, …).

### Actions

- `query_scrape`: GraphQL-style projection over page content (presets + custom queries).
- `compare_scrape_snapshots`: Diff two stored scrape snapshots by ID.
- `scrape_page`: Scrape sections of a single page.
- `extract_assets`: Extract assets (images, videos, files) from a page.
- `extract_tables`: Extract tables from the active or specified page.
- `extract_contacts`: Extract email/phone/address contact data.
- `extract_metadata`: Extract page metadata (title, OG, JSON-LD).
- `extract_design_tokens`: Extract colors, fonts, and design tokens.
- `extract_all_debug`: Extract everything (debug only — large payload).
- `scrape_tabs`: Scrape multiple tabs.
- `scrape_urls`: Open and scrape a list of URLs.
- `crawl_site`: Crawl a site up to maxPages.
- `research_site`: Research a site (multi-step crawl + extract).
- `analyze_site`: Analyze a site.
- `extract_resource`: Fetch a specific page resource.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Default: `active`. |
| `tabIds` | array of string |  |
| `url` | string |  |
| `urls` | array of string |  |
| `sections` | array of string |  |
| `maxPages` | number |  |
| `store` | boolean | Default: `true`. |
| `project` | string | Default: `default`. |
| `source` | object |  |
| `preset` | string |  |
| `query` | object |  |
| `beforeSnapshotId` | string |  |
| `afterSnapshotId` | string |  |

## fileforge_search_action

Search across saved pages, results, notes, browser history, and bookmarks.

### Actions

- `all`: Search across pages, notes, history, and bookmarks. Requires `query`.
- `page`: Search within the text of a specific page result. Requires `query`.
- `notes`: Search saved notes. Requires `query`.
- `history`: Search browser history. Requires `query`.
- `bookmarks`: Search browser bookmarks. Requires `query`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `query` | string |  |
| `limit` | number | Default: `20`. |
| `ref` | string |  |

## fileforge_sql_action

List, describe, query, and export SQL-backed FileForge data.

### Actions

- `list_tables`: List all available SQL tables.
- `describe_table`: Describe the columns and schema of a table. Requires `table`.
- `query`: Run a SQL SELECT query against stored data. Requires `query`.
- `export_query`: Run a SQL query and export the results to a file. Requires `query`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `table` | string |  |
| `query` | string | SQL SELECT statement |
| `ref` | string | Optional result ref to scope the query |
| `limit` | number | Default: `100`. |
| `offset` | number | Default: `0`. |
| `format` | string | One of: `csv`, `json`, `markdown`. Default: `csv`. |
| `filename` | string |  |

## fileforge_task_action

Create, run, schedule, plan, inspect, validate, dry-run, and export FileForge routines (and legacy task pipelines).

### Actions

- `start`: Start an asynchronous task made of structured FileForge tool invocations.
- `add`: Add a saved task made of structured FileForge tool invocations. Requires `actions`.
- `edit`: Edit a saved task record. Requires `taskId`.
- `status`: Get the current status of a running task. Requires `taskId`.
- `events`: Get progress events for a task. Requires `taskId`.
- `pause`: Pause a running task. Requires `taskId`.
- `resume`: Resume a paused task. Requires `taskId`.
- `cancel`: Cancel a running task. Requires `taskId`.
- `list`: List all tasks (running, paused, completed).
- `delete`: Delete a task and its event history. Requires `taskId`.
- `export`: Export task results and artifacts. Requires `taskId`.
- `monitor_page`: Monitor a page for changes over time. Requires `url`.
- `collect_table`: Collect rows from a paginated table into a local dataset. Requires `url`.
- `collect_search_results`: Run a search on a website and collect all results into a dataset. Requires `url`, `query`.
- `create`: Create a routine (prompt or steps input). Requires `name`.
- `update`: Update a routine (snapshots a new version). Requires `routineId`, `patch`.
- `get`: Fetch a routine (optionally a specific version). Requires `routineId`.
- `duplicate`: Duplicate an existing routine. Requires `routineId`.
- `enable`: Enable a routine. Requires `routineId`.
- `disable`: Disable a routine. Requires `routineId`.
- `validate`: Validate a routine or an arbitrary step array against the tool catalog.
- `dry_run`: Produce a dry-run report for a routine without executing anything. Requires `routineId`.
- `run`: Enqueue a routine for execution. Requires `routineId`.
- `stop`: Stop / cancel a running or queued run. Requires `runId`.
- `get_runs`: List runs for a routine. Requires `routineId`.
- `get_run_details`: Get full details of a run (steps + events + artifacts). Requires `runId`.
- `export_run`: Export a run as JSON or CSV. Requires `runId`.
- `get_tool_registry`: Return the FileForge tool capability catalog.
- `plan_from_prompt`: Return planning context (registry slice + schema + planning prompt) for an LLM to use when converting a prompt into an executable step array. Requires `prompt`.
- `commit_plan`: Validate an LLM-produced step array and save it as a routine (new or updated). Requires `plannedSteps`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `taskId` | string | Optional explicit task id. |
| `title` | string | Task label. |
| `actions` | array of object | Ordered FileForge tool invocations: [{ tool, params, name?, required? }]. |
| `task` | string | Legacy label alias. Do not use as a prompt. |
| `description` | string | Legacy label alias. Do not use as a prompt. |
| `url` | string | Optional starting URL |
| `mode` | string | One of: `interactive`, `collector`, `monitor`. Default: `interactive`. |
| `maxMinutes` | number | Default: `60`. |
| `outputs` | array of object |  |
| `export` | array of string |  |
| `capture` | array of string |  |
| `recipeName` | string | Saved workflow recipe to run asynchronously. |
| `recipe` | object | Inline workflow recipe to save and run asynchronously. |
| `pollIntervalMs` | number | Default: `15000`. |
| `timeoutMs` | number | Default: `180000`. |
| `store` | boolean | Default: `true`. |
| `status` | string | Default: `all`. |
| `result` | object |  |
| `since` | string | ISO timestamp to get events after |
| `format` | string | One of: `json`, `csv`, `zip`. Default: `json`. |
| `intervalMinutes` | number | Default: `5`. |
| `watch` | array of string | Selectors or data types to watch |
| `selector` | string | CSS selector for the table |
| `maxPages` | number | Default: `5`. |
| `query` | string |  |
| `name` | string |  |
| `inputType` | string | One of: `prompt`, `steps`. |
| `prompt` | string |  |
| `steps` | array of object |  |
| `propsSchema` | object |  |
| `defaultProps` | object |  |
| `permissions` | object |  |
| `triggerType` | string | One of: `manual`, `cron`, `event`. |
| `cronExpression` | string |  |
| `enabled` | boolean |  |
| `concurrencyPolicy` | string | One of: `allow`, `skip_if_running`, `queue`, `replace_running`. |
| `retryPolicy` | object |  |
| `timeoutConfig` | object |  |
| `retentionPolicy` | object |  |
| `exportConfig` | object |  |
| `storageConfig` | object |  |
| `notificationConfig` | object |  |
| `metadata` | object |  |
| `createdBy` | string | One of: `user`, `mcp`, `system`. |
| `reason` | string |  |
| `routineId` | string |  |
| `patch` | object |  |
| `updatedBy` | string | One of: `user`, `mcp`, `system`. |
| `version` | number |  |
| `propOverrides` | object |  |
| `simulateMissing` | boolean | Default: `false`. |
| `idempotencyKey` | string |  |
| `priority` | number | Default: `0`. |
| `trigger` | string | One of: `manual`, `cron`, `event`, `mcp`. Default: `manual`. |
| `retryOfRunId` | string |  |
| `parentRunId` | string |  |
| `runId` | string |  |
| `limit` | number | Default: `50`. |
| `offset` | number | Default: `0`. |
| `includeStepResults` | boolean | Default: `true`. |
| `includeEvents` | boolean | Default: `true`. |
| `includeRaw` | boolean | Default: `true`. |
| `includeLogs` | boolean | Default: `true`. |
| `includeSummary` | boolean | Default: `true`. |
| `filterPermissions` | object | Only return actions whose required permissions are all granted in this map. |
| `hints` | array of string |  |
| `plannedSteps` | array of object |  |

## fileforge_visual_action

Capture, compare, inspect, and export visual browser artifacts.

### Actions

- `capture_screenshot`: Capture a screenshot of a tab. The tab must be the visible one in its window; otherwise the call returns TAB_NOT_VISIBLE.
- `capture_full_page`: Capture a stitched full-page screenshot of a tab and store it as a local artifact.
- `capture_element`: Capture a screenshot of a specific page element by selector and store it as a local artifact. Requires `selector`.
- `capture_region`: Capture a rectangular viewport or page region and store it as a local artifact. Requires `x`, `y`, `width`, `height`.
- `pick_and_capture_element`: Start an in-page element picker, capture the chosen element, and store it as a local artifact.
- `capture_matrix`: Capture a URL across multiple viewport presets and return stored screenshot artifact refs. Requires `url`.
- `capture_baseline`: Capture and store a baseline screenshot for later comparison. Requires `url`, `name`.
- `capture_route_baselines`: Capture and store baseline screenshots for multiple routes and viewports. Requires `baseUrl`, `routes`.
- `compare_screenshot`: Compare the current state of a URL against its stored baseline. Requires `url`, `name`.
- `compare_routes`: Compare multiple routes against their baselines. Requires `baseUrl`, `routes`.
- `extract_css`: Extract computed CSS for an element. Requires `selector`.
- `extract_colors`: Extract the color palette from the page.
- `detect_fonts`: Detect fonts used on the page.
- `measure_element`: Measure the size and position of an element. Requires `selector`.
- `export_diff`: Export a visual diff bundle as a ZIP. Requires `ref`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Default: `active`. |
| `fullPage` | boolean | Default: `false`. |
| `format` | string | One of: `png`, `jpeg`. Default: `png`. |
| `store` | boolean | Default: `true`. |
| `includeBase64` | boolean | Default: `false`. |
| `project` | string | Default: `default`. |
| `run` | string | Optional run ID for grouping comparison artifacts |
| `name` | string | Baseline name Default: `matrix`. |
| `url` | string | Optional page URL to include in metadata |
| `viewport` | string | Optional viewport label or dimensions Default: `desktop`. |
| `maxHeight` | number | Default: `100000`. |
| `scrollWaitMs` | number | Default: `120`. |
| `hideFixedElements` | boolean | Default: `true`. |
| `selector` | string |  |
| `padding` | number | Default: `0`. |
| `x` | number |  |
| `y` | number |  |
| `width` | number |  |
| `height` | number |  |
| `coordinateSpace` | string | One of: `viewport`, `page`. Default: `viewport`. |
| `timeoutMs` | number | Default: `15000`. |
| `viewports` | array of string | Default: `["desktop"]`. |
| `active` | boolean | Default: `false`. |
| `keepOpen` | boolean | Default: `false`. |
| `settleMs` | number | Default: `500`. |
| `baseUrl` | string |  |
| `routes` | array of string |  |
| `namePrefix` | string | Default: ``. |
| `ignoreSelectors` | array of string |  |
| `threshold` | number | Default: `0`. |
| `ref` | string |  |
| `filename` | string |  |

## fileforge_workflow_action

Record, list, run, export, and delete browser workflow recipes.

### Actions

- `start_recording`: Start recording a browser workflow (clicks, typing, navigation). Requires `name`.
- `stop_recording`: Stop the current workflow recording and save the recipe.
- `list_recipes`: List all saved workflow recipes.
- `run_recipe`: Replay a saved workflow recipe. Requires `name`.
- `export_recipe`: Export a workflow recipe to a file. Requires `name`.
- `delete_recipe`: Delete a saved workflow recipe. Requires `name`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `name` | string | Recipe name to save as |
| `tabId` | string | Default: `active`. |
| `steps` | array of object | Optional explicit recipe steps to save immediately. |
| `assertions` | array of object | Optional assertions saved with the recipe. |
| `inputs` | object | Variable substitutions for the recipe |
| `capture` | array of string | One of: `console`, `network`, `screenshots`. |
| `store` | boolean | Default: `true`. |
| `format` | string | One of: `json`, `playwright`. Default: `json`. |
