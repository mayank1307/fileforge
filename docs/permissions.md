# Chrome permissions

Every permission in `manifest.json`, the code that needs it, and what breaks without it. File paths are relative to the extension folder.

FileForge talks only to the local MCP server on `ws://127.0.0.1:47821`. None of these permissions are used to send browser data anywhere else.

## Permissions

| Permission | Used by | Why |
| --- | --- | --- |
| `tabs` | `background/modules/browserModule.js`, `eyeModule.js`, `scrapeModule.js`, `devtoolsModule.js`, `screenshotModule.js`, `contentBridge.js` | Read tab URLs and titles, open, switch, reload and close tabs, and capture the visible tab for screenshots. |
| `scripting` | `background/modules/contentBridge.js`, `screenshotModule.js`, `devtoolsModule.js` | Inject the content bridge into tabs opened before the extension loaded, and run page-measurement scripts for scraping, screenshots and DevTools reads. |
| `storage` | `background/modules/runtimeModule.js`, `sqlModule.js`, `extensionModule.js`, `popup/popup.js` | Keep the request log and popup settings in `chrome.storage.local`, and read storage values for the extension tools. |
| `downloads` | `background/modules/exportModule.js`, `background/mcpRpcRouter.js` | Save exports (JSON, CSV, reports) to the Downloads folder when a tool asks for a file. |
| `bookmarks` | `background/modules/searchModule.js` (`fileforge_search_action` → `bookmarks`) | Search bookmarks when the agent calls the bookmarks search action. Read-only. |
| `history` | `background/modules/searchModule.js` (`fileforge_search_action` → `history`) | Search browsing history when the agent calls the history search action. Read-only. |
| `debugger` | `background/modules/devtoolsModule.js`, `browserModule.js`, `eyeModule.js` | Attach the Chrome DevTools Protocol to a tab to read console logs, network requests and response bodies, take full-page screenshots and run performance traces. Chrome shows its "started debugging this browser" bar while attached. Eye attaches only to the tabs it is given, or to every tab when called with `all: true`. |
| `sidePanel` | `background/mcpRpcRouter.js` | Open the FileForge panel in Chrome's side panel when the toolbar icon is clicked. |

## Host permissions

| Permission | Why |
| --- | --- |
| `<all_urls>` | The content bridge (`content/mcpContentBridge.js`) runs on every page so the agent can scrape, inspect and interact with whatever page you point it at. `scripting.executeScript` and `tabs.captureVisibleTab` also need host access to the target page. |

## Removed in 0.2.0

`activeTab`, `topSites`, `contextMenus`, `nativeMessaging`, `identity`, `webRequest`, `clipboardRead`, `clipboardWrite` and `offscreen` were requested but unused, or only used by the Google integrations that 0.2.0 removed. The `oauth2` block went with them.

## Adding a permission

Add it to `manifest.json` and a row to this file in the same change, naming the code that calls it.
