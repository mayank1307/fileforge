# Tool reference

<!-- Generated from the tool registry by `npm run docs:tools` in mcp-server/. Do not edit by hand. -->

FileForge registers 26 tools with 228 actions in all. Every tool takes a required `action` parameter that picks what it does; the other parameters apply to the actions that use them. A missing or unknown `action` returns an `UNKNOWN_ACTION` error and runs nothing; only differences in case or punctuation are forgiven, with a warning.

| Tool | Actions | Description |
| --- | --- | --- |
| [fileforge_a11y_action](#fileforge_a11y_action) | 4 | Check one page's accessibility: run an audit, read the accessibility tree, and check keyboard navigation and color contrast. Use this for focused accessibility work, and fileforge_audit_action for a wider audit. Doesn't change the page; results can be stored locally. Needs the extension. |
| [fileforge_api_action](#fileforge_api_action) | 6 | Work with the API calls a page makes: discover REST and GraphQL requests, find OpenAPI specs, and export them as curl, Postman or MSW mocks. Reads a running DevTools session, so call start_session on fileforge_devtools_action first or results are empty. Exports replace a file of the same name and can include captured auth headers, so review them before sharing. Needs the extension. |
| [fileforge_app_action](#fileforge_app_action) | 6 | Inspect a web app in an open tab: detect its framework, and read routes, Next.js data, client storage, feature flags and React tree hints. Use this to understand how an app is built. Use fileforge_coding_action for a full bundle. Read-only, but get_client_storage returns raw localStorage and sessionStorage values, which can include tokens. Needs the extension. |
| [fileforge_audit_action](#fileforge_audit_action) | 12 | Audit a page or site for SEO, content, policy and client-side security issues. Prefer query_audit with a preset; compare_runs shows what changed between stored audits. Use fileforge_a11y_action, fileforge_perf_action or fileforge_responsive_action for one focused check. reveal_client_security_value needs FILEFORGE_ALLOW_SECRET_REVEAL=1. Results can be stored. Needs the extension. |
| [fileforge_browser_action](#fileforge_browser_action) | 9 | Manage tabs and read browser state: go to a URL, switch, reload and close tabs, move through history, wait for a page, and list open tabs. Use query_context to see what's open, and fileforge_page_interaction to act inside a page. Closing tabs can lose unsaved work, and close_tabs_matching can close many at once, so try dryRun first. Sensitive tab URLs are redacted. Needs the extension. |
| [fileforge_coding_action](#fileforge_coding_action) | 4 | Get context for fixing code in one call. inspect_page returns a page's framework, selectors, forms, console, network and performance; audit_routes sweeps many routes for errors; bug_context and article_context gather focused context. Use fileforge_qa_testing for pass/fail checks. Opens pages in your session; results can be stored. Needs the extension. |
| [fileforge_devtools_action](#fileforge_devtools_action) | 14 | Read DevTools data for a tab, from the moment a session starts: console, JS errors, network requests, API responses, WebSockets and performance. Prefer query_devtools with a preset; the get_* actions are older. Attaches the debugger, so Chrome shows its debugging bar. evaluate runs JavaScript in the page and replay_request re-sends a request; both can change data and have guards. Needs the extension. |
| [fileforge_export_action](#fileforge_export_action) | 2 | Write stored results or SQL query output to a file in formats such as CSV, JSON, Markdown, HAR or ZIP. Use this to hand data to another tool. Use fileforge_result_action or fileforge_sql_action to read data without creating a file. Writes only to FileForge's exports folder, and a filename you reuse replaces that file. |
| [fileforge_extension_action](#fileforge_extension_action) | 8 | Inspect a Chrome extension: manifest, permissions, storage, service worker, content-script injection and errors. Use this to debug an extension you're building, and fileforge_audit_action for store policy checks. reveal_storage_value needs FILEFORGE_ALLOW_SECRET_REVEAL=1. Needs the extension. |
| [fileforge_eye_action](#fileforge_eye_action) | 16 | Monitor many tabs at once: network traffic, console errors, JS exceptions, DOM changes and WebSocket frames. Set tripwires such as "status &gt;= 500", then read get_tripwires; they don't notify you. watch_person tags events that mention an identity. Use fileforge_devtools_action for one tab in depth. Attaches the debugger to watched tabs; the incognito actions open and close windows. Needs the extension. |
| [fileforge_file_action](#fileforge_file_action) | 9 | Fetch, parse and convert files, extract text, and decode data URIs, including those in a page. Use this for documents and embedded assets, and fileforge_scrape_action for HTML pages. Fetches public URLs without your browser session; private addresses need FILEFORGE_ALLOWED_FETCH_HOSTS. Local paths need the output folders of ~/.fileforge or FILEFORGE_ALLOWED_READ_PATHS. Can write files locally. |
| [fileforge_memory_action](#fileforge_memory_action) | 8 | Remember pages over time: save a page, find earlier visits, diff it against a previous visit, and search saved pages or pull evidence for a question. Use this to see what changed on a page. Use fileforge_result_action to read tool results and fileforge_search_action to search history. Data stays in ~/.fileforge. save_page and diff_page need the extension. |
| [fileforge_note_action](#fileforge_note_action) | 3 | Keep local notes: create, list and search them. Use this to save findings across sessions. Use fileforge_memory_action to save page content and fileforge_report_action for shareable evidence. Notes stay in ~/.fileforge, and there's no update or delete action. |
| [fileforge_page_interaction](#fileforge_page_interaction) | 27 | Read and act inside one open page: get text, snapshots and forms, click, fill, scroll, assert, and debug selectors. click and fill act on the real signed-in page, so they can submit or change data. hide_elements lasts until restore_hidden_elements. Use fileforge_qa_testing for repeatable checks across pages and fileforge_scrape_action for structured extraction. Needs the extension. |
| [fileforge_perf_action](#fileforge_perf_action) | 1 | Run a performance audit on a URL across viewports and return Core Web Vitals. Use this for a performance check of one page. Use fileforge_devtools_action for raw session data and fileforge_audit_action for SEO, content and security. Loads the URL in its own tab, closes it afterward, and stores the result by default. It doesn't change the site. Needs the extension. |
| [fileforge_qa_testing](#fileforge_qa_testing) | 9 | Run repeatable pass/fail checks: smoke tests, page boot, routes, console, network, forms and element watches. Use fileforge_page_interaction for individual steps and fileforge_coding_action while fixing code. URL checks load pages in your session. check_console_clean and check_network_clean read a running DevTools session and return SESSION_NOT_STARTED without one. Needs the extension. |
| [fileforge_report_action](#fileforge_report_action) | 3 | Generate evidence bundles from the active tab: a bug report, PR evidence with screenshots and QA results, or a full debug bundle. Use this when you need something to share or attach. Use fileforge_coding_action for context while working. Bundles are saved locally and can contain page data, so review them before sharing. Needs the extension. |
| [fileforge_responsive_action](#fileforge_responsive_action) | 4 | Find layout bugs across screen widths: scan a URL, and locate overflow and overlapping elements. capture_matrix takes a screenshot at each viewport. Use fileforge_visual_action to compare screenshots against baselines. Loads the page in your session and can store results; it doesn't change the site. Needs the extension. |
| [fileforge_result_action](#fileforge_result_action) | 4 | Read results other tools stored in ~/.fileforge: fetch one by ref, list them, search them, or slice a large one. Use this when a tool returns a ref instead of full data. Use fileforge_sql_action to query across results and fileforge_export_action to write one to a file. Works without the extension. |
| [fileforge_runtime_action](#fileforge_runtime_action) | 4 | Check FileForge itself: whether the server and extension are connected, their versions, which tools are available, and recent requests. Use status when other tools report a bridge or connection error. It doesn't touch page content. |
| [fileforge_scrape_action](#fileforge_scrape_action) | 15 | Extract structured content from pages, tabs or a whole site: text, links, tables, metadata, assets and design tokens. Prefer query_scrape; the others are older single-purpose actions. It can't click or submit; use fileforge_page_interaction for that. crawl_site opens real tabs in your signed-in session, up to 50 pages by default. Query stored links and tables with fileforge_sql_action. Needs the extension. |
| [fileforge_search_action](#fileforge_search_action) | 5 | Search local data by text: saved pages, stored results, notes, browser history and bookmarks. Use all to search everything, or narrow it to one source. Use fileforge_memory_action to compare page visits and fileforge_scrape_action to read a live page. History and bookmarks need the extension. |
| [fileforge_sql_action](#fileforge_sql_action) | 4 | Query FileForge's stored results with SELECT-only SQL. Use list_tables and describe_table to see the schema, query to read rows, and export_query to write rows to a file. Covers saved results and scraped pages, links and tables, not the live browser. Use fileforge_result_action to fetch a single known ref. Works without the extension. |
| [fileforge_task_action](#fileforge_task_action) | 30 | Run multi-step work two ways. Tasks (start, add, status, monitor_page) track one job. Routines (create, validate, dry_run, run, plan_from_prompt) are saved and can be scheduled, but cron only fires while this server runs. For a single step, call the tool directly. Runs act in your browser, pausing only at steps that require approval. delete removes a task; routines can only be disabled. |
| [fileforge_visual_action](#fileforge_visual_action) | 15 | Capture and compare how pages look: screenshots of a page, element or region, baselines, visual diffs across routes and viewports, and computed CSS, colors and fonts. Use fileforge_responsive_action to find layout bugs. Files and baselines are saved locally. capture_screenshot needs the tab to be visible. Needs the extension. |
| [fileforge_workflow_action](#fileforge_workflow_action) | 6 | Record browser actions as a reusable recipe, then list, replay, export or delete recipes. Use this to repeat a sequence you did by hand. Use fileforge_task_action for scheduled or multi-step routines. Replaying really clicks and types in your signed-in browser, and delete_recipe is permanent. Needs the extension. |

## fileforge_a11y_action

Check one page's accessibility: run an audit, read the accessibility tree, and check keyboard navigation and color contrast. Use this for focused accessibility work, and fileforge_audit_action for a wider audit. Doesn't change the page; results can be stored locally. Needs the extension.

### Actions

- `audit`: Run an accessibility audit against the active or specified tab.
- `get_tree`: Get the accessibility tree for the current page.
- `check_keyboard`: Check keyboard navigability.
- `check_contrast`: Check color contrast across the page.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `standard` | string | Accessibility standard to check against. One of: `wcag2a`, `wcag2aa`, `wcag21aa`. Default: `wcag2aa`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |

## fileforge_api_action

Work with the API calls a page makes: discover REST and GraphQL requests, find OpenAPI specs, and export them as curl, Postman or MSW mocks. Reads a running DevTools session, so call start_session on fileforge_devtools_action first or results are empty. Exports replace a file of the same name and can include captured auth headers, so review them before sharing. Needs the extension.

### Actions

- `discover`: List the API calls captured in a tab, grouped by path, method or status and by domain. Stores the result by default.
- `get_graphql_operations`: List the GraphQL requests captured in a tab. Stores the result by default.
- `find_openapi_specs`: Send HEAD requests to common OpenAPI and Swagger paths on the tab's origin and list the ones found.
- `export_curl`: Write the captured API calls to a shell file as curl commands.
- `export_postman`: Write the captured API calls to a Postman collection file.
- `generate_msw_mocks`: Write the captured API calls to a file of MSW mock handlers.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `groupBy` | string | Field to group API calls by. One of: `route`, `method`, `status`. Default: `route`. |
| `includeBodies` | boolean | Include response bodies. Default: `false`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `filename` | string | Output filename. |

## fileforge_app_action

Inspect a web app in an open tab: detect its framework, and read routes, Next.js data, client storage, feature flags and React tree hints. Use this to understand how an app is built. Use fileforge_coding_action for a full bundle. Read-only, but get_client_storage returns raw localStorage and sessionStorage values, which can include tokens. Needs the extension.

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
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `includeStateHints` | boolean | Include hints about client state. Default: `false`. |

## fileforge_audit_action

Audit a page or site for SEO, content, policy and client-side security issues. Prefer query_audit with a preset; compare_runs shows what changed between stored audits. Use fileforge_a11y_action, fileforge_perf_action or fileforge_responsive_action for one focused check. reveal_client_security_value needs FILEFORGE_ALLOW_SECRET_REVEAL=1. Results can be stored. Needs the extension.

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
| `target` | object | What to audit: { url } or { tabId }. Defaults to the active tab. |
| `preset` | string | Named set of query modules. One of: `quick_audit`, `full_page_audit`, `full_site_audit`, `seo_audit`, `accessibility_audit`, `performance_audit`, `landing_page_audit`, `chrome_extension_landing_audit`, `conversion_audit`, `technical_audit`, `privacy_trust_audit`, `pre_launch_audit`, `post_deploy_audit`, `competitor_audit`, `regression_audit`. |
| `query` | object | Modules to return and their options. Takes priority over preset. Modules: page, seo, accessibility, performance, conversion, visual, technical, privacyTrust, structuredData, links, assets, forms, crawl, scores, issues, roadmap, report, snapshot, summary. |
| `tabId` | string | Tab ID, or "active" for the active tab. |
| `beforeSnapshotId` | string | ID of the earlier snapshot. |
| `afterSnapshotId` | string | ID of the later snapshot. |
| `url` | string | Page URL. Omit to use the active tab where the action allows it. |
| `routes` | array of string | Route paths to visit, such as "/pricing". |
| `maxPages` | number | Maximum pages to visit. Default: `20`. |
| `maxChecks` | number | Maximum checks to run. Default: `50`. |
| `crawlRef` | string | Ref of a stored crawl to reuse. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `project` | string | Project name that groups stored results. Default: `default`. |
| `listingCopy` | string | Store listing text to check. |
| `manifest` | object | Extension manifest to check. |
| `namespace` | string | Web storage area that holds the value. One of: `localStorage`, `sessionStorage`. |
| `key` | string | Storage key whose value to reveal. |
| `location` | string | Exact location returned by the audit. |
| `ref` | string | Ref of a stored result. |
| `issues` | array of object | Issues to rank. |
| `projectType` | string | Project type used to rank issues. Default: `generic`. |
| `beforeRef` | string | Ref of the earlier stored result. |
| `afterRef` | string | Ref of the later stored result. |
| `filename` | string | Output filename. |
| `summaryMode` | string | Summary length. Default: `short`. |
| `title` | string | Page title to include in the sensitivity check. |
| `text` | string | Page text to include in the sensitivity check. |

## fileforge_browser_action

Manage tabs and read browser state: go to a URL, switch, reload and close tabs, move through history, wait for a page, and list open tabs. Use query_context to see what's open, and fileforge_page_interaction to act inside a page. Closing tabs can lose unsaved work, and close_tabs_matching can close many at once, so try dryRun first. Sensitive tab URLs are redacted. Needs the extension.

### Actions

- `navigate`: Go to a URL in a tab, or in a new tab with newTab. Requires `url`.
- `open_url_with_capture`: Open a URL with capture on and return what it loaded. Closes the tab afterwards unless keepOpen is set, and stores the result by default. Requires `url`.
- `activate_tab`: Switch to a tab. Requires `tabId`.
- `close_tab`: Close a tab. Unsaved work in it is lost. Requires `tabId`.
- `reload_tab`: Reload a tab, optionally bypassing the cache.
- `history`: Go back or forward in a tab. Goes back unless direction says otherwise.
- `wait`: Wait until a tab reaches until: load (the default), idle, or url, which also needs urlIncludes.
- `query_context`: Read open tabs, windows and the active tab, using a preset or a query. Changes nothing.
- `close_tabs_matching`: Close tabs matching urlIncludes or titleIncludes. Use dryRun to preview; keepActiveTab is on by default.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `preset` | string | Preset for query_context. "snapshot" is the automation sweet spot (active tab + nav + compact tabs). "basic" is cheaper (no nav fields). One of: `basic`, `active_only`, `snapshot`, `tabs_compact`, `navigation_state`, `dedupe_state`, `recovery_state`. |
| `query` | object | Fine-grained projection for query_context. Sections: activeTab, tabs, windows, summary, privacy. Merged on top of preset. |
| `tabId` | string | Tab ID or "active". Omit in navigate for smart URL-reuse behaviour. |
| `url` | string | URL for navigate or open_url_with_capture. |
| `active` | boolean | Focus the tab after navigate / open. Default: `true`. |
| `newTab` | boolean | Force a new tab in navigate even if an existing tab has the same URL. Default: `false`. |
| `bypassCache` | boolean | Reload without the browser cache. Default: `false`. |
| `direction` | string | Direction for history action. One of: `back`, `forward`. Default: `back`. |
| `until` | string | Condition to wait for. One of: `load`, `url`, `idle`. Default: `load`. |
| `urlIncludes` | string | URL substring — required for wait(until="url") and close_tabs_matching. |
| `timeoutMs` | number | Time limit in milliseconds. Default: `15000`. |
| `idleMs` | number | Quiet period before considering tab idle. Default: `1500`. |
| `titleIncludes` | string | Title substring for close_tabs_matching. |
| `keepActiveTab` | boolean | Protect active tab from close_tabs_matching. Default: `true`. |
| `dryRun` | boolean | Simulate without closing. Default: `false`. |
| `keepOpen` | boolean | Leave tab open after capture. Default: `false`. |
| `includeApiBodies` | boolean | Include API response bodies. Default: `false`. |
| `includePerformance` | boolean | Include performance metrics. Default: `true`. |
| `includeScreenshot` | boolean | Include a screenshot. Default: `false`. |
| `includeHar` | boolean | Include a HAR capture. Default: `true`. |
| `settleMs` | number | Milliseconds to wait after load before capturing. Default: `500`. |
| `networkIdleMs` | number | Quiet network period that counts as idle, in milliseconds. Default: `500`. |
| `networkIdleTimeoutMs` | number | Longest wait for network idle, in milliseconds. Default: `5000`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `project` | string | Project name that groups stored results. Default: `default`. |

## fileforge_coding_action

Get context for fixing code in one call. inspect_page returns a page's framework, selectors, forms, console, network and performance; audit_routes sweeps many routes for errors; bug_context and article_context gather focused context. Use fileforge_qa_testing for pass/fail checks. Opens pages in your session; results can be stored. Needs the extension.

### Actions

- `inspect_page`: One-shot Chrome coding context for a URL or active tab: DOM, selectors, forms, framework, console, network, API, a11y, responsive, perf, and optional screenshot.
- `audit_routes`: Fast hidden-Chrome route sweep for coding: captures load-time console, network, API failures, a11y/responsive issues, selectors, and compact summaries per route. Requires `baseUrl`, `routes`.
- `bug_context`: Capture a compact bug-fix bundle from Chrome for Codex: page context, issues, HAR-style network export, and optional screenshot/API bodies. Requires `url`.
- `article_context`: Extract and store an article/documentation context bundle for research debugging. Captures article text, heading outline, metadata, links, code blocks, framework info, and page route state. Ideal for docs, blogs, changelogs, README pages, and research pages that an agent needs to consume.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | string | Optional URL to open. If omitted, use the active tab. |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `reload` | boolean | Reload the page before capturing. Default: `false`. |
| `keepOpen` | boolean | Leave the tab open afterward. Default: `false`. |
| `includeScreenshot` | boolean | Include a screenshot. Default: `true`. |
| `includeApiBodies` | boolean | Include API response bodies. Default: `true`. |
| `includeStorage` | boolean | Include client storage. Values are not redacted. Default: `false`. |
| `includePerformance` | boolean | Include performance metrics. Default: `true`. |
| `domDepth` | number | How many DOM levels to include. Default: `3`. |
| `timeoutMs` | number | Time limit in milliseconds. Default: `15000`. |
| `settleMs` | number | Milliseconds to wait after load before capturing. Default: `750`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `project` | string | Project name that groups stored results. Default: `default`. |
| `baseUrl` | string | Origin that routes are resolved against. |
| `routes` | array of string | Route paths to visit, such as "/pricing". |
| `title` | string | Bug title. Defaults to the page title. |
| `maxTextLength` | number | Maximum text length to return. Default: `50000`. |
| `includeComparison` | boolean | Include visible vs article comparison data Default: `true`. |

## fileforge_devtools_action

Read DevTools data for a tab, from the moment a session starts: console, JS errors, network requests, API responses, WebSockets and performance. Prefer query_devtools with a preset; the get_* actions are older. Attaches the debugger, so Chrome shows its debugging bar. evaluate runs JavaScript in the page and replay_request re-sends a request; both can change data and have guards. Needs the extension.

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
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `preset` | string | Named set of query modules. One of: `debug_page`, `qa_failure_bundle`, `js_error_debug`, `network_debug`, `api_debug`, `graphql_debug`, `performance_debug`, `security_debug`, `third_party_audit`, `full_diagnostics`, `har_summary`. |
| `query` | object | Modules to return and their options. Takes priority over preset. Modules: session, page, console, jsErrors, network, apiResponses, graphql, performance, webSockets, coverage, storageSummary, sourceMaps, requestChains, apiInsights, harSummary, security, thirdParties, issues, recommendations, summary, privacy. |
| `autoStartSession` | boolean | Start a capture session if none is running. |
| `captureForMs` | number | How long to capture, in milliseconds. |
| `stopAfterCapture` | boolean | Stop the session after capturing. |
| `operation` | string | Session operation to perform. One of: `start`, `stop`, `clear`, `status`. |
| `levels` | array of string | Console levels to include. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `includeBodies` | boolean | Include response bodies. |
| `filter` | object | Filter by status, type or URL. |
| `expression` | string | JavaScript to run in the page. |
| `dryRun` | boolean | Report what would happen without doing it. |
| `allowDangerous` | boolean | Allow expressions the safety check blocks. Use with care. |
| `requestId` | string | ID of a captured network request. |
| `overrides` | object | Request fields to change when replaying, such as method. |
| `allowUnsafeMethods` | boolean | Allow replaying non-idempotent requests. Use with care. |
| `filename` | string | Output filename. |

## fileforge_export_action

Write stored results or SQL query output to a file in formats such as CSV, JSON, Markdown, HAR or ZIP. Use this to hand data to another tool. Use fileforge_result_action or fileforge_sql_action to read data without creating a file. Writes only to FileForge's exports folder, and a filename you reuse replaces that file.

### Actions

- `result`: Export a stored result ref to a file. Requires `ref`.
- `query`: Run a SQL query and export results to a file. Requires `query`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `ref` | string | Ref of a stored result. |
| `format` | string | Output format. One of: `json`, `csv`, `markdown`, `html`, `har`, `sqlite`, `zip`, `postman`, `msw`. Default: `csv`. |
| `filename` | string | Output filename. |
| `query` | string | SQL SELECT whose rows to export. |

## fileforge_extension_action

Inspect a Chrome extension: manifest, permissions, storage, service worker, content-script injection and errors. Use this to debug an extension you're building, and fileforge_audit_action for store policy checks. reveal_storage_value needs FILEFORGE_ALLOW_SECRET_REVEAL=1. Needs the extension.

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
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `project` | string | Project name that groups stored results. Default: `default`. |
| `area` | string | chrome.storage area to read. One of: `all`, `local`, `sync`, `session`. Default: `local`. |
| `key` | string | Storage key whose value to reveal. |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `selectors` | array of string | CSS selectors of the target elements. |

## fileforge_eye_action

Monitor many tabs at once: network traffic, console errors, JS exceptions, DOM changes and WebSocket frames. Set tripwires such as "status &gt;= 500", then read get_tripwires; they don't notify you. watch_person tags events that mention an identity. Use fileforge_devtools_action for one tab in depth. Attaches the debugger to watched tabs; the incognito actions open and close windows. Needs the extension.

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
| `tabId` | number | Numeric tab ID: the tab to lock onto, or the incognito tab to close. |
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

Fetch, parse and convert files, extract text, and decode data URIs, including those in a page. Use this for documents and embedded assets, and fileforge_scrape_action for HTML pages. Fetches public URLs without your browser session; private addresses need FILEFORGE_ALLOWED_FETCH_HOSTS. Local paths need the output folders of ~/.fileforge or FILEFORGE_ALLOWED_READ_PATHS. Can write files locally.

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
| `url` | string | Public http(s) URL, or a local path in an allowed folder. |
| `from` | string | Source format. Inferred from the URL and content type if omitted. |
| `to` | string | Target format: json, csv, tsv or txt. csv and tsv need tabular input. |
| `dataUri` | string | Data URI to read. |
| `textPreviewLimit` | number | Maximum characters in the text preview. Default: `1200`. |
| `includeTextPreview` | boolean | Include a preview of the text. Default: `true`. |
| `project` | string | Project name that groups stored results. Default: `default`. |
| `run` | string | Run ID that groups output files. |
| `name` | string | Output file name. Default: `converted-data-uri`. |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `limit` | number | Maximum items to return. Default: `200`. |
| `format` | string | Image format for convert_data_uri_image, or the format to parse as for parse_resource. Inferred if omitted when parsing. Default: `png`. |
| `quality` | number | Image quality for lossy formats. Default: `0.92`. |

## fileforge_memory_action

Remember pages over time: save a page, find earlier visits, diff it against a previous visit, and search saved pages or pull evidence for a question. Use this to see what changed on a page. Use fileforge_result_action to read tool results and fileforge_search_action to search history. Data stays in ~/.fileforge. save_page and diff_page need the extension.

### Actions

- `save_page`: Save the text of a tab's page to local memory.
- `query`: Search saved pages by keyword. Requires `query`.
- `semantic_search`: Run the same keyword search as query. Embeddings are not configured. Requires `query`.
- `answer`: Return saved pages relevant to a question as evidence. It doesn't write an answer. Requires `question`.
- `find_previous_visit`: Find the saved copy of a URL. Requires `url`.
- `diff_page`: Compare a tab's text with a stored result (ref) or the page's saved copy. Stores the diff by default.
- `compact_result`: Summarize a stored result. Requires `ref`.
- `get_result_slice`: Read part of a stored result using offset and limit. Requires `ref`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `project` | string | Project name that groups stored results. Default: `default`. |
| `query` | string | Search text. |
| `question` | string | Question to answer from saved pages. |
| `url` | string | URL to look up in saved pages. |
| `limit` | number | Maximum items to return. Default: `10`. |
| `ref` | string | Ref of a stored result. |
| `offset` | number | Items to skip, for paging. Default: `0`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |

## fileforge_note_action

Keep local notes: create, list and search them. Use this to save findings across sessions. Use fileforge_memory_action to save page content and fileforge_report_action for shareable evidence. Notes stay in ~/.fileforge, and there's no update or delete action.

### Actions

- `create`: Create a local note. Requires `title`, `body`.
- `list`: List saved notes.
- `search`: Search notes by text. Requires `query`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `title` | string | Note title. |
| `body` | string | Note text. |
| `tags` | array of string | Tags to attach. |
| `url` | string | Associated URL, if any |
| `tag` | string | Tag to filter by. |
| `limit` | number | Maximum items to return. Default: `20`. |
| `offset` | number | Items to skip, for paging. Default: `0`. |
| `query` | string | Text to search notes for. |

## fileforge_page_interaction

Read and act inside one open page: get text, snapshots and forms, click, fill, scroll, assert, and debug selectors. click and fill act on the real signed-in page, so they can submit or change data. hide_elements lasts until restore_hidden_elements. Use fileforge_qa_testing for repeatable checks across pages and fileforge_scrape_action for structured extraction. Needs the extension.

### Actions

- `get_text`: Get visible text from a page or selector.
- `get_dom_snapshot`: Snapshot the DOM tree.
- `get_layered_snapshot`: Layered DOM snapshot with screenshots.
- `get_accessibility_tree`: Get the page accessibility tree.
- `get_interactive_elements`: List interactive elements on the page.
- `get_forms`: Extract forms on the page.
- `wait_for_selector`: Wait for a selector to appear. Requires `selector`.
- `click`: Click a selector. Requires `selector`.
- `fill`: Fill a form field. Requires `selector`, `value`.
- `scroll`: Scroll the page.
- `reveal`: Scroll a selector into view. Requires `selector`.
- `get_element_debug_info`: Debug info for an element. Requires `selector`.
- `hide_elements`: Hide elements matching selectors. Requires `selectors`.
- `restore_hidden_elements`: Restore previously hidden elements.
- `extract_article`: Extract the article-style main content.
- `compare_visible_vs_article`: Compare visible text against extracted article.
- `assert`: Run assertions against page state (url, title, text, selectors, inputs). Requires `assertions`.
- `smoke_test`: Quick health check: loaded, text, interactives, errors, images, layout.
- `find_errors`: Find visible error text patterns on the page.
- `check_broken_images`: Detect broken or unloaded images.
- `check_links`: Inspect all anchor links for missing hrefs, javascript:, external, etc.
- `check_layout`: Detect layout issues: overflow, zero-size clickables, overlapping elements, modals.
- `debug_selector`: Debug a CSS selector: match count, visibility, alternatives, warnings. Requires `selector`.
- `debug_clickability`: Check why an element can or cannot be clicked. Requires `selector`.
- `capture_debug_bundle`: One-call diagnostic bundle: page info, errors, layout, images, links, screenshot.
- `wait_for_page_change`: Poll until page state changes (url, title, text, elements) or timeout.
- `compare_snapshots`: Compare two stored page state snapshots by stateId. Requires `beforeStateId`, `afterStateId`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `false`. |
| `selector` | string | CSS selector. |
| `selectors` | array of string | CSS selectors of the target elements. |
| `timeoutMs` | number | Time limit in milliseconds. Default: `10000`. |
| `depth` | number | Depth for DOM snapshot |
| `fallback` | boolean | Try a simpler method if the first one fails. Default: `true`. |
| `maxHtmlLength` | number | Maximum HTML length to return. Default: `200000`. |
| `textSampleLimit` | number | Maximum characters in the text sample. Default: `5000`. |
| `includeScreenshotFallback` | boolean | Use a screenshot when text extraction fails. Default: `false`. |
| `project` | string | Project name that groups stored results. Default: `default`. |
| `includeSelectors` | boolean | Include CSS selectors for elements. Default: `true`. |
| `value` | string | Value to fill |
| `direction` | string | Scroll direction. One of: `up`, `down`, `top`, `bottom`. Default: `down`. |
| `amount` | number | Scroll distance in pixels. Default: `500`. |
| `maxTextLength` | number | Maximum text length to return. Default: `50000`. |
| `assertions` | array of object | List of assertions. Each has: type, value?, selector?, text?, count?. |
| `checks` | array of string | Specific checks to run (smoke_test or check_layout). Defaults apply if omitted. |
| `includeHidden` | boolean | Include hidden elements in find_errors / check_broken_images / check_links. Default: `false`. |
| `maxMatches` | number | Max matches for find_errors. Default: `50`. |
| `mode` | string | Link checking mode. One of: `extract_only`, `validate_same_origin`, `validate_all`. Default: `extract_only`. |
| `includeExternal` | boolean | Include external links. Default: `true`. |
| `include` | array of string | Bundle sections: pageInfo, viewport, visibleText, interactiveElements, forms, screenshot, errors, layoutIssues, brokenImages, links. |
| `maxTextChars` | number | Maximum characters of text to return. Default: `6000`. |
| `maxElements` | number | Maximum elements to return. Default: `100`. |
| `previousStateId` | string | stateId from a previous query_page / smoke_test / capture_debug_bundle. |
| `previousUrl` | string | URL to compare the current page against. |
| `previousTextHash` | string | Text hash to compare the current page against. |
| `changeTypes` | array of string | Which change types to watch. Defaults to all. One of: `url`, `title`, `visibleText`, `dom`, `interactiveElements`. |
| `beforeStateId` | string | stateId of the earlier page state. |
| `afterStateId` | string | stateId of the later page state. |

## fileforge_perf_action

Run a performance audit on a URL across viewports and return Core Web Vitals. Use this for a performance check of one page. Use fileforge_devtools_action for raw session data and fileforge_audit_action for SEO, content and security. Loads the URL in its own tab, closes it afterward, and stores the result by default. It doesn't change the site. Needs the extension.

### Actions

- `audit`: Run a performance audit (Core Web Vitals) across viewports. Requires `url`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | string | Page URL to audit. |
| `viewports` | array of string | Viewport presets to use, such as "desktop" or "mobile". One of: `desktop`, `tablet`, `mobile`. Default: `["desktop","mobile"]`. |
| `includeScreenshot` | boolean | Include a screenshot. Default: `false`. |
| `timeoutMs` | number | Time limit in milliseconds. Default: `15000`. |
| `settleMs` | number | Milliseconds to wait after load before capturing. Default: `750`. |
| `networkIdleMs` | number | Quiet network period that counts as idle, in milliseconds. Default: `500`. |
| `networkIdleTimeoutMs` | number | Longest wait for network idle, in milliseconds. Default: `5000`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `project` | string | Project name that groups stored results. Default: `default`. |

## fileforge_qa_testing

Run repeatable pass/fail checks: smoke tests, page boot, routes, console, network, forms and element watches. Use fileforge_page_interaction for individual steps and fileforge_coding_action while fixing code. URL checks load pages in your session. check_console_clean and check_network_clean read a running DevTools session and return SESSION_NOT_STARTED without one. Needs the extension.

### Actions

- `run_frontend_check`: Load a page, plus any routes, and list issues on each. Fails on high or critical issues. Stores the result by default. Requires `url`.
- `run_smoke_test`: Load one page without a screenshot and list issues. Fails on high or critical issues. Stores the result by default. Requires `url`.
- `check_page_boot`: Load one page and list issues, without storing anything. Fails on high or critical issues. Requires `url`.
- `check_routes`: Load each route against baseUrl and list issues per route. Fails on high or critical issues. Requires `baseUrl`, `routes`.
- `check_console_clean`: Pass only if the running DevTools session on a tab has no console issues.
- `check_network_clean`: Pass only if the running DevTools session on a tab has no failed requests.
- `check_forms`: Report issues in the forms on an open tab.
- `watch_element`: Start watching an element for changes and return a watchId. Requires `selector`.
- `capture_element_change`: Read the changes recorded by watch_element, by watchId or selector. Stores the result by default.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | string | Page URL to load. |
| `baseUrl` | string | Origin that routes are resolved against. |
| `routes` | array of string | Route paths to visit, such as "/pricing". |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `selector` | string | CSS selector of the target element. |
| `watchId` | string | ID returned when the watch started. |
| `timeoutMs` | number | Time limit in milliseconds. Default: `30000`. |
| `project` | string | Project name that groups stored results. Default: `default`. |

## fileforge_report_action

Generate evidence bundles from the active tab: a bug report, PR evidence with screenshots and QA results, or a full debug bundle. Use this when you need something to share or attach. Use fileforge_coding_action for context while working. Bundles are saved locally and can contain page data, so review them before sharing. Needs the extension.

### Actions

- `bug`: Generate a bug report bundle from the active tab. Requires `title`.
- `pr_evidence`: Generate a PR evidence bundle (screenshots, QA results, diff). Requires `title`.
- `debug_bundle`: Create a debug bundle with full diagnostics. Requires `title`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `title` | string | Report title. |
| `include` | array of string | Evidence to include in the bundle. |
| `format` | string | Output format. One of: `zip`, `markdown`. Default: `zip`. |
| `urls` | array of string | URLs to process. |

## fileforge_responsive_action

Find layout bugs across screen widths: scan a URL, and locate overflow and overlapping elements. capture_matrix takes a screenshot at each viewport. Use fileforge_visual_action to compare screenshots against baselines. Loads the page in your session and can store results; it doesn't change the site. Needs the extension.

### Actions

- `scan_layout`: Scan layout for responsive issues across widths. Requires `url`.
- `find_overflow`: Find horizontal overflow at responsive widths.
- `find_overlaps`: Find overlapping element boxes.
- `capture_matrix`: Capture screenshots at a width matrix. Requires `url`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | string | Page URL to scan. Required for scan_layout and capture_matrix. |
| `widths` | array of number | Viewport widths to test |
| `checks` | array of string | Checks to run. Defaults apply if omitted. One of: `overflow`, `overlap`, `clipping`, `layoutShift`. |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |

## fileforge_result_action

Read results other tools stored in ~/.fileforge: fetch one by ref, list them, search them, or slice a large one. Use this when a tool returns a ref instead of full data. Use fileforge_sql_action to query across results and fileforge_export_action to write one to a file. Works without the extension.

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
| `limit` | number | Maximum items to return. Default: `100`. |
| `offset` | number | Items to skip, for paging. Default: `0`. |
| `query` | string | Text to search stored results for. |

## fileforge_runtime_action

Check FileForge itself: whether the server and extension are connected, their versions, which tools are available, and recent requests. Use status when other tools report a bridge or connection error. It doesn't touch page content.

### Actions

- `ping`: Check that the MCP server is alive.
- `status`: Get the current status of the MCP bridge and extension connection.
- `capabilities`: List all registered tools and their availability.
- `request_log`: Get recent RPC request log entries.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `limit` | number | Max entries to return Default: `50`. |
| `failuresOnly` | boolean | Return failed requests only. Default: `false`. |
| `includeDetails` | boolean | Include extra detail for each entry. Default: `true`. |

## fileforge_scrape_action

Extract structured content from pages, tabs or a whole site: text, links, tables, metadata, assets and design tokens. Prefer query_scrape; the others are older single-purpose actions. It can't click or submit; use fileforge_page_interaction for that. crawl_site opens real tabs in your signed-in session, up to 50 pages by default. Query stored links and tables with fileforge_sql_action. Needs the extension.

### Actions

- `query_scrape`: GraphQL-style projection over page content (presets + custom queries).
- `compare_scrape_snapshots`: Diff two stored scrape snapshots by ID. Requires `beforeSnapshotId`, `afterSnapshotId`.
- `scrape_page`: Scrape sections of a single page.
- `extract_assets`: Extract assets (images, videos, files) from a page.
- `extract_tables`: Extract tables from the active or specified page.
- `extract_contacts`: Extract email/phone/address contact data.
- `extract_metadata`: Extract page metadata (title, OG, JSON-LD).
- `extract_design_tokens`: Extract colors, fonts, and design tokens.
- `extract_all_debug`: Extract everything (debug only — large payload).
- `scrape_tabs`: Scrape multiple tabs. Requires `tabIds`.
- `scrape_urls`: Open and scrape a list of URLs. Requires `urls`.
- `crawl_site`: Crawl a site up to maxPages. Requires `url`.
- `research_site`: Research a site (multi-step crawl + extract). Requires `url`.
- `analyze_site`: Analyze a site. Requires `url`.
- `extract_resource`: Fetch a specific page resource. Requires `url`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `tabIds` | array of string | Tab IDs to act on. |
| `url` | string | Page URL. Omit to use the active tab where the action allows it. |
| `urls` | array of string | URLs to process. |
| `sections` | array of string | Page sections to scrape. Defaults to all of them. One of: `files`, `images`, `links`, `pageLinks`, `emails`, `phones`, `tables`, `videos`, `colors`, `addresses`, `locations`, `fonts`, `lists`, `icons`, `qrCodes`, `structuredData`, `network`, `metadata`, `assets`, `contacts`, `designTokens`, `dataUris`. |
| `maxPages` | number | Maximum pages to visit. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `project` | string | Project name that groups stored results. Default: `default`. |
| `source` | object | What to scrape: { url } or { tabId }. Defaults to the active tab. |
| `preset` | string | Named set of query modules. One of: `basic`, `page`, `links`, `tables`, `seo_audit`, `landing_page_audit`, `article_extract`, `research_extract`, `competitor_snapshot`, `pricing_audit`, `structured_data`, `contact_discovery`, `asset_audit`. |
| `query` | object | Sections to return and their options. Takes priority over preset. Sections: page, metadata, headings, sections, links, images, assets, tables, jsonLd, article, contacts, pricing, products, contentQuality, warnings, summary, snapshot. |
| `beforeSnapshotId` | string | ID of the earlier snapshot. |
| `afterSnapshotId` | string | ID of the later snapshot. |

## fileforge_search_action

Search local data by text: saved pages, stored results, notes, browser history and bookmarks. Use all to search everything, or narrow it to one source. Use fileforge_memory_action to compare page visits and fileforge_scrape_action to read a live page. History and bookmarks need the extension.

### Actions

- `all`: Search across pages, notes, history, and bookmarks. Requires `query`.
- `page`: Search within the text of a specific page result. Requires `query`.
- `notes`: Search saved notes. Requires `query`.
- `history`: Search browser history. Requires `query`.
- `bookmarks`: Search browser bookmarks. Requires `query`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `query` | string | Search text. |
| `limit` | number | Maximum items to return. Default: `20`. |
| `ref` | string | Ref of a stored result. |

## fileforge_sql_action

Query FileForge's stored results with SELECT-only SQL. Use list_tables and describe_table to see the schema, query to read rows, and export_query to write rows to a file. Covers saved results and scraped pages, links and tables, not the live browser. Use fileforge_result_action to fetch a single known ref. Works without the extension.

### Actions

- `list_tables`: List all available SQL tables.
- `describe_table`: Describe the columns and schema of a table. Requires `table`.
- `query`: Run a SQL SELECT query against stored data. Requires `query`.
- `export_query`: Run a SQL query and export the results to a file. Requires `query`.

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `table` | string | SQL table name. |
| `query` | string | SQL SELECT statement |
| `ref` | string | Optional result ref to scope the query |
| `limit` | number | Maximum items to return. Default: `100`. |
| `offset` | number | Items to skip, for paging. Default: `0`. |
| `format` | string | Output format. One of: `csv`, `json`, `markdown`. Default: `csv`. |
| `filename` | string | Output filename. |

## fileforge_task_action

Run multi-step work two ways. Tasks (start, add, status, monitor_page) track one job. Routines (create, validate, dry_run, run, plan_from_prompt) are saved and can be scheduled, but cron only fires while this server runs. For a single step, call the tool directly. Runs act in your browser, pausing only at steps that require approval. delete removes a task; routines can only be disabled.

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
| `mode` | string | Kind of task: interactive, collector or monitor. One of: `interactive`, `collector`, `monitor`. Default: `interactive`. |
| `maxMinutes` | number | Maximum run time in minutes. Default: `60`. |
| `capture` | array of string | Page sections to scrape while running. |
| `recipeName` | string | Saved workflow recipe to run asynchronously. |
| `recipe` | object | Inline workflow recipe to save and run asynchronously. |
| `pollIntervalMs` | number | Milliseconds between polls. Default: `15000`. |
| `timeoutMs` | number | Time limit in milliseconds. Default: `180000`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `status` | string | add and edit: pending, running, paused, completed, failed or cancelled. list: any of those, or "all". get_runs: a run status. Default: `all`. |
| `result` | object | Result data to store on the task. |
| `since` | string | ISO timestamp to get events after |
| `format` | string | Output format. One of: `json`, `csv`, `zip`. Default: `json`. |
| `intervalMinutes` | number | Minutes between runs. Default: `5`. |
| `watch` | array of string | Selectors or data types to watch |
| `selector` | string | CSS selector for the table |
| `maxPages` | number | Maximum pages to visit. Default: `5`. |
| `query` | string | Search text to collect results for. |
| `name` | string | Routine name. |
| `inputType` | string | Whether the task starts from a prompt or from steps. One of: `prompt`, `steps`. |
| `prompt` | string | Plain-language description of the routine. |
| `steps` | array of object | Ordered steps: { id, tool, params, dependsOn, condition, onFailure, retry, timeout, outputKey, requiresApproval }. params includes the tool's action. |
| `propsSchema` | object | JSON schema for the routine's inputs. |
| `defaultProps` | object | Default input values. |
| `permissions` | object | What the routine may do, such as { allowBrowser: true }. Also allowNetwork, allowScreenshots, allowCookies, allowClipboard, allowDownloads, allowFilesystemRead, allowFilesystemWrite, allowAuthenticatedSession, allowExternalWebhooks. |
| `triggerType` | string | What starts the routine. One of: `manual`, `cron`, `event`. |
| `cronExpression` | string | Cron schedule for scheduled routines. |
| `enabled` | boolean | Whether the routine can run. |
| `concurrencyPolicy` | string | What to do when a run is already active. One of: `allow`, `skip_if_running`, `queue`, `replace_running`. |
| `retryPolicy` | object | { count, backoffMs } for failed steps. A step's own retry takes priority. |
| `timeoutConfig` | object | { stepMs }: time limit per step. Defaults to 60000. |
| `retentionPolicy` | object | Saved with the routine. Runs do not act on it yet. |
| `exportConfig` | object | Saved with the routine. Runs do not act on it yet. |
| `storageConfig` | object | Saved with the routine. Runs do not act on it yet. |
| `notificationConfig` | object | Saved with the routine. Runs do not act on it yet. |
| `metadata` | object | Free-form metadata to store with the routine. |
| `createdBy` | string | Who created it. One of: `user`, `mcp`, `system`. |
| `reason` | string | Why the change was made. |
| `routineId` | string | Routine ID. |
| `patch` | object | Routine fields to change, using the same names as create. |
| `updatedBy` | string | Who made the change. One of: `user`, `mcp`, `system`. |
| `version` | number | Routine version. |
| `propOverrides` | object | Input values for this run. |
| `simulateMissing` | boolean | Simulate unavailable tools during validation. Default: `false`. |
| `idempotencyKey` | string | Key that prevents starting the same run twice. |
| `priority` | number | Queue priority. Higher runs first. Default: `0`. |
| `trigger` | string | What started this run. One of: `manual`, `cron`, `event`, `mcp`. Default: `manual`. |
| `retryOfRunId` | string | ID of the run this one retries. |
| `parentRunId` | string | ID of the parent run. |
| `runId` | string | Run ID. |
| `limit` | number | Maximum items to return. Default: `50`. |
| `offset` | number | Items to skip, for paging. Default: `0`. |
| `includeStepResults` | boolean | Include each step's result. Default: `true`. |
| `includeEvents` | boolean | Include run events. Default: `true`. |
| `includeRaw` | boolean | Include raw output. Default: `true`. |
| `includeLogs` | boolean | Include logs. Default: `true`. |
| `includeSummary` | boolean | Include a summary. Default: `true`. |
| `filterPermissions` | object | Only return actions whose required permissions are all granted in this map. |
| `hints` | array of string | Extra guidance for plan_from_prompt. |
| `plannedSteps` | array of object | Steps from plan_from_prompt to commit. |

## fileforge_visual_action

Capture and compare how pages look: screenshots of a page, element or region, baselines, visual diffs across routes and viewports, and computed CSS, colors and fonts. Use fileforge_responsive_action to find layout bugs. Files and baselines are saved locally. capture_screenshot needs the tab to be visible. Needs the extension.

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
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `fullPage` | boolean | Capture the whole page, not just the viewport. Default: `false`. |
| `format` | string | Output format. One of: `png`, `jpeg`. Default: `png`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `includeBase64` | boolean | Return the image as base64 as well as a file. Default: `false`. |
| `project` | string | Project name that groups stored results. Default: `default`. |
| `run` | string | Optional run ID for grouping comparison artifacts |
| `name` | string | Baseline name Default: `matrix`. |
| `url` | string | Optional page URL to include in metadata |
| `viewport` | string | Optional viewport label or dimensions Default: `desktop`. |
| `maxHeight` | number | Maximum capture height in pixels. Default: `100000`. |
| `scrollWaitMs` | number | Milliseconds to wait after each scroll. Default: `120`. |
| `hideFixedElements` | boolean | Hide fixed elements while stitching the capture. Default: `true`. |
| `selector` | string | CSS selector of the target element. |
| `padding` | number | Extra pixels around the element. Default: `0`. |
| `x` | number | Left edge in pixels. |
| `y` | number | Top edge in pixels. |
| `width` | number | Width in pixels. |
| `height` | number | Height in pixels. |
| `coordinateSpace` | string | Whether x and y are relative to the viewport or the page. One of: `viewport`, `page`. Default: `viewport`. |
| `timeoutMs` | number | Time limit in milliseconds. Default: `15000`. |
| `viewports` | array of string | Viewport presets to use, such as "desktop" or "mobile". Default: `["desktop"]`. |
| `active` | boolean | Focus the tab while capturing. Default: `false`. |
| `keepOpen` | boolean | Leave the tab open afterward. Default: `false`. |
| `settleMs` | number | Milliseconds to wait after load before capturing. Default: `500`. |
| `baseUrl` | string | Origin that routes are resolved against. |
| `routes` | array of string | Route paths to visit, such as "/pricing". |
| `namePrefix` | string | Prefix for baseline names. Default: ``. |
| `ignoreSelectors` | array of string | CSS selectors to mask before comparing. |
| `threshold` | number | Per-channel color difference to ignore. 0 counts every change. Default: `0`. |
| `ref` | string | Ref of a stored result. |
| `filename` | string | Output filename. |

## fileforge_workflow_action

Record browser actions as a reusable recipe, then list, replay, export or delete recipes. Use this to repeat a sequence you did by hand. Use fileforge_task_action for scheduled or multi-step routines. Replaying really clicks and types in your signed-in browser, and delete_recipe is permanent. Needs the extension.

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
| `tabId` | string | Tab ID, or "active" for the active tab. Default: `active`. |
| `steps` | array of object | Optional explicit recipe steps to save immediately. |
| `assertions` | array of object | Optional assertions saved with the recipe. |
| `inputs` | object | Variable substitutions for the recipe |
| `capture` | array of string | Data to capture while running. One of: `console`, `network`, `screenshots`. |
| `store` | boolean | Save the result in ~/.fileforge and return a ref. Default: `true`. |
| `format` | string | Output format. One of: `json`, `playwright`. Default: `json`. |
