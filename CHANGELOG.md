# Changelog

All notable changes to FileForge are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-05

### Changed

- Rewrote all 26 tool descriptions to say when to use each tool instead of its siblings, and what it changes. Tools now declare MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), and every parameter has a description, with a test that enforces both. The tool list grows from about 12,000 to about 23,000 tokens.
- Every tool now declares an `outputSchema` for the shared response and returns it as `structuredContent` as well as text. Only `ok` is typed, because clients reject a whole call that breaks the schema.
- Every action is now described in the tool list, with its required parameters. Nine tools previously sent only a generic line such as "The page action to perform.", and a test now enforces this and a size budget for the tool list.
- Parameter descriptions now fit the tool they're on. Shared wording no longer leaks across tools (a note's `title` was "Title of the note, report or audit"), `fileforge_scrape_action` lists its presets and sections, and routine settings describe their real shape. `retentionPolicy`, `exportConfig`, `storageConfig` and `notificationConfig` now say that runs don't act on them yet.
- Tool descriptions now state prerequisites and side effects agents couldn't see: which tools need the extension, that `fileforge_api_action` reads nothing without a DevTools session, that `fileforge_file_action` reads local paths, that exports replace a file of the same name, and that cron routines only fire while the server runs. `fileforge_task_action` wrongly said `delete` removes a routine; it removes a task.

### Security

- `fileforge_file_action` could read any local file, including `~/.ssh` keys and FileForge's own bridge token, so a prompt injection could try to extract them. It now reads only from FileForge's output folders and folders listed in the new `FILEFORGE_ALLOWED_READ_PATHS`. If you parse local files elsewhere, set this variable.
- `fileforge_file_action` could fetch `localhost`, your private network and cloud metadata addresses from the server process. These now return `URL_NOT_ALLOWED`, checked at connection time and on every redirect, unless the host is in the new `FILEFORGE_ALLOWED_FETCH_HOSTS`. Fetches now time out after 30 seconds. Browser tools can still open these addresses.

### Removed

- `meta.availableActions` from tool responses. It repeated the tool list on every call, adding about 3 KB to a `fileforge_task_action` response. An `UNKNOWN_ACTION` error still lists the valid actions.
- Parameters that no code read: `outputs` and `export` on `fileforge_task_action`, `export` and `filter` on `fileforge_api_action`, and `checks` and `viewports` on `fileforge_qa_testing`.

### Fixed

- A missing or unknown `action` now returns an `UNKNOWN_ACTION` error listing the available actions and runs nothing. It used to run the tool's first action, such as `navigate` or `create`, with only a warning. Names that differ only in case or punctuation (`closeTab`) still match, but partial matches no longer do.
- Legacy action aliases now reach the action they name. `go_back` used to run `navigate`, and `open_url` ran `open_url_with_capture`.
- `check_console_clean` and `check_network_clean` no longer pass with nothing to check. Without a DevTools session they return `SESSION_NOT_STARTED`. `query_devtools` now does the same, `autoStartSession` now starts a session, and the `session` status action reports it correctly: all three treated a tab with no session as active. Reload the extension to get this.
- QA checks and reports now detect failed network requests. They read requests in a shape the issue check didn't recognize, so they never reported a 4xx, 5xx or failed request.
- `run_smoke_test` and `run_frontend_check` returned `ok: true` whatever they found. `ok` now reflects the result.
- `run_frontend_check`, `run_smoke_test`, `check_page_boot` and `check_routes` now fail only on high or critical issues, because layout signals and blocked analytics fire on most real pages. Other issues are still listed, and `summary.clean` says whether anything was found. `check_console_clean` and `check_network_clean` stay strict.
- The layout scan flagged every element on pages with a centered body, because it compared against the body's width. It now compares against the viewport and reports overflow only when the page really scrolls sideways, ignoring content clipped by a parent. Overlaps now ignore invisible elements and the shapes inside an SVG. Reload the extension to get this.
- Failed actions no longer report success. Many actions wrapped the extension's reply as `{ ok: true, data: reply }`, so a failed click, navigation or `evaluate` returned `ok: true`. The top-level `ok` is now false, with the error alongside it, and routines see the failure too. Actions that only return data, including checks whose `data.ok` is false, now return `ok: false` as well. `fileforge_api_action` and `check_forms` no longer turn an extension failure into an empty success.
- Routine steps that set `action` on the step instead of in `params` now run that action.

## [0.2.2] - 2026-11-05

### Added

- `glama.json`, which names the maintainer for the Glama directory.

### Security

- Sensitive-URL detection now also matches credentials in query strings and fragments (`?code=`, `?access_token=`, `#id_token=`, `?api_key=`, signed-URL parameters), `user:pass@` URLs and known token formats. It applies to `_source`, `query_context` and the `url_contains` assertion. Tabs that only have these in their URL now show as `redacted`.
- The `_source` block on every tool response copied the active tab's full URL and title even for login, OAuth, payment and other sensitive pages that `query_context` redacts. `active_url`, `active_tab_title` and `data_from_url` now use the same redaction, and `same_origin` is `null` when either URL is redacted. The `url_contains` workflow assertion's `actual` value and `query_context`'s `duplicateUrlGroups` are redacted the same way.

## [0.2.1] - 2026-11-05

### Added

- `fileforge-setup` (`npm run setup`) prints the extension folder and each MCP client's config with this install's real paths. With `--client cursor|claude-desktop --write` it adds FileForge to that client's config file, keeping other servers and saving the old file as `.bak`.
- `mcp-server/server.json` and `mcpName`, for listing on the official MCP Registry.
- A `fileforge-mcp-server` command, the same as `fileforge-mcp`, so `npx fileforge-mcp-server` can start the server. Clients that install from the registry run it this way.

## [0.2.0] - 2026-11-04

The first public release.

### Added

- `fileforge_eye_action` is registered in both the server and the extension, with incognito window actions (`open_incognito`, `list_incognito`, `close_incognito`).
- `browser.getActiveTab`, which finds the active tab even while Chrome is unfocused.
- Version handshake: the extension sends `fileforge-hello` with its version on connect, and the server warns when the two differ or when an older extension never says hello. `fileforge_runtime_action` → `status` reports both versions.
- A clear startup error when `better-sqlite3` was built for another Node version, with the `npm rebuild` command to fix it.
- `npm run verify` checks Node, the dependencies, `better-sqlite3`, and, through the live bridge, the connected extension and its version.
- `npm run docs:tools` generates [docs/tools.md](docs/tools.md) and [docs/tools-spec.json](docs/tools-spec.json) from the tool registry, and a test fails when either is out of date.
- [docs/tools-spec.json](docs/tools-spec.json), a machine-readable specification of every registered tool and canonical action: input schemas (shared or action-scoped), capability metadata, request templates and the common response format. Output schemas are not declared in the registry, so the spec marks them `not_declared` rather than inventing one.
- `examples/peer-client.js`, a minimal token-authenticated peer.
- CI on Node 20 and 22 across Ubuntu, macOS and Windows, running the tests and ESLint (`npm run lint`).
- Documentation: a new README, [setup](docs/setup.md), [architecture](docs/architecture.md), [troubleshooting](docs/troubleshooting.md), [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
- MIT license.
- Optional pairing: with `FILEFORGE_REQUIRE_PAIRING=1`, the bridge accepts the extension only after it presents the token in `~/.fileforge/bridge-token`, and closes other connections with code `4001`. `fileforge-pair` (`npm run pair`) prints the token, the side panel's Settings tab saves it, and the toolbar icon, `npm run verify` and `fileforge_runtime_action` → `status` (`PAIRING_REQUIRED`) all report an unpaired extension. See [Pairing](docs/setup.md#pairing).
- An npm package, `fileforge-mcp-server`, that contains the extension as well as the server. `npm install -g` puts `fileforge-mcp`, `fileforge-verify` and `fileforge-pair` on your `PATH`, and the extension loads from the package folder. See [Install from npm](docs/setup.md#install-from-npm).
- The server warns when Chrome is running older extension code than the files in the clone, even when the versions match. The extension reports a build ID (a hash of its files, in `extension/background/buildInfo.js`) in `fileforge-hello` and `runtime.status`; `npm run verify`, the server log and `fileforge_runtime_action` → `status` compare it. `npm run build:id` regenerates it, and a test fails when it is out of date.

### Changed

- The extension moved into `extension/`. Load that folder unpacked, not the repo root.
- WebSocket on `127.0.0.1:47821` is the only transport between the server and the extension.
- `extension/background/mcpNativeBridge.js` is now `mcpBridge.js`, since it has nothing to do with Native Messaging, and the examples moved from `mcp-server/examples/` to `examples/` at the repo root.
- One version, 0.2.0, in `mcp-server/package.json` and `extension/manifest.json`; a test fails if they drift apart. The side panel and HAR exports read the manifest version.
- The side panel has four tabs: Tools, Analytics, Activity and Settings.
- The side panel uses your system fonts instead of loading Inter and JetBrains Mono from Google Fonts, so the extension makes no requests of its own.
- `npm test` runs `node --test`, which now includes the test files directly in `src/` that the old glob skipped.
- The extension counts as connected once the server acknowledges its `fileforge-hello` (`fileforge-hello-ack`), not when the socket opens. Its reconnect delay also resets only then, so a server that keeps refusing it is retried up to once a minute rather than every 3 seconds.
- ESLint 9 with a flat config (`eslint.config.mjs`) replaces ESLint 8 and `.eslintrc.json`. The rules are unchanged.

### Fixed

- The server exits when its MCP client closes stdin. Before, a client that quit without killing it left the server running and holding port 47821, so the old code stayed the bridge owner after an update.
- `fileforge://` URIs use forward slashes on Windows, where they had backslashes.
- Tools that open a URL failed with `No method: browser.openUrl`: `open_url_with_capture`, `inspect_page` and `audit_routes` (`fileforge_coding_action`), and the URL steps in reports, tasks and workflows. They now call `browser.navigate` and `browser.wait`, and the extension still accepts the old names.
- `fileforge_responsive_action` → `capture_matrix` and `fileforge_visual_action` → `export_diff` called extension methods that don't exist, and now run on the server.
- `article_context` lost its page metadata to a call to a method that doesn't exist.
- Screenshots retry when Chrome's `captureVisibleTab` rate limit is hit.
- Tools that open their own background tab bring it forward briefly to take a screenshot, then return you to your tab: `capture_matrix`, `capture_baseline`, `capture_route_baselines`, `inspect_page` with a URL, `open_url_with_capture` and the QA page checks. Asking to capture one of your own hidden tabs still returns `TAB_NOT_VISIBLE`.
- The side panel's Tools catalog no longer advertises methods that don't exist. Entries that named a missing RPC were renamed to the real tool action (`browser.history`, `browser.getRawContext`, `sql.listTables`, `scrape.extractTables`, `app.getClientStorage`) or removed (`page.screenshot`, `a11y.snapshot`, `scrape.links`).
- A contract test fails when the server calls an RPC method the extension doesn't have, or when the side panel's tool catalog lists a method that is neither an extension RPC nor a registered server action.

### Removed

- Native Messaging: the native host manifest, `install-local.js` and `nativeHost.js`.
- The Google and GitHub integrations tool group (Gmail, Drive, Sheets, Calendar, Tasks, Analytics, GitHub), its OAuth setup, and the side panel's Google account card.
- The Chrome Web Store daily report routine and its scheduler.
- The X scraping scripts and the Instagram seed routine.
- The side panel's Chat and Tasks tabs. `fileforge_task_action` is unchanged.
- `fileforge_runtime_action` → `set_privacy_mode`. It stored a setting that nothing enforced.

### Security

- The WebSocket bridge checks every handshake. Extension connections must come from a `chrome-extension://` origin with an allowed ID; peer connections must send no `Origin` and present the token in `~/.fileforge/bridge-token`, created with mode `0600` on first run. Web pages can no longer connect to `ws://127.0.0.1:47821`. Each message type is accepted only from the role allowed to send it.
- The extension ID is pinned to `nlcebipkdgecilmgfpobamljieanadpn` by a `key` in the manifest, and the bridge accepts only that ID. `FILEFORGE_EXTENSION_IDS` replaces the allowlist, for forks.
- `reveal_client_security_value` (`fileforge_audit_action`) and `reveal_storage_value` (`fileforge_extension_action`) return `SECRET_REVEAL_DISABLED` unless the server runs with `FILEFORGE_ALLOW_SECRET_REVEAL=1`.
- `fileforge_eye_action` → `start_watch` needs a `tabs` list or `all: true` before it attaches the debugger, and `auto_track` works only in a watch started with `all: true`.
- Removed nine unused Chrome permissions: `activeTab`, `topSites`, `contextMenus`, `nativeMessaging`, `identity`, `webRequest`, `clipboardRead`, `clipboardWrite` and `offscreen`. [docs/permissions.md](docs/permissions.md) explains each one that remains.
- Removed credentials, OAuth client files and personal data from the tree.
- `~/.fileforge/` and its subfolders are created with mode `0700`, and a folder left at `0755` by an earlier build is tightened when the server starts, so other users on the machine cannot read stored results.
- `capture_screenshot`, `capture_full_page`, `capture_element` and `capture_region` (`fileforge_visual_action`) return `TAB_NOT_VISIBLE` for a tab that isn't the visible one in its window. Before, they captured whatever tab was showing.
- Dependencies upgraded past high-severity advisories: `@modelcontextprotocol/sdk` 1.32.2 and `ws` 8.22.1, plus their transitive fixes.
- zod 4.6.7, past [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). `npm audit --omit=dev` now reports no advisories.

[Unreleased]: https://github.com/mayank1307/fileforge/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/mayank1307/fileforge/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/mayank1307/fileforge/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/mayank1307/fileforge/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/mayank1307/fileforge/releases/tag/v0.2.0
