# Contributing

Thanks for helping. This page covers the local setup, how a tool is put together, and what a pull request needs.

## Setup

Follow [docs/setup.md](docs/setup.md) to install the server and load `extension/` unpacked. All commands below run in `mcp-server/`.

| Command | What it does |
| --- | --- |
| `npm test` | Runs every `*.test.js` file with `node --test` |
| `npm run lint` | ESLint over the server, `examples/` and the extension. It must report 0 errors; warnings are allowed. |
| `npm run docs:tools` | Rewrites `docs/tools.md` from the tool registry |
| `npm run build:id` | Rewrites `extension/background/buildInfo.js` from the extension files |
| `npm pack --dry-run` | Lists what the npm package would contain. `prepack` copies `extension/` and `LICENSE` into `mcp-server/` and `postpack` removes them |
| `npm run verify` | Checks the install and the live bridge |
| `npm start` | Runs the server in your terminal so you can read its log |

CI runs `npm ci`, `npm test` and `npm run lint` on Node 20 and 22, on Ubuntu, macOS and Windows.

After changing anything in `extension/`, click the reload icon on the FileForge card at `chrome://extensions`; Chrome does not reload unpacked extensions by itself. After changing the server, restart your MCP client.

## How a tool is put together

A tool call goes from the MCP server to the extension and back. [docs/architecture.md](docs/architecture.md) has the full picture. For a new feature you usually touch three places:

1. **A server tool module** in `mcp-server/src/tools/`, which defines the tool, its actions and their parameters.
2. **An extension module method** in `extension/background/modules/`, if the action needs the browser.
3. **`docs/tools.md`**, regenerated.

### Naming

- Tools are grouped: one MCP tool per area, named `fileforge_<group>_action`, with an `action` parameter. For example, `fileforge_note_action` with `create`, `list` and `search`.
- Each action is defined with a full name, `fileforge_<group>_<action>`, and `makeActionTool` strips the `fileforge_<group>_` prefix to get the action name.
- Extension RPC methods are `<module>.<method>` in camelCase, such as `app.detectFramework`. The part before the dot is a key in the `modules` map in `extension/background/mcpRpcRouter.js`.

### A tool module

```js
// mcp-server/src/tools/notes.js (shortened)
import { registry } from '../registry.js';
import { noteStore } from '../stores/noteStore.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { makeRef } from '../utils/resultUtils.js';

const actionDefs = [
  {
    name: 'fileforge_note_create',
    description: 'Create a local note.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['title', 'body'],
    },
    handler: async (p) => {
      const note = noteStore.create({ id: makeRef('note'), ...p });
      return { ok: true, data: { note }, meta: { tool: 'fileforge_note_create' } };
    },
  },
];

registry.registerMany([
  makeActionTool({
    name: 'fileforge_note_action',
    description: 'Create, list, and search local notes.',
    prefix: 'fileforge_note_',
    actions: actionDefs,
  }),
]);
```

`makeActionTool` merges every action's parameters into one schema, checks each action's `required` list, and adds the action catalog to the response's `meta`.

A handler that needs the browser gets `rpcClient` in its second argument:

```js
handler: async (p, { rpcClient }) => {
  const response = await rpcClient.send('app.detectFramework', { tabId: p.tabId ?? 'active' });
  return { ok: true, data: response?.data ?? response, meta: { tool: 'fileforge_app_detect_framework' } };
},
```

A new module must be imported in `mcp-server/src/toolModules.js`, or its tools never register.

### Response shape

Every handler returns one of these:

```js
// success
{ ok: true, data: {}, ref: 'optional', summary: {}, warnings: [], meta: { tool, tabId, url, createdAt } }

// error
{ ok: false, error: { code: 'ERROR_CODE', message: '...', details: {} }, meta: { tool } }
```

Use an `UPPER_SNAKE_CASE` error code that names the problem, such as `WATCH_TARGET_REQUIRED`. A handler that throws is turned into `HANDLER_ERROR` by the registry, so prefer returning an error with a specific code. Large payloads go through `maybeStoreResult` (`src/utils/resultUtils.js`), which stores them in `~/.fileforge/results.db` and returns a `ref`.

### Extension side

Add the method to a module in `extension/background/modules/`, and return `{ ok, data }` or `{ ok: false, error: { code, message } }`. If it needs a Chrome permission the extension does not have yet, add it to `extension/manifest.json` and a row to [docs/permissions.md](docs/permissions.md) in the same change, naming the code that calls it.

## Tests

Tests use `node:test` and sit next to the code they test, as `<name>.test.js`.

- **Do not import `index.js` or `wsServer.js`** unless the test is about the bridge: importing `wsServer.js` opens the bridge port. To test a tool, import its module and call the handler with a stub `rpcClient`, as `src/tools/eye.test.js` does.
- **Do not touch your real `~/.fileforge/`.** Point `HOME` and `USERPROFILE` at a temp folder before importing a store or `bridgeAuth.js`, as `src/wsServer.auth.test.js` does. Those modules resolve their paths at import time.
- Tests must pass on Windows. Build paths with `path.join`, and skip POSIX-only checks such as file modes when `process.platform === 'win32'`.

## Regenerating docs/tools.md

`docs/tools.md` is generated from the registry. After adding or changing a tool, an action, a parameter or a description:

```bash
npm run docs:tools
```

Commit the result with your change. `src/toolsDoc.test.js` fails when the file is out of date, so CI catches a forgotten run.

## Regenerating the extension build ID

`extension/background/buildInfo.js` holds a hash of the extension files. The server compares it with the build ID the running extension reports, to warn when Chrome is still running older code. After changing anything in `extension/`:

```bash
npm run build:id
```

Commit the result with your change. `src/extensionBuild.test.js` fails when the file is out of date.

## Pull requests

- One topic per pull request, with a message that says what changed and why.
- `npm test` and `npm run lint` pass, and `docs/tools.md` is regenerated if a tool changed.
- Update the docs you affected: `README.md`, `docs/`, and `CHANGELOG.md` under the next version.
- No remote code in the extension, and no tool or SQL table whose source does not work yet.

## Reporting security problems

Not in a public issue. See [SECURITY.md](SECURITY.md).
