# FileForge — Agent Guide

> AGENTS.md is the canonical copy of this guide. CLAUDE.md repeats it for Claude Code. Edit AGENTS.md first, then copy the change into CLAUDE.md.

## What This Is

FileForge is a local MCP server (Node.js, `mcp-server/`) plus a Chrome extension (`extension/`). The server owns tool schemas, storage, SQL and the bridge. The extension owns browser access through Chrome APIs, content scripts and CDP. They talk over a WebSocket on `ws://127.0.0.1:47821`; there is no Native Messaging. See `docs/architecture.md`.

## Repo Layout

```
mcp-server/
  src/
    index.js          MCP stdio entry: registers tools, starts the bridge, answers MCP requests
    toolModules.js    imports every tool module; add new modules here
    registry.js       tool name → definition; resolves the `action` parameter
    tools/            one module per grouped tool (fileforge_<group>_action)
    wsServer.js       the bridge: owner mode (binds 47821) or peer mode (forwards to the owner)
    bridgeAuth.js     handshake checks, extension-ID allowlist, ~/.fileforge/bridge-token
    rpcClient.js      rpcClient.send(method, params) → extension, over wsServer
    stores/           SQLite stores in ~/.fileforge/, opened lazily
    planner/ queue/ runner/ schedulers/   routines for fileforge_task_action
    utils/            shared helpers (makeActionTool, result storage, privacy redaction, ...)
    scripts/          verify-bridge.js (npm run verify), generate-tools-doc.js (npm run docs:tools),
                      generate-build-id.js (npm run build:id), pair.js (npm run pair), setup.js (npm run setup),
                      pack-extension.js (prepack/postpack: puts extension/ in the npm package)
    toolsDoc.js       renders docs/tools.md from the registry

examples/             peer-client.js, a token-authenticated peer (run from the repo root)

extension/
  manifest.json       MV3; `key` pins the extension ID nlcebipkdgecilmgfpobamljieanadpn
  background/
    mcpRpcRouter.js   service worker; routes `group.method` RPCs to modules
    mcpBridge.js      WebSocket connection to the bridge (reconnect, heartbeat, hello)
    modules/          one module per capability area
  content/            mcpContentBridge.js and DOM inspectors
  popup/              side panel: Tools, Analytics, Activity, Settings

docs/                 setup, tools (generated), architecture, permissions, troubleshooting
```

## Key Conventions

### Tool naming

One MCP tool per group, `fileforge_<group>_action`, with an `action` parameter. Actions are defined as `fileforge_<group>_<action>` and `makeActionTool` strips the prefix. Example: `fileforge_note_action` with `create`, `list`, `search`.

### Tool module shape

```js
// mcp-server/src/tools/example.js
import { registry } from '../registry.js';
import { makeActionTool } from '../utils/actionToolUtils.js';

const actionDefs = [
  {
    name: 'fileforge_example_do_thing',
    description: 'What this action does.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    handler: async (params, { rpcClient }) => {
      const response = await rpcClient.send('example.doThing', params);
      return { ok: true, data: response?.data ?? response, meta: { tool: 'fileforge_example_do_thing' } };
    },
  },
];

registry.registerMany([
  makeActionTool({ name: 'fileforge_example_action', description: '...', prefix: 'fileforge_example_', actions: actionDefs }),
]);
```

Give each tool an `annotations` object with all four MCP hints, and say in its description when to use it and what it changes. Describe every parameter, or add shared ones to `src/utils/paramDescriptions.js`; `src/utils/toolDefinitions.test.js` enforces this.

Then import the module in `src/toolModules.js` and run `npm run docs:tools`.

### Common response shape

```js
// success
{ ok: true, data: {}, ref: 'optional', summary: {}, warnings: [], meta: { tool, tabId, url, createdAt } }

// error
{ ok: false, error: { code: 'ERROR_CODE', message: '...', details: {} }, meta: { tool } }
```

`src/utils/toolResponse.js` declares this as every tool's `outputSchema` and returns it as `structuredContent` too. Clients reject a whole call that breaks the schema, so only `ok` is typed.

### Extension RPC

The server sends `{ type: 'fileforge-mcp-rpc', requestId, method: 'scrape.page', params }` over the WebSocket. `mcpRpcRouter.js` splits `method` into a module key and a method name, runs it, and replies with the same `requestId`. Extension methods return `{ ok, data }` or `{ ok: false, error: { code, message } }`.

### Stores

- All data lives in `~/.fileforge/`, created on first run.
- `better-sqlite3`, one database per store, opened lazily on first use.

### Permissions

Every Chrome permission is listed in `docs/permissions.md` with the code that uses it. Add a permission and its row in the same change.

## Build Commands

```bash
cd mcp-server
npm install          # also builds better-sqlite3 for the current Node
npm start            # run the server in a terminal to read its log
npm test             # node --test
npm run lint         # ESLint; must report 0 errors
npm run docs:tools   # regenerate docs/tools.md after any tool change
npm run build:id     # regenerate extension/background/buildInfo.js after any extension change
npm run verify       # check the install and the live bridge
npm pack --dry-run   # list the npm package's files (the server plus a copy of extension/)
```

Load `extension/` unpacked at `chrome://extensions`, and click reload on its card after changing extension code.

## Testing Rules

- Do not import `index.js` or `wsServer.js` from tests or scripts unless testing the bridge: importing `wsServer.js` opens port 47821. Call tool handlers with a stub `rpcClient`.
- Point `HOME` and `USERPROFILE` at a temp folder before importing stores or `bridgeAuth.js`.
- `src/toolsDoc.test.js` fails when `docs/tools.md` is stale, and `src/extensionBuild.test.js` when `extension/background/buildInfo.js` is.
- CI runs on Node 20 and 22 on Ubuntu, macOS and Windows.

## Non-Goals

- No Chrome Web Store submission
- No fake tables or tools (a SQL table only exists when its source works)
- No remote executable code inside the extension
- Not a replacement for Playwright/Cypress/Vitest — FileForge complements them
