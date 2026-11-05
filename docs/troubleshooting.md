# Troubleshooting

Start with the health check. From `mcp-server/`:

```bash
npm run verify
```

It checks Node, the installed dependencies, `better-sqlite3`, and, if a server is running, whether the extension is connected and on the same version. Each line below matches something it, the server log, or a tool response prints.

## Seeing the server's log

The server logs to stderr, which your MCP client usually hides. To see it, run the server yourself from `mcp-server/`:

```bash
npm start
```

A healthy start prints lines like these within a few seconds (the order can vary):

```
[fileforge] MCP server ready — extension bridge on ws://127.0.0.1:47821
[fileforge] extension bridge listening on ws://127.0.0.1:47821
[fileforge] extension connected (1 client(s))
[fileforge] extension 0.2.1 matches server version
[fileforge] ✓ SQLite result store OK
```

If another FileForge server is already running, you see `forwarding through it` instead of `listening on`; that is normal (see [port 47821 in use](#port-47821-in-use)). Stop it with Ctrl+C.

Claude Desktop also writes each server's log to `~/Library/Logs/Claude/mcp-server-fileforge.log` on macOS and `%APPDATA%\Claude\logs\mcp-server-fileforge.log` on Windows.

## The server never starts

Run `npm start` as above and read the first error.

| Error | Cause | Fix |
| --- | --- | --- |
| `Cannot find module '@modelcontextprotocol/sdk'` (or another package) | `npm install` was not run in this clone | `cd mcp-server && npm install` |
| `ERR_DLOPEN_FAILED`, `NODE_MODULE_VERSION` | See below | See below |
| `npm install` warns `EBADENGINE` | Node older than 20 | Install Node 20 or newer, run `npm install` again, and point your client's `command` at that Node |

If `npm start` works but your client still shows the server as failed, the client is running a different Node or a wrong path. Check that the path in `args` exists, and put the full path of `node` in `command` (see the [node-path pitfall](setup.md#the-node-path-pitfall)).

## `ERR_DLOPEN_FAILED`

```
[fileforge] ✗ better-sqlite3 was built for a different Node.js version than the one running FileForge (v20.x.x).
Rebuild it with the same Node your MCP client uses:
```

`better-sqlite3` is a native module compiled for one Node version. You get this when you upgrade Node, switch versions with nvm, copy `node_modules` from another machine, or when your MCP client runs a different `node` than the shell you installed with.

Fix it with the Node your client uses:

```bash
cd mcp-server
npm rebuild better-sqlite3
```

If your client's `command` is a full path, rebuild with that Node on your `PATH`, or set `command` to the Node you just rebuilt with. Deleting `node_modules` and running `npm install` again also works.

## "No extension connected"

A tool returns:

```
No extension connected. Open Chrome with the FileForge extension loaded.
```

The server is up, but no extension is connected to it.

1. Check that Chrome is running on the same machine as the server.
2. At `chrome://extensions`, check that FileForge is loaded and enabled, with ID `nlcebipkdgecilmgfpobamljieanadpn`.
3. Click the reload icon on the FileForge card. The extension retries on its own, but after a long outage it waits up to a minute between tries; a reload connects at once.
4. If the toolbar icon still shows a red `!`, look at the server log for a [rejected connection](#rejected-bridge-connections).

## "PAIR" on the toolbar icon

The server runs with `FILEFORGE_REQUIRE_PAIRING=1` and the extension has not presented the right token. Tools return `PAIRING_REQUIRED`, `npm run verify` prints `[✗] The bridge requires pairing`, and the server log says:

```
[fileforge] ⚠️  extension not paired (<reason>). ...
```

| Reason | What it means | What to do |
| --- | --- | --- |
| `no token` | The extension has no saved token | Follow [Pairing](setup.md#pairing) |
| `wrong token` | The saved token doesn't match `~/.fileforge/bridge-token`, usually because that file was deleted or recreated | Print the token again with `npm run pair` or `fileforge-pair`, paste it in and click **Save** |
| `no fileforge-hello` | Something connected as the extension and said nothing for 5 seconds | Reload the extension at `chrome://extensions`. If you see this with an up-to-date extension, something else may be connecting; see [SECURITY.md](../SECURITY.md#known-limitations) |

After a refusal the extension waits longer between retries, up to a minute. Saving a token reconnects at once.

If **Settings → Pairing** says `not required by this server` when you expected pairing, the server that owns the port was started without the variable. Set it for every MCP client and restart them all.

## Version warnings

The server compares its version with the extension's when the extension connects:

```
[fileforge] ⚠️  FileForge extension 0.1.0 does not match server 0.2.1. Reload the extension at chrome://extensions, or update whichever side is older.
[fileforge] ⚠️  FileForge extension did not report a version, so it is older than the server (0.2.1). Reload it at chrome://extensions.
```

`npm run verify` prints the same text after `[!]`, and `fileforge_runtime_action` → `status` returns it in `warnings`.

When the versions match but Chrome is still running older code than the files in your clone (for example after a `git pull` that didn't change the version), the server warns instead:

```
[fileforge] ⚠️  Chrome is running older FileForge extension code than the files in /Users/you/fileforge/extension/. Click the reload icon on the FileForge card at chrome://extensions.
```

It compares the build ID the running extension reports with `extension/background/buildInfo.js` in the clone next to the server. `status` also returns both as `summary.extensionBuild` and `summary.expectedBuild`.

Either warning usually means Chrome is still running the extension code from before your last `git pull`. Chrome does not pick up changes to an unpacked extension until you reload it. Click the reload icon on the FileForge card at `chrome://extensions`, then restart your MCP client so the server restarts too.

The same staleness shows up as tool errors such as `No module: eye` (`UNKNOWN_MODULE`) or `No method: ...` (`UNKNOWN_METHOD`). The fix is the same reload.

## An old extension loaded from the repo root

Before 0.2.0 the extension lived at the root of the repo. Now it lives in `extension/`. If you loaded the old layout, Chrome is still pointing at the repo root, which no longer has a `manifest.json`. On the next reload or Chrome restart, the card shows an error that the manifest file is missing or unreadable, and the extension stops working.

Fix it:

1. At `chrome://extensions`, click **Remove** on the old FileForge card.
2. Click **Load unpacked** and select the `extension/` folder inside your clone.

The extension ID stays the same, because the manifest pins it.

## Port 47821 in use

```
[fileforge] extension bridge already owned on port 47821; forwarding through it
```

This is normal. Each MCP client starts its own FileForge server; the first one owns the port and the others forward through it as peers. See [owner and peer mode](architecture.md#owner-and-peer-mode).

It is a problem only when something other than FileForge holds the port. Then the log shows:

```
[fileforge] peer bridge connection failed: ...
```

and the server keeps retrying every 3 seconds. Find what is listening:

| OS | Command |
| --- | --- |
| macOS, Linux | `lsof -nP -iTCP:47821 -sTCP:LISTEN` |
| Windows | `netstat -ano \| findstr 47821`, then `tasklist /FI "PID eq <pid>"` |

If it is a FileForge server you no longer need, such as a leftover `npm start`, stop it. If it is another program, stop that program: the extension always connects to port 47821.

## Rejected bridge connections

Every refused handshake is logged:

```
[fileforge] rejected bridge connection: <reason>
```

| Reason | What it means | What to do |
| --- | --- | --- |
| `extension connection from non-extension origin https://...` | A web page tried to connect to the bridge | Nothing. The bridge is doing its job. |
| `extension connection from non-extension origin (none)` | A local script connected without `?role=mcp-peer` | Add `?role=mcp-peer` and the token header; see `examples/peer-client.js` |
| `extension <id> is not an allowed FileForge extension ID` | An extension with a different ID connected, such as a copy whose manifest `key` was changed or removed | Load the unmodified `extension/` folder, or set `FILEFORGE_EXTENSION_IDS` for a fork |
| `peer connection with missing or invalid token` | A peer sent a token that does not match `~/.fileforge/bridge-token` | Usually the token file was deleted or recreated while a server kept the old one. Quit every MCP client and stop any `npm start`, then start them again. |
| `peer connection from browser origin ...` | Something sent `?role=mcp-peer` from a web page | Nothing. Web pages are never allowed to be peers. |

`npm run verify` reports a refused check as `[✗] Bridge refused this check (HTTP 403)`. That is the token case above.

## Still stuck

Open a bug report with your OS, Node version (`node -v`), Chrome version (`chrome://version`) and the full output of `npm run verify`. The issue template asks for each.
