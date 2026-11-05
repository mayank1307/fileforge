import { registry } from '../registry.js';
import { makeActionTool } from '../utils/actionToolUtils.js';

const TOOL_NAME = 'fileforge_eye_action';
const ALL_DESCRIPTION = 'start_watch: attach DevTools to every open http(s) tab. close_incognito: close every incognito window.';

// Attaching the debugger shows Chrome's "is debugging this browser" bar and exposes every
// request in the tab, so watching all tabs has to be asked for by name.
export function resolveWatchTargets({ tabs, all } = {}) {
  if (Array.isArray(tabs) && tabs.length) return { tabs };
  if (all === true) return { all: true };
  return null;
}

const actionDefs = [
  {
    name: `${TOOL_NAME}_scan`,
    action: 'scan',
    description: "One-shot snapshot of ALL open browser tabs: URL, title, load status, audible state. The God's Eye view of your entire browser.",
    inputSchema: { type: 'object', properties: {} },
    handler: async (_p, { rpcClient }) => {
      const data = await rpcClient.send('eye.scan', {});
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'scan' } };
    },
  },
  {
    name: `${TOOL_NAME}_start_watch`,
    action: 'start_watch',
    description: 'Attach DevTools to the given tabs, or to every open http(s) tab with all: true, and begin capturing network requests, console output, JS errors, DOM mutations, and WebSocket frames in real time. Requires tabs or all: true.',
    inputSchema: {
      type: 'object',
      properties: {
        tabs: {
          type: 'array',
          items: { type: 'number' },
          description: 'Tab IDs to watch (from scan). Required unless all: true.',
        },
        all: { type: 'boolean', default: false, description: ALL_DESCRIPTION },
      },
    },
    handler: async (p, { rpcClient }) => {
      const targets = resolveWatchTargets(p);
      if (!targets) {
        return {
          ok: false,
          error: {
            code: 'WATCH_TARGET_REQUIRED',
            message: 'start_watch needs tabs (an array of tab IDs from scan) or all: true to attach to every open tab.',
          },
          meta: { tool: TOOL_NAME, action: 'start_watch' },
        };
      }
      const data = await rpcClient.send('eye.startWatch', targets);
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'start_watch' } };
    },
  },
  {
    name: `${TOOL_NAME}_stop_watch`,
    action: 'stop_watch',
    description: 'Detach from all watched tabs and stop the live capture session. Returns a session summary.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_p, { rpcClient }) => {
      const data = await rpcClient.send('eye.stopWatch', {});
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'stop_watch' } };
    },
  },
  {
    name: `${TOOL_NAME}_get_feed`,
    action: 'get_feed',
    description: 'Pull the live event feed from the active watch session — all network traffic, console messages, errors, and DOM changes across every watched tab, sorted newest-first.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Optional filters to narrow the feed.',
          properties: {
            tabId: { type: 'number', description: 'Restrict to events from this tab.' },
            type: {
              type: 'string',
              enum: ['net_request', 'net_response', 'net_fail', 'console', 'js_error', 'dom_update', 'ws_frame'],
              description: 'Only return events of this type.',
            },
            severity: { type: 'string', enum: ['error', 'warn', 'info'], description: 'Minimum severity level.' },
            since: { type: 'string', description: 'ISO timestamp — return events after this time.' },
          },
        },
        limit: { type: 'number', default: 100, description: 'Max events to return (default 100).' },
      },
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('eye.getFeed', p);
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'get_feed' } };
    },
  },
  {
    name: `${TOOL_NAME}_lock_target`,
    action: 'lock_target',
    description: 'Lock onto a specific tab as the primary target. On a locked tab, JS errors trigger an automatic screenshot so you can see exactly what the user saw when things broke.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'The tab ID to lock onto.' },
      },
      required: ['tabId'],
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('eye.lockTarget', p);
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'lock_target' } };
    },
  },
  {
    name: `${TOOL_NAME}_unlock_target`,
    action: 'unlock_target',
    description: 'Release the current target lock and return to standard multi-tab monitoring.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_p, { rpcClient }) => {
      const data = await rpcClient.send('eye.unlockTarget', {});
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'unlock_target' } };
    },
  },
  {
    name: `${TOOL_NAME}_set_tripwire`,
    action: 'set_tripwire',
    description: 'Plant a tripwire that fires silently the moment a matching event hits any watched tab. Check get_tripwires to see which ones have fired.',
    inputSchema: {
      type: 'object',
      properties: {
        tripwire: {
          type: 'object',
          description: 'Tripwire definition.',
          properties: {
            label: { type: 'string', description: 'Human-readable name for this tripwire.' },
            match: {
              type: 'string',
              description: 'Condition string. Examples: "status >= 500", "console contains auth", "url matches /api/login", "type is js_error".',
            },
            scope: {
              type: 'string',
              description: 'Optional URL/domain pattern to restrict the tripwire (supports * wildcard). Example: "*.api.example.com".',
            },
          },
          required: ['match'],
        },
      },
      required: ['tripwire'],
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('eye.setTripwire', p);
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'set_tripwire' } };
    },
  },
  {
    name: `${TOOL_NAME}_get_tripwires`,
    action: 'get_tripwires',
    description: 'List all active tripwires and whether any have fired, including the timestamp and event that triggered them.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_p, { rpcClient }) => {
      const data = await rpcClient.send('eye.getTripwires', {});
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'get_tripwires' } };
    },
  },
  {
    name: `${TOOL_NAME}_clear_tripwire`,
    action: 'clear_tripwire',
    description: 'Remove a tripwire by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        tripwireId: { type: 'string', description: 'ID returned by set_tripwire.' },
      },
      required: ['tripwireId'],
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('eye.clearTripwire', p);
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'clear_tripwire' } };
    },
  },
  {
    name: `${TOOL_NAME}_get_status`,
    action: 'get_status',
    description: 'Get current God\'s Eye session status: whether a watch is active, how many tabs are watched, which tab is locked, event count, and tripwire summary.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_p, { rpcClient }) => {
      const data = await rpcClient.send('eye.getStatus', {});
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'get_status' } };
    },
  },
  {
    name: `${TOOL_NAME}_auto_track`,
    action: 'auto_track',
    description: 'Auto-attach to every newly-created or newly-navigated http(s) tab while the watch is active. Only allowed in a watch started with all: true. Toggle with enabled: true/false.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true, description: 'Turn auto-track on (true) or off (false).' },
      },
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('eye.autoTrack', p);
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'auto_track' } };
    },
  },
  {
    name: `${TOOL_NAME}_watch_person`,
    action: 'watch_person',
    description: 'Tail an identity (email, user id, name, etc.) across every watched tab. Events whose URL, request body, console text, or error text contain the identity are tagged target_hit: true.',
    inputSchema: {
      type: 'object',
      properties: {
        identity: { type: 'string', description: 'The string to scan for — e.g. "user@example.com" or a user id.' },
        clear: { type: 'boolean', default: false, description: 'Clear the current identity target.' },
      },
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('eye.watchPerson', p);
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'watch_person' } };
    },
  },
  {
    name: `${TOOL_NAME}_open_incognito`,
    action: 'open_incognito',
    description: 'Open an incognito window, or add a new incognito tab to an existing incognito window. Pass url to navigate, or urls (array) to open multiple tabs in one window. Pass windowId to attach a new tab to that existing incognito window instead of creating a new one.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL to open in the new window/tab.' },
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of URLs — opens a window with one tab per URL. Ignored if windowId is provided.',
        },
        windowId: {
          type: 'number',
          description: 'Existing incognito window ID. If provided, opens a new tab in that window instead of creating a new window.',
        },
        focused: { type: 'boolean', default: true, description: 'Whether the new window should be focused (default true).' },
      },
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('eye.openIncognito', p);
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'open_incognito' } };
    },
  },
  {
    name: `${TOOL_NAME}_list_incognito`,
    action: 'list_incognito',
    description: 'List every incognito window currently open and the tabs inside each one (id, url, title, active).',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_p, { rpcClient }) => {
      const data = await rpcClient.send('eye.listIncognito', {});
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'list_incognito' } };
    },
  },
  {
    name: `${TOOL_NAME}_close_incognito`,
    action: 'close_incognito',
    description: 'Close an incognito window (by windowId), a specific incognito tab (by tabId), or all incognito windows (pass all: true). Errors if the target window/tab is not incognito.',
    inputSchema: {
      type: 'object',
      properties: {
        windowId: { type: 'number', description: 'Incognito window ID to close.' },
        tabId: { type: 'number', description: 'Incognito tab ID to close.' },
        all: { type: 'boolean', default: false, description: ALL_DESCRIPTION },
      },
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('eye.closeIncognito', p);
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'close_incognito' } };
    },
  },
  {
    name: `${TOOL_NAME}_get_report`,
    action: 'get_report',
    description: 'Generate a session report: top domains by request count, errors by tab and type, timeline of key moments (first error, first 5xx, first JS exception, first tripwire fire), tripwire summary, identity hits, and locked-target screenshot count.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_p, { rpcClient }) => {
      const data = await rpcClient.send('eye.getReport', {});
      return { ok: true, data, meta: { tool: TOOL_NAME, action: 'get_report' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: TOOL_NAME,
    description: "God's Eye — cross-tab browser monitoring. Watch chosen tabs, or every open tab with all: true: live network traffic, console errors, JS exceptions, DOM mutations, WebSocket frames. Lock onto a target tab for enhanced capture (auto-screenshots on errors). Plant tripwires that fire silently when conditions hit any tab.",
    prefix: `${TOOL_NAME}_`,
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
