# Architecture

FileForge is two programs on one machine: a Node.js MCP server and a Chrome extension. They talk over a WebSocket on `127.0.0.1:47821`. There is no Native Messaging and no remote server.

```
 MCP client (Claude Code, Claude Desktop, Codex, Cursor)
      │  MCP over stdio (the client starts `node mcp-server/src/index.js`)
      ▼
 MCP server ─────────────── SQLite and files in ~/.fileforge/
  index.js       MCP handlers; adds a _source provenance block to every response
  registry.js    tool name → handler; resolves the `action` parameter
  tools/*.js     one module per tool; calls the extension through rpcClient
  wsServer.js    the bridge: owner or peer mode
      │  WebSocket ws://127.0.0.1:47821, JSON messages
      ▼
 Chrome extension (Manifest V3)
  background/mcpRpcRouter.js     service worker; routes `group.method` to a module
  background/mcpBridge.js        connects to the bridge, reconnects, heartbeats
  background/modules/*.js        browser, scrape, devtools, eye, visual, ...
  content/mcpContentBridge.js    runs in every page for DOM reads and actions
  popup/                         the side panel: Tools, Analytics, Activity, Settings
      │  Chrome extension APIs, content scripts, chrome.debugger (CDP)
      ▼
 Your tabs: DOM, console, network, screenshots, storage
```

## A tool call, end to end

1. The agent calls an MCP tool such as `fileforge_devtools_action` with `action: "get_console"`.
2. `registry.js` finds the tool. If `action` is missing or misspelled, it picks the closest match and adds a warning.
3. The tool module calls `rpcClient.send('devtools.getConsole', params)`.
4. `wsServer.js` sends `{ type: 'fileforge-mcp-rpc', requestId, method, params }` to the extension and waits up to 30 seconds for a reply with the same `requestId`.
5. `mcpRpcRouter.js` splits `devtools.getConsole` into a module (`devtools`) and a method (`getConsole`), runs it, and sends the result back.
6. The tool module shapes the result into the common response (`{ ok, data, summary, warnings, meta }`). Large results are stored in `~/.fileforge/results.db` and returned as a `ref`, which `fileforge_result_action` and `fileforge_sql_action` can read later.
7. `index.js` adds a `_source` block (active tab, URL the data came from, whether it was stored; sensitive URLs and titles are redacted as in `query_context`) and returns the JSON to the client.

Some tools never reach the extension: `fileforge_sql_action`, `fileforge_note_action` and `fileforge_result_action` work only on local data.

## Owner and peer mode

Each MCP client starts its own server process, and you may have several open at once. Only one process can listen on port 47821.

```
 Claude Code ──stdio──► server A (owner) ◄──ws── extension
                            ▲
 Cursor ───────stdio──► server B (peer) ──ws ?role=mcp-peer + token──┘
```

- **Owner.** The first server to bind the port. It accepts the extension and any peers.
- **Peer.** A server that finds the port in use. It connects to the owner with `?role=mcp-peer` and the `x-fileforge-token` header from `~/.fileforge/bridge-token`, then wraps each request as `fileforge-peer-rpc`. The owner forwards it to the extension and sends the reply back as `fileforge-peer-response`.
- **Exit.** A server exits when its client closes stdin, so it doesn't outlive the client.
- **Failover.** If the owner exits, its peers lose their connection, and each retries binding the port every 3 seconds. The first to succeed becomes the new owner, and the extension reconnects to it.

`npm run verify` and [`examples/peer-client.js`](../examples/peer-client.js) connect as peers too.

## Bridge messages

| `type` | Direction | Purpose |
| --- | --- | --- |
| `fileforge-mcp-rpc` | server → extension, reply by `requestId` | Run a browser method such as `browser.getActiveTab` |
| `fileforge-hello` | extension → server | Sent on connect with the extension's version and build ID, and the bridge token if one is saved; the server warns when the version or build differs from its own clone |
| `fileforge-hello-ack` | server → extension | The server accepted the hello; `pairing` is `paired` or `off`. The extension counts as connected from here on, or after 3 seconds with a server too old to send it |
| `fileforge-pairing-required` | server → extension | Sent just before the server closes an unpaired connection with code `4001` |
| `fileforge-heartbeat` / `-ack` | extension ↔ server | Every 20 seconds, so each side notices a dead connection |
| `fileforge-peer-rpc` / `-response` | peer ↔ owner | Forward an RPC through the owner |
| `fileforge-extension-tool-call` / `-response` | extension → server | Lets the side panel run a server tool |

Who may connect at all is decided at the handshake; see [SECURITY.md](../SECURITY.md#how-the-bridge-decides-who-may-connect).

## The extension's connection

The extension connects to `ws://127.0.0.1:47821` when its service worker starts. If the connection drops, it retries after 3 seconds, doubling the wait up to 60 seconds, and resets once the server accepts its hello. While disconnected, the toolbar icon shows a red `!` badge, or `PAIR` when the server wants the [bridge token](../SECURITY.md#pairing).

## Storage

The server keeps all state under `~/.fileforge/`: one SQLite database per store (`mcp-server/src/stores/`, opened lazily on first use with `better-sqlite3`), plus folders for screenshots, exports and task output. [SECURITY.md](../SECURITY.md#what-lives-in-fileforge) lists every file. The extension keeps only its settings and request log, in `chrome.storage.local`.

## Background work

`fileforge_task_action` routines run on the server, not in the extension. `queue/runQueue.js` runs up to three at once (`FILEFORGE_QUEUE_GLOBAL_LIMIT`), and `schedulers/cronScheduler.js` starts scheduled ones while a server is running, which means while an MCP client or `npm start` keeps one open. They call the same tools an agent would, through the registry.

## Repo layout

```
mcp-server/
  src/
    index.js           MCP entry point
    registry.js        tool registry
    toolModules.js     imports every tool module
    tools/             one module per tool
    wsServer.js        the bridge (owner and peer mode)
    bridgeAuth.js      handshake checks and the bridge token
    rpcClient.js       sends RPCs over the bridge
    stores/            SQLite stores in ~/.fileforge/
    planner/ queue/ runner/ schedulers/   routines
    scripts/           verify-bridge.js, generate-tools-doc.js
examples/              peer-client.js
extension/
  manifest.json
  background/          service worker, bridge connection, modules
  content/             content script and inspectors
  popup/               side panel UI
docs/                  setup, tools, architecture, permissions, troubleshooting
```
