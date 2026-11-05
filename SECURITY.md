# Security

FileForge gives an AI agent access to the Chrome profile you use every day, including the sites you are signed in to. This page explains what protects that access, what FileForge stores, and how to report a problem.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's **Security** tab and click **Report a vulnerability** ([github.com/mayank1307/fileforge/security/advisories/new](https://github.com/mayank1307/fileforge/security/advisories/new)). Do not open a public issue.

Include the FileForge version (`version` in `mcp-server/package.json`), your OS, and steps to reproduce.

## Threat model

FileForge assumes a single-user machine where you trust the MCP client and agent you connect to it.

**In scope**

- **Web pages.** Any page open in Chrome can try to open a WebSocket to `ws://127.0.0.1:47821`. FileForge must refuse it, so a malicious site cannot drive your browser or read your data through the bridge.
- **Other extensions.** Another installed extension must not be able to pose as FileForge.
- **Accidental secret exposure.** Agents should not receive raw tokens and passwords from page storage unless you opt in.

**Out of scope**

- **The agent itself.** An agent connected to FileForge can do anything the tools allow: read pages you are signed in to, click, fill forms, run JavaScript in a tab with `fileforge_devtools_action` → `evaluate`, and read history and bookmarks. Connect only agents you trust, and review what they do.
- **Prompt injection.** Text on a page the agent reads may try to steer it. FileForge passes page content to the agent as data and cannot tell instructions from content.
- **Processes running as your user.** They can read `~/.fileforge/bridge-token` and everything else in your home directory.
- **Other users on the same machine.** See the known limitations below.

## How the bridge decides who may connect

The MCP server listens on `127.0.0.1:47821` only, never on an external interface. Every WebSocket handshake is checked before it is accepted (`mcp-server/src/bridgeAuth.js`):

1. **Peers** connect with `?role=mcp-peer`. A peer is another FileForge MCP server or a local script. It must send no `Origin` header and must send the `x-fileforge-token` header with the contents of `~/.fileforge/bridge-token`, compared in constant time. Browsers cannot set custom WebSocket headers, so a web page can never present the token.
2. **Everything else** must come from a Chrome extension: its `Origin` must be `chrome-extension://<id>`, and the ID must be on the allowlist.
3. Anything that fails is refused with HTTP 403 and logged to stderr as `[fileforge] rejected bridge connection: <reason>`.

Web-page origins (`http://`, `https://`, `file://`) fail both checks and are always refused.

### Extension-ID allowlist

The `key` field in `extension/manifest.json` pins the extension ID to `nlcebipkdgecilmgfpobamljieanadpn`, wherever the folder is loaded from. The bridge accepts only that ID.

If you build a fork with its own key, set `FILEFORGE_EXTENSION_IDS` in the MCP server's environment to a comma-separated list of IDs. It replaces the default allowlist rather than adding to it.

### The bridge token

`~/.fileforge/bridge-token` is 32 random bytes in hex, created on first run with mode `0600`. Delete it and restart every FileForge server to rotate it. If pairing is on, paste the new token into the side panel too.

### Pairing

Set `FILEFORGE_REQUIRE_PAIRING=1` in the MCP server's environment to make the extension prove it holds the bridge token. It is off by default, and any other value leaves it off.

With pairing on, passing the handshake is not enough. The extension's first message, `fileforge-hello`, must carry the token. Until it does, the connection receives no browser requests and everything else it sends is ignored. A wrong or missing token, or no hello within 5 seconds, closes the connection with code `4001`.

To pair, run `fileforge-pair` (or `npm run pair` in `mcp-server/`), paste the token it prints into the side panel's **Settings → Pairing** and click **Save**. The token stays in the extension's `chrome.storage.local` until you click **Forget** or remove the extension.

Pairing is enforced by the server that owns the port, so set the variable for every MCP client you use. A peer's setting has no effect, and if a client without it starts first, nothing is enforced. **Settings → Pairing** shows what the connected server does: `paired`, or `not required by this server`.

Pairing stops a process that only knows the `Origin` header from posing as the extension. It does not authenticate the server; see the [known limitations](#known-limitations).

## Secret values

Some tools find tokens and passwords in page or extension storage. Their output is redacted by default. Two actions can return one exact, unredacted value:

- `fileforge_audit_action` → `reveal_client_security_value`
- `fileforge_extension_action` → `reveal_storage_value`

Both return `SECRET_REVEAL_DISABLED` unless the MCP server runs with `FILEFORGE_ALLOW_SECRET_REVEAL=1`. Any other value, including `true`, leaves them off.

Routines (`fileforge_task_action`) can use `{{secret:NAME}}` placeholders. They are filled from `~/.fileforge/secrets.json`, then from the server's environment variables.

## Sensitive URLs

FileForge hides the URL and title of tabs that look sensitive, showing `redacted` in the `_source` block on every response, in `fileforge_browser_action` → `query_context`, and in the `url_contains` workflow assertion. A URL counts as sensitive when it has:

- a sign-in, account, payment or similar path, such as `/login` or `/oauth`
- a credential parameter in its query string or fragment, such as `?code=`, `#access_token=` or `?api_key=`, or a signed-URL parameter
- `user:pass@` credentials, or a recognized token format, such as a JWT

This is a heuristic. A secret under an unusual parameter name isn't caught, and common names such as `code` and `key` also hide harmless pages. `query_context` can turn it off with `redactSensitiveUrls: false`.

It doesn't hide a page an agent asks to read. Tools such as `fileforge_scrape_action` and `fileforge_coding_action` → `inspect_page` return that page's content and full URL.

## Chrome permissions

Every permission the extension requests, the code that uses it and why is listed in [docs/permissions.md](docs/permissions.md). The `debugger` permission is the most powerful: while it is attached, Chrome shows its "started debugging this browser" bar. FileForge attaches it only to the tabs a tool call names, or to every tab when you call `fileforge_eye_action` → `start_watch` with `all: true`.

## What lives in `~/.fileforge/`

Everything FileForge stores stays on your machine, in this folder. FileForge creates it with mode `0700`, so other users on the machine cannot list or read anything inside it (on Windows the folder inherits your user profile's permissions instead). A folder made by an earlier version is tightened to `0700` the next time the server starts.

| Path | Contents |
| --- | --- |
| `~/.fileforge/` itself | The folder (mode `0700`; its subfolders are created `0700` too) |
| `bridge-token` | Shared secret for peer connections and pairing (mode `0600`) |
| `secrets.json` | Values for `{{secret:NAME}}` placeholders (mode `0600`, empty `{}` by default) |
| `results.db` | Stored tool results and the tables `fileforge_sql_action` queries |
| `memory.db` | Saved pages and page memory |
| `notes.db` | Notes |
| `tasks.db`, `routines.db` | Tasks, routines and their runs |
| `recipes.db` | Recorded workflows |
| `baselines.db` | Visual baselines |
| `artifacts/`, `exports/`, `resources/`, `storage/` | Screenshots, exported files, fetched resources, task output |

Stored results can include text, screenshots and network data from pages you were signed in to. The folder's `0700` mode keeps them from other users, but not from processes running as you or from an administrator. On a shared machine, check it with `ls -ld ~/.fileforge` (it should start with `drwx------`), and keep in mind the bridge limitation below.

To delete everything, quit your MCP clients and remove the folder.

## Network

FileForge has no telemetry and no update checks. The server and extension reach the network only when a tool loads a page or fetches a URL. The side panel uses your system's fonts and loads nothing from the network.

## Dependency advisories

`npm audit --omit=dev` in `mcp-server/` reports no advisories. A full `npm audit` reports one that only affects development:

- **minimatch through ESLint** ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), moderate): the fix is minimatch 11.0.1, and no ESLint release uses it yet. ESLint runs for `npm run lint` and is never loaded by the server.

## Known limitations

- **Other OS users can pose as the extension.** The extension is identified by its `Origin` header. Browsers cannot forge it, but any local process can. On a machine with several user accounts, another user could connect to the bridge as the extension, receive browser requests meant for it, and call server tools. [Pairing](#pairing) closes this, but not the next limitation.
- **Other OS users can pose as the server.** The extension connects to whatever is listening on port 47821 and does not check that it is FileForge. While no server is running, another local user could bind the port and send the extension browser requests. With pairing on, that listener also receives the bridge token. Use FileForge only on a machine where you are the only user, with or without pairing.
- **The request log keeps request details.** For the side panel's Activity view, the extension keeps the last 1,000 requests (method, tab, URL and a truncated copy of the parameters) in `chrome.storage.local`, and recent responses in memory while its service worker runs. Keys and values that look like tokens, cookies or passwords are redacted; page content is not.
