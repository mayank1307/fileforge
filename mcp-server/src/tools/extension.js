import { registry } from '../registry.js';
import { maybeStoreResult } from '../utils/resultUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { secretRevealBlocked } from '../utils/privacyUtils.js';

function dataOf(response) {
  return response?.data ?? response;
}

const actionDefs = [
  {
    name: 'fileforge_extension_inspect_manifest',
    action: 'inspect_manifest',
    description: 'Inspect the loaded FileForge extension manifest and declared runtime surfaces.',
    inputSchema: { type: 'object', properties: { store: { type: 'boolean', default: true }, project: { type: 'string', default: 'default' } } },
    handler: async (p, { rpcClient }) => {
      const data = dataOf(await rpcClient.send('extension.inspectManifest', p));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'extension_manifest', tool: 'fileforge_extension_inspect_manifest', project: p.project ?? 'default', data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_extension_inspect_manifest' } };
    },
  },
  {
    name: 'fileforge_extension_inspect_storage',
    action: 'inspect_storage',
    description: 'Inspect extension chrome.storage areas with redacted values and reveal metadata.',
    inputSchema: { type: 'object', properties: { area: { type: 'string', enum: ['all', 'local', 'sync', 'session'], default: 'all' }, store: { type: 'boolean', default: true }, project: { type: 'string', default: 'default' } } },
    handler: async (p, { rpcClient }) => {
      const data = dataOf(await rpcClient.send('extension.inspectStorage', p));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'extension_storage', tool: 'fileforge_extension_inspect_storage', project: p.project ?? 'default', data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_extension_inspect_storage' } };
    },
  },
  {
    name: 'fileforge_extension_inspect_service_worker',
    action: 'inspect_service_worker',
    description: 'Inspect the extension service-worker status and runtime identity.',
    inputSchema: { type: 'object', properties: { store: { type: 'boolean', default: true }, project: { type: 'string', default: 'default' } } },
    handler: async (p, { rpcClient }) => {
      const data = dataOf(await rpcClient.send('extension.inspectServiceWorker', p));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'extension_worker', tool: 'fileforge_extension_inspect_service_worker', project: p.project ?? 'default', data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_extension_inspect_service_worker' } };
    },
  },
  {
    name: 'fileforge_extension_reveal_storage_value',
    action: 'reveal_storage_value',
    description: 'Reveal one exact redacted extension storage value after an explicit scoped agent request, and log the reveal.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string', enum: ['local', 'sync', 'session'], default: 'local' },
        key: { type: 'string' },
      },
      required: ['key'],
    },
    handler: async (p, { rpcClient }) => {
      const blocked = secretRevealBlocked('fileforge_extension_reveal_storage_value');
      if (blocked) return blocked;
      const response = await rpcClient.send('extension.revealStorageValue', p);
      return { ...response, meta: { tool: 'fileforge_extension_reveal_storage_value' } };
    },
  },
  {
    name: 'fileforge_extension_inspect_injection',
    action: 'inspect_injection',
    description: 'Inspect content-script/page injection evidence on a tab, including selectors and FileForge DOM nodes.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' }, selectors: { type: 'array', items: { type: 'string' } }, store: { type: 'boolean', default: true }, project: { type: 'string', default: 'default' } } },
    handler: async (p, { rpcClient }) => {
      const data = dataOf(await rpcClient.send('extension.inspectInjection', p));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'extension_injection', tool: 'fileforge_extension_inspect_injection', project: p.project ?? 'default', data, summary: data.summary });
      return { ok: true, ...stored, meta: { tool: 'fileforge_extension_inspect_injection', tabId: p.tabId ?? 'active' } };
    },
  },
  {
    name: 'fileforge_extension_inspect_permissions',
    action: 'inspect_permissions',
    description: 'Inspect declared extension permissions, host permissions, and content-script matches.',
    inputSchema: { type: 'object', properties: { store: { type: 'boolean', default: true }, project: { type: 'string', default: 'default' } } },
    handler: async (p, { rpcClient }) => {
      const data = dataOf(await rpcClient.send('extension.inspectPermissions', p));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'extension_permissions', tool: 'fileforge_extension_inspect_permissions', project: p.project ?? 'default', data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_extension_inspect_permissions' } };
    },
  },
  {
    name: 'fileforge_extension_collect_errors',
    action: 'collect_errors',
    description: 'Collect recent extension/MCP bridge failures with structured failure details.',
    inputSchema: { type: 'object', properties: { store: { type: 'boolean', default: true }, project: { type: 'string', default: 'default' } } },
    handler: async (p, { rpcClient }) => {
      const data = dataOf(await rpcClient.send('extension.collectErrors', p));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'extension_errors', tool: 'fileforge_extension_collect_errors', project: p.project ?? 'default', data, summary: data.summary });
      return { ok: true, ...stored, meta: { tool: 'fileforge_extension_collect_errors' } };
    },
  },
  {
    name: 'fileforge_extension_run_extension_check',
    action: 'run_extension_check',
    description: 'Run a composable extension QA check: manifest, permissions, storage, service worker, injection, and errors.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' }, selectors: { type: 'array', items: { type: 'string' } }, store: { type: 'boolean', default: true }, project: { type: 'string', default: 'default' } } },
    handler: async (p, { rpcClient }) => {
      const data = dataOf(await rpcClient.send('extension.runExtensionCheck', p));
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'extension_check', tool: 'fileforge_extension_run_extension_check', project: p.project ?? 'default', data, summary: data.summary });
      return { ok: true, ...stored, meta: { tool: 'fileforge_extension_run_extension_check', tabId: p.tabId ?? 'active' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_extension_action',
    description: 'Inspect a Chrome extension: manifest, permissions, storage, service worker, content-script injection and errors. Use this to debug an extension you\'re building, and fileforge_audit_action for store policy checks. reveal_storage_value needs FILEFORGE_ALLOW_SECRET_REVEAL=1. Needs the extension.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
