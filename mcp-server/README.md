# fileforge-mcp-server

The MCP server for [FileForge](https://github.com/mayank1307/fileforge). Your agent watches your signed-in Chrome across tabs, sweeps your routes, and hands you the bug report. This package also contains the FileForge Chrome extension, which you load unpacked from the package folder.

You need Node.js 20 or newer and Google Chrome.

## Install

```bash
npm install -g fileforge-mcp-server
```

Install it globally, not with `npx`: Chrome loads the extension from the package folder, so the folder must stay put.

## Set it up

```bash
fileforge-setup
```

This prints the extension folder and the exact command or config for each MCP client, using your real paths. It changes nothing unless you pass `--write`.

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder it printed. The card should show ID `nlcebipkdgecilmgfpobamljieanadpn`.

Then connect your client. For Claude Code or Codex, run the command it printed. For Cursor or Claude Desktop, let it edit the config file; it keeps your other servers and saves the old file as `.bak`:

```bash
fileforge-setup --client cursor --write
```

Every client is covered in the [setup guide](https://github.com/mayank1307/fileforge/blob/main/docs/setup.md#install-from-npm).

## Verify

With your MCP client open and Chrome running:

```bash
fileforge-verify
```

Then ask your agent to call `fileforge_runtime_action` with `action: "status"`.

## Pairing

Optional: with `FILEFORGE_REQUIRE_PAIRING=1` in the server's environment, the extension must present the bridge token. `fileforge-pair` prints it, and you paste it into the side panel's Settings tab. See the [setup guide](https://github.com/mayank1307/fileforge/blob/main/docs/setup.md#pairing).

## Updating

```bash
npm install -g fileforge-mcp-server@latest
```

Then click the reload icon on the FileForge card at `chrome://extensions` and restart your MCP client. `fileforge-verify` warns when Chrome is still running the old extension code.

## More

- [Tool reference](https://github.com/mayank1307/fileforge/blob/main/docs/tools.md)
- [Security](https://github.com/mayank1307/fileforge/blob/main/SECURITY.md)
- [Troubleshooting](https://github.com/mayank1307/fileforge/blob/main/docs/troubleshooting.md)

MIT license.
