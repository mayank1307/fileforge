# Setup

FileForge has two parts that must run on the same machine:

1. **The MCP server** (`mcp-server/`), a Node.js process your MCP client starts and talks to over stdio. It hosts the extension bridge on `ws://127.0.0.1:47821`.
2. **The Chrome extension** (`extension/`), which connects to that bridge and does the browser work.

The steps below take about five minutes and install from a git clone. To install from npm instead, see [Install from npm](#install-from-npm). If something fails, see [troubleshooting.md](troubleshooting.md).

## 1. Prerequisites

| You need | Check with |
| --- | --- |
| Node.js 20 or newer | `node -v` |
| npm (ships with Node) | `npm -v` |
| git | `git --version` |
| Google Chrome | `chrome://version` in the address bar |

## 2. Install the server

```bash
git clone https://github.com/mayank1307/fileforge.git
cd fileforge/mcp-server
npm install
```

`npm install` builds `better-sqlite3`, a native module, for the Node you ran it with. Run it on every machine you use. Never copy `node_modules` from another machine or another Node version.

`npm install` may end with an `npm audit` summary such as `5 moderate severity vulnerabilities`. Those come from ESLint, a development tool the server never loads; [SECURITY.md](../SECURITY.md#dependency-advisories) lists them and why they stay. Don't run `npm audit fix --force`: it installs breaking major versions.

## 3. Load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder inside your clone (`fileforge/extension`), not the clone itself.
4. Check that the card shows ID `nlcebipkdgecilmgfpobamljieanadpn`. The bridge accepts only that ID.

Until a server is running, the FileForge toolbar icon shows a red `!` badge. The extension retries the bridge every few seconds, backing off to once a minute, so the badge clears within a minute of the server starting.

## 4. Find your paths

Your MCP client needs two absolute paths: the Node binary and the server entry point.

**The server entry point** is `mcp-server/src/index.js` inside your clone. From the `mcp-server/` folder:

| OS | Command | Example result |
| --- | --- | --- |
| macOS | `echo "$PWD/src/index.js"` | `/Users/you/fileforge/mcp-server/src/index.js` |
| Linux | `echo "$PWD/src/index.js"` | `/home/you/fileforge/mcp-server/src/index.js` |
| Windows (PowerShell) | `"$PWD\src\index.js"` | `C:\Users\you\fileforge\mcp-server\src\index.js` |

**The Node binary:**

| OS | Command |
| --- | --- |
| macOS, Linux | `which node` |
| Windows (PowerShell) | `where.exe node` |
| Windows (Command Prompt) | `where node` |

### The node-path pitfall

Your MCP client may run a different `node` than your shell. Desktop apps such as Claude Desktop and Cursor do not read your shell profile, so a Node installed with nvm, fnm, volta or asdf is often not on their `PATH`, or they find an older system Node first. Two things go wrong:

- the server never starts, because `node` is not found, or
- it exits with `ERR_DLOPEN_FAILED` or `NODE_MODULE_VERSION`, because `better-sqlite3` was built for the Node you ran `npm install` with, not the one the client started.

The fix is to put the full path from `which node` / `where.exe node` in the config's `command`, and to run `npm install` with that same Node. The examples below use plain `node`; replace it with the full path if your Node comes from a version manager.

## 5. Add FileForge to your MCP client

Replace `/absolute/path/to/fileforge` with the path of your clone.

On Windows, JSON and TOML need doubled backslashes (`"C:\\Users\\you\\fileforge\\mcp-server\\src\\index.js"`), or use forward slashes (`"C:/Users/you/fileforge/mcp-server/src/index.js"`). Always start the server through `node`: Windows ignores the `#!/usr/bin/env node` line, so pointing `command` at `index.js` does not work.

### Claude Code

```bash
claude mcp add fileforge -- node /absolute/path/to/fileforge/mcp-server/src/index.js
```

This adds it for you in the current project only. Add `--scope user` before `fileforge` to make it available in every project. Check it with `claude mcp get fileforge`.

### Claude Desktop

Open the config file (in the app: **Settings → Developer → Edit Config**):

| OS | Config file |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | Claude Desktop has no official Linux build. Use Claude Code, Codex or Cursor. |

Add FileForge under `mcpServers` (merge it with any servers already there):

```json
{
  "mcpServers": {
    "fileforge": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/fileforge/mcp-server/src/index.js"]
    }
  }
}
```

Quit Claude Desktop completely and reopen it. Closing the window is not enough.

### Codex

```bash
codex mcp add fileforge -- node /absolute/path/to/fileforge/mcp-server/src/index.js
```

Or edit the config file directly: `~/.codex/config.toml` on macOS and Linux, `%USERPROFILE%\.codex\config.toml` on Windows.

```toml
[mcp_servers.fileforge]
command = "node"
args = ["/absolute/path/to/fileforge/mcp-server/src/index.js"]
startup_timeout_sec = 30
```

`startup_timeout_sec` is optional. The server normally answers in under a second, but a cold start on a slow disk can pass Codex's 10-second default. Check it with `codex mcp list`.

### Cursor

Create or edit `~/.cursor/mcp.json` for every project (`%USERPROFILE%\.cursor\mcp.json` on Windows), or `.cursor/mcp.json` in one project:

```json
{
  "mcpServers": {
    "fileforge": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/fileforge/mcp-server/src/index.js"]
    }
  }
}
```

Then open Cursor Settings, find the MCP section, and check that `fileforge` is listed and enabled.

## 6. Verify

With your MCP client open (so it has started the server) and Chrome running with the extension loaded:

```bash
cd fileforge/mcp-server
npm run verify
```

A working install prints:

```
FileForge Bridge Verifier (server 0.2.0)

[✓] Node.js 22.22.0
[✓] node_modules present
[✓] better-sqlite3 loads
[✓] Extension nlcebipkdgecilmgfpobamljieanadpn connected
[✓] Extension version 0.2.0 matches the server
[✓] Chrome is running the extension code on disk

Bridge looks good. Add to Claude config:
  claude mcp add fileforge -- node /Users/you/fileforge/mcp-server/src/index.js
```

If it prints `[–] No bridge on ws://127.0.0.1:47821`, no server is running yet. Open your MCP client, or run `npm start` in another terminal, and run `npm run verify` again. `npm run verify` checks the Node that runs it, which may not be the one your client uses; see the node-path pitfall above.

Then make a first tool call. Ask your agent:

> Call `fileforge_runtime_action` with `action: "status"`.

The response includes `"status": "connected"`, the extension ID and its version. Next, try `fileforge_browser_action` with `action: "query_context"`: it returns your open tabs.

## Install from npm

The npm package contains both the server and the extension. Install it globally, not with `npx`: Chrome loads the extension from the package folder, so the folder must stay put.

```bash
npm install -g fileforge-mcp-server
```

This puts three commands on your `PATH`: `fileforge-mcp` starts the server, `fileforge-verify` is the same check as `npm run verify`, and `fileforge-pair` prints the token for [pairing](#pairing).

**Load the extension.** Print the folder (on Windows, run `npm root -g` and add `\fileforge-mcp-server\extension`):

```bash
echo "$(npm root -g)/fileforge-mcp-server/extension"
```

Then follow [step 3](#3-load-the-extension) with that folder.

**Add it to your MCP client.** Claude Code and Codex can start the `fileforge-mcp` command:

```bash
claude mcp add fileforge -- fileforge-mcp
```

```bash
codex mcp add fileforge -- fileforge-mcp
```

Claude Desktop and Cursor do not read your shell's `PATH` (see [the node-path pitfall](#the-node-path-pitfall)), so give them the full Node path from `which node` as `command`, and the server entry point as `args`:

```bash
echo "$(npm root -g)/fileforge-mcp-server/src/index.js"
```

**Verify** with your MCP client open and Chrome running:

```bash
fileforge-verify
```

**Update** with `npm install -g fileforge-mcp-server@latest`, then click the reload icon on the FileForge card at `chrome://extensions` and restart your MCP client. `fileforge-verify` warns when Chrome is still running the old extension code.

**Uninstall** with `npm uninstall -g fileforge-mcp-server`, then remove the extension and your data as in [Uninstalling](#uninstalling).

## Optional settings

Set these in the environment of the MCP server: `-e NAME=value` with `claude mcp add`, an `"env": { "NAME": "value" }` object in JSON configs, or `env = { NAME = "value" }` in Codex's TOML.

| Variable | Default | What it does |
| --- | --- | --- |
| `FILEFORGE_ALLOW_SECRET_REVEAL` | unset | `1` enables the two actions that return a raw, unredacted storage value (`fileforge_audit_action` → `reveal_client_security_value`, `fileforge_extension_action` → `reveal_storage_value`). |
| `FILEFORGE_REQUIRE_PAIRING` | unset | `1` makes the extension present the bridge token before the bridge accepts it. See [Pairing](#pairing). |
| `FILEFORGE_EXTENSION_IDS` | the pinned ID | Comma-separated extension IDs the bridge accepts, replacing the default. Only needed for a fork that ships its own manifest `key`. |
| `FILEFORGE_WS_PORT` | `47821` | Bridge port. The extension always connects to 47821, so changing this disconnects it. Useful only for running a second, separate server. |
| `FILEFORGE_QUEUE_GLOBAL_LIMIT` | `3` | How many routine runs `fileforge_task_action` executes at once. |

## Pairing

Pairing is optional and off by default. It makes the extension prove it holds the token in `~/.fileforge/bridge-token`, so a local process can't connect as the extension by faking its `Origin` header. [SECURITY.md](../SECURITY.md#pairing) explains what it does and doesn't protect against.

1. Set `FILEFORGE_REQUIRE_PAIRING=1` for **every** MCP client that runs FileForge, for example `claude mcp add fileforge -e FILEFORGE_REQUIRE_PAIRING=1 -- node /path/to/index.js`. Only the server that owns the port enforces it, and that can be any of them.
2. Restart your MCP clients. The toolbar icon shows `PAIR`.
3. Print the token with `npm run pair` in `mcp-server/`, or `fileforge-pair` if you installed from npm. It is a secret: anyone who has it can drive your browser through FileForge.
4. Click the toolbar icon, open **Settings**, paste the token under **Pairing** and click **Save**. The status changes to `paired` within a few seconds.

If you rotate the token, paste the new one the same way. To turn pairing off, remove the variable and restart your MCP clients; the saved token is then ignored, and **Forget** removes it.

## Updating

```bash
cd fileforge
git pull
cd mcp-server
npm install
```

Then click the reload icon on the FileForge card at `chrome://extensions` and restart your MCP client. The server logs a warning when the extension and server versions differ.

## Uninstalling

1. Remove the `fileforge` entry from your MCP client config (`claude mcp remove fileforge` for Claude Code).
2. Remove the extension at `chrome://extensions`.
3. Delete your local data: `rm -rf ~/.fileforge` (macOS, Linux) or `Remove-Item -Recurse $HOME\.fileforge` (PowerShell).
4. Delete the clone.
