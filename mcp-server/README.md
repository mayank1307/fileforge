# fileforge-mcp-server

The MCP server for [FileForge](https://github.com/mayank1307/fileforge), which gives your AI agent a real DevTools seat in your own signed-in Chrome. This package also contains the FileForge Chrome extension, which you load unpacked from the package folder.

You need Node.js 20 or newer and Google Chrome.

## Install

```bash
npm install -g fileforge-mcp-server
```

Install it globally, not with `npx`: Chrome loads the extension from the package folder, so the folder must stay put.

## Load the extension

Print the folder:

```bash
echo "$(npm root -g)/fileforge-mcp-server/extension"
```

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick that folder. The card should show ID `nlcebipkdgecilmgfpobamljieanadpn`.

## Add it to your MCP client

For Claude Code:

```bash
claude mcp add fileforge -- fileforge-mcp
```

For clients that need a full command, find it with `which fileforge-mcp`. Every client is covered in the [setup guide](https://github.com/mayank1307/fileforge/blob/main/docs/setup.md#install-from-npm).

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
