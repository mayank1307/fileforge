import { registry } from '../registry.js';
import { makeActionTool } from '../utils/actionToolUtils.js';

const actionDefs = [
  {
    name: 'fileforge_app_detect_framework',
    description: 'Detect the frontend framework used by the page (React, Vue, Next.js, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        includeStateHints: { type: 'boolean', default: false },
      },
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('app.detectFramework', p);
      return { ok: true, data, meta: { tool: 'fileforge_app_detect_framework' } };
    },
  },
  {
    name: 'fileforge_app_get_next_data',
    description: 'Extract Next.js __NEXT_DATA__ and server-side props.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('app.getNextData', p);
      return { ok: true, data, meta: { tool: 'fileforge_app_get_next_data' } };
    },
  },
  {
    name: 'fileforge_app_get_route_info',
    description: 'Get current route information from the SPA router.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('app.getRouteInfo', p);
      return { ok: true, data, meta: { tool: 'fileforge_app_get_route_info' } };
    },
  },
  {
    name: 'fileforge_app_get_client_storage',
    description: 'Get localStorage, sessionStorage, and accessible cookies.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('app.getClientStorage', p);
      return { ok: true, data, meta: { tool: 'fileforge_app_get_client_storage' } };
    },
  },
  {
    name: 'fileforge_app_get_feature_flags',
    description: 'Detect feature flags exposed in the page (LaunchDarkly, GrowthBook, etc.).',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('app.getFeatureFlags', p);
      return { ok: true, data, meta: { tool: 'fileforge_app_get_feature_flags' } };
    },
  },
  {
    name: 'fileforge_app_get_react_tree_hint',
    description: 'Get a React component tree hint from the page.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('app.getReactTreeHint', p);
      return { ok: true, data, meta: { tool: 'fileforge_app_get_react_tree_hint' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_app_action',
    description: 'Inspect a web app in an open tab: detect its framework, and read routes, Next.js data, client storage, feature flags and React tree hints. Use this to understand how an app is built. Use fileforge_coding_action for a full bundle. Read-only, but get_client_storage returns raw localStorage and sessionStorage values, which can include tokens. Needs the extension.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    prefix: 'fileforge_app_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
