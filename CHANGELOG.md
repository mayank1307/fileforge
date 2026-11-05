# Changelog

All notable changes to FileForge are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/mayank1307/fileforge/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mayank1307/fileforge/releases/tag/v0.2.0
