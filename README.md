# FileForge

Your agent watches your signed-in Chrome across tabs, sweeps your routes, and hands you the bug report.

<!-- TODO: record the demo in launch/demo-script.md, save it as docs/assets/demo.gif, then uncomment the next line. -->
<!-- ![FileForge demo](docs/assets/demo.gif) -->

FileForge is a local MCP server plus a Chrome extension. It works with Claude Code, Claude Desktop, Codex and Cursor. Your client talks to the server over stdio, the server talks to the extension over a WebSocket on `127.0.0.1`, and the extension uses Chrome APIs and the DevTools Protocol.

## What your agent can do

- **Watch several tabs at once.** Follow network traffic, console errors, JS exceptions and DOM changes across tabs, and set tripwires such as `status >= 500` to check later.
- **Sweep your routes.** One call visits a list of routes and returns console errors, failed API calls, and accessibility and layout issues for each.
- **Get coding context for a page.** One call returns the framework, selectors, forms, console, network and performance.
- **Hand you the evidence.** Generate bug reports, PR evidence bundles and debug bundles, or export captured API calls as curl, Postman or MSW mocks.
- **Come back to earlier results.** Audits, route sweeps and scrapes are saved in SQLite under `~/.fileforge/`, where the agent can read them with SQL later. It can also compare two audit runs. Scraped links and tables get their own tables.
- **Repeat the work.** Record a browser workflow and replay it, or schedule a routine.

All of this runs in the Chrome you already use, signed in to your own apps and staging sites.

## Try these prompts

Open a page you're working on, then ask your agent:

```text
Use FileForge to show the console errors and failed network requests on my active tab, then find the likely cause in this repo.
```

```text
Use FileForge to sweep /, /pricing and /settings on http://localhost:3000 and list the console errors and failed API calls for each route.
```

```text
Use FileForge to watch my open tabs and set a tripwire for status >= 500. I'll click around. When I say done, tell me what fired and which request caused it, then write a bug report.
```

## How it compares

Reaching your signed-in browser is no longer unique to FileForge. These are the differences as of November 2026, from each project's own docs:

| | FileForge | [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | [Playwright MCP](https://github.com/microsoft/playwright-mcp) |
| --- | --- | --- | --- |
| Use your signed-in browser | Extension, connected whenever the server runs | `--autoConnect`, after enabling remote debugging in Chrome | `--extension`, choosing a tab to connect |
| Install | npm, plus an unpacked extension | `npx`, no extension | `npx`, plus a Chrome Web Store extension for your signed-in browser |
| Cross-tab watching and tripwires | Yes | Not in its tool reference | Not in its docs |
| Route sweep in one call | Yes | Not in its tool reference | Not in its docs |
| Bug report and PR evidence bundles | Yes | Not in its tool reference | Not in its docs |
| SQL over saved results | Yes | Not in its tool reference | Not in its docs |
| Heap snapshots and Lighthouse | No | Yes | Not in its docs |
| Browsers | Chrome | Chrome | Chrome, Edge, Firefox, WebKit |
| Maintained by | One independent developer | Google's Chrome DevTools team | Microsoft |

**Pick Chrome DevTools MCP** for memory leaks, Lighthouse audits or an install with no extension. **Pick Playwright MCP** to automate other browsers or generate tests. **Pick FileForge** when an agent should keep an eye on several tabs, check many routes, and produce evidence you can keep. It complements Playwright, Cypress and Vitest; keep those for your test suite.

**Context cost:** the tool list is about 12,000 tokens (26 tools, roughly 46 KB of schemas), which your client may load at the start of a session. If that matters, compare it with your other servers before leaving it on all the time.

## Quickstart

You need Node.js 20 or newer and Google Chrome.

```bash
npm install -g fileforge-mcp-server
```

```bash
fileforge-setup
```

`fileforge-setup` prints the extension folder and the exact command or config for each client, using your real paths. It changes nothing unless you pass `--write`. Then:

1. **Load the extension.** Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder it printed. FileForge isn't on the Chrome Web Store.
2. **Connect your client.** For Claude Code or Codex, run the command it printed. For Cursor or Claude Desktop, run `fileforge-setup --client cursor --write` or `fileforge-setup --client claude-desktop --write`, which keeps your other servers and saves the old file as `.bak`.
3. **Check it.** With your client open and Chrome running, run `fileforge-verify`, then ask your agent to call `fileforge_runtime_action` with `action: "status"`.

Prefer a clone? Full instructions for every client and OS are in [docs/setup.md](docs/setup.md).

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
| `fileforge_sql_action` | List, describe and query saved results and scraped data with SQL |
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
