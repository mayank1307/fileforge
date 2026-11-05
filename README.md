# FileForge

Give your AI agent a real DevTools seat in your own signed-in Chrome.

<!-- TODO: record a 30-second demo (agent opens a page, reads console errors and network calls, fixes a bug) and save it as docs/assets/demo.gif, then uncomment the next line. -->
<!-- ![FileForge demo](docs/assets/demo.gif) -->

FileForge is a local MCP server plus a Chrome extension. Your MCP client (Claude Code, Claude Desktop, Codex, Cursor) talks to the server over stdio; the server talks to the extension over a WebSocket on `127.0.0.1`; the extension drives your tabs through Chrome APIs and the DevTools Protocol.

## How it differs from Playwright-based MCP servers

Playwright-based servers usually drive a browser they launch themselves, with a separate profile. FileForge works in the Chrome you already use:

- **Your real sessions.** The agent sees the tabs you have open, already signed in to your apps, staging sites and dashboards. No re-logging in, no copied cookies.
- **DevTools data, not just the DOM.** Console logs, JS errors, network requests and response bodies, performance traces, accessibility trees, screenshots and visual diffs.
- **All local.** The server, the bridge and the extension run on your machine. Results are stored in SQLite under `~/.fileforge/` and can be queried with SQL.
- **Complements your test runner.** FileForge is for an agent looking at a live page. Keep Playwright, Cypress or Vitest for your test suite.

## Quickstart

You need Node.js 20 or newer and Google Chrome. Full instructions for every client and OS are in [docs/setup.md](docs/setup.md), which also covers [installing from npm](docs/setup.md#install-from-npm).

**1. Install the server**

```bash
git clone https://github.com/mayank1307/fileforge.git
cd fileforge/mcp-server
npm install
```

**2. Load the extension**

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `extension/` folder of your clone.

**3. Add the MCP config**

For Claude Code, using the absolute path of your clone:

```bash
claude mcp add fileforge -- node /absolute/path/to/fileforge/mcp-server/src/index.js
```

Then start a session and ask the agent to call `fileforge_runtime_action` with `action: "status"`. It should report the extension as connected. Run `npm run verify` in `mcp-server/` at any time to check the install.

## Tool groups

Every tool takes an `action` parameter. The full reference, with every action and parameter, is in [docs/tools.md](docs/tools.md).

For a tool specification page, use [docs/tools-spec.json](docs/tools-spec.json). It includes every registered tool and action, features, input schemas, request templates, response conventions, and available capability metadata. Undeclared output schemas are explicitly marked. Regenerate both references with `cd mcp-server && npm run docs:tools`.

| Tool | What it does |
| --- | --- |
| `fileforge_runtime_action` | Server health, extension status and version check, request log |
| `fileforge_browser_action` | Open, switch, reload and close tabs; read tab and window state |
| `fileforge_page_interaction` | Read and act on the DOM: text, snapshots, forms, click, fill, assert, debug selectors |
| `fileforge_scrape_action` | Scrape pages, tables, metadata, assets and design tokens; crawl a site |
| `fileforge_devtools_action` | Console, JS errors, network, API responses, WebSockets, `evaluate`, HAR export |
| `fileforge_eye_action` | Watch several tabs at once for network, console and DOM activity; set tripwires |
| `fileforge_coding_action` | One-call coding context for a page, a route sweep, or a bug |
| `fileforge_qa_testing` | Smoke tests, route checks, clean-console and clean-network checks |
| `fileforge_audit_action` | SEO, accessibility, content, security and policy audits with presets |
| `fileforge_a11y_action` | Accessibility tree, keyboard and contrast checks |
| `fileforge_responsive_action` | Layout scans across widths; overflow and overlap finder |
| `fileforge_perf_action` | Performance audit and metrics |
| `fileforge_visual_action` | Screenshots, baselines, visual diffs, CSS, colors and fonts |
| `fileforge_api_action` | Discover REST and GraphQL calls; export curl, Postman or MSW mocks |
| `fileforge_app_action` | Detect the framework; read routes, client storage, feature flags, Next.js data |
| `fileforge_extension_action` | Inspect a Chrome extension's manifest, storage, service worker and errors |
| `fileforge_workflow_action` | Record and replay browser workflows |
| `fileforge_task_action` | Create, schedule and run multi-step routines |
| `fileforge_result_action` | Fetch, list, search and slice stored results |
| `fileforge_sql_action` | List, describe and query stored data with SQL |
| `fileforge_search_action` | Search saved pages, notes, history and bookmarks |
| `fileforge_memory_action` | Save pages, diff them against earlier visits, search memory |
| `fileforge_note_action` | Local notes |
| `fileforge_file_action` | Fetch, parse, convert and decode files and data URIs |
| `fileforge_report_action` | Bug reports, PR evidence and debug bundles |
| `fileforge_export_action` | Export stored results and SQL output to files |

## Security and privacy

- The bridge listens on `127.0.0.1:47821` only. It rejects connections from web pages and from any extension other than FileForge's pinned ID.
- Other local processes need the token in `~/.fileforge/bridge-token`, which only your user can read. Set `FILEFORGE_REQUIRE_PAIRING=1` to require it from the extension too ([pairing](docs/setup.md#pairing)).
- Everything is stored locally in `~/.fileforge/`. There is no telemetry, and FileForge makes no outbound requests on its own: everything it fetches is a page or URL a tool was asked to load.
- Tools that would return raw secret values are off unless you set `FILEFORGE_ALLOW_SECRET_REVEAL=1`.
- The debugger attaches only to the tabs a tool call names (Eye watches every tab only when called with `all: true`), and Chrome shows its "started debugging this browser" bar while it does. Every permission is explained in [docs/permissions.md](docs/permissions.md).

The threat model and how to report a vulnerability are in [SECURITY.md](SECURITY.md).

## More

- [Setup for every client and OS](docs/setup.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).
