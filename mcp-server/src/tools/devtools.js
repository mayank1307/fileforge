import { registry } from '../registry.js';
import { writeExportFile } from '../utils/exportUtils.js';
import { maybeStoreResult } from '../utils/resultUtils.js';
import { sanitizeHar, summarizeHar } from '../utils/privacyUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import {
  handleQueryDevtools,
  normalizeActionName,
  PRESETS as DEVTOOLS_PRESETS,
  validateEvaluate,
  validateReplay,
  classifyReplayRisk,
  createErrorResponse,
} from './devtoolsQuery.js';

const TOOL_NAME = 'fileforge_devtools_action';

function metaFor(action, extra = {}) {
  return { tool: TOOL_NAME, action, ...extra };
}

const actionDefs = [
  {
    name: 'fileforge_devtools_query',
    action: 'query_devtools',
    description: 'Unified GraphQL-feel DevTools query. Select modules (console, jsErrors, network, apiResponses, graphql, performance, webSockets, coverage, storageSummary, sourceMaps, requestChains, apiInsights, harSummary, security, thirdParties, issues, recommendations, summary) and presets in one call.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        preset: { type: 'string', enum: Object.keys(DEVTOOLS_PRESETS) },
        query: { type: 'object' },
        autoStartSession: { type: 'boolean' },
        captureForMs: { type: 'number' },
        stopAfterCapture: { type: 'boolean' },
      },
    },
    handler: async (p, ctx) => handleQueryDevtools(p, ctx),
  },
  {
    name: 'fileforge_devtools_start_session',
    action: 'start_session',
    description: 'Start an instrumented DevTools capture session for a tab.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'string', default: 'active' } },
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('devtools.startSession', p);
      return { ok: true, data, meta: metaFor('start_session') };
    },
  },
  {
    name: 'fileforge_devtools_stop_session',
    action: 'stop_session',
    description: 'Stop the DevTools capture session.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'string', default: 'active' } },
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('devtools.stopSession', p);
      return { ok: true, data, meta: metaFor('stop_session') };
    },
  },
  {
    name: 'fileforge_devtools_clear_session',
    action: 'clear_session',
    description: 'Clear captured DevTools session data without detaching.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'string', default: 'active' } },
    },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('devtools.clearSession', p);
      return { ok: true, data, meta: metaFor('clear_session') };
    },
  },
  {
    name: 'fileforge_devtools_session',
    action: 'session',
    description: 'Unified session lifecycle action: operation = start | stop | clear | status.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        operation: { type: 'string', enum: ['start', 'stop', 'clear', 'status'] },
      },
      required: ['operation'],
    },
    handler: async (p, { rpcClient }) => {
      const op = p.operation;
      if (op === 'start') return { ok: true, data: await rpcClient.send('devtools.startSession', p), meta: metaFor('session', { operation: op }) };
      if (op === 'stop') return { ok: true, data: await rpcClient.send('devtools.stopSession', p), meta: metaFor('session', { operation: op }) };
      if (op === 'clear') return { ok: true, data: await rpcClient.send('devtools.clearSession', p), meta: metaFor('session', { operation: op }) };
      // status — probe via getConsole
      const probe = await rpcClient.send('devtools.getConsole', p).catch(() => null);
      const active = !!probe?.ok;
      return { ok: true, data: { active, tabId: p.tabId ?? 'active' }, meta: metaFor('session', { operation: op }) };
    },
  },
  {
    name: 'fileforge_devtools_get_console',
    action: 'get_console',
    description: 'Read recent console messages. Legacy action — prefer query_devtools with console module.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' }, levels: { type: 'array', items: { type: 'string' } } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('devtools.getConsole', p);
      return { ok: true, data, meta: metaFor('get_console') };
    },
  },
  {
    name: 'fileforge_devtools_get_js_errors',
    action: 'get_js_errors',
    description: 'Get JavaScript errors. Legacy action — prefer query_devtools with jsErrors module.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('devtools.getJsErrors', p);
      return { ok: true, data, meta: metaFor('get_js_errors') };
    },
  },
  {
    name: 'fileforge_devtools_get_network',
    action: 'get_network',
    description: 'Inspect network requests. Legacy action — prefer query_devtools with network module.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        store: { type: 'boolean', default: true },
        includeBodies: { type: 'boolean' },
        filter: { type: 'object', properties: { types: { type: 'array', items: { type: 'string' } }, statusGte: { type: 'number' }, urlContains: { type: 'string' } } },
      },
    },
    handler: async (p, { rpcClient }) => {
      if (p.includeBodies === undefined) p.includeBodies = false;
      const data = await rpcClient.send('devtools.getNetwork', p);
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'devtools_network', tool: 'fileforge_devtools_action_network', data: data.data ?? data });
      return { ok: true, ...stored, meta: metaFor('get_network') };
    },
  },
  {
    name: 'fileforge_devtools_get_api_responses',
    action: 'get_api_responses',
    description: 'Extract API response bodies. Legacy action — prefer query_devtools with apiResponses module.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' }, store: { type: 'boolean', default: true }, includeBodies: { type: 'boolean' } } },
    handler: async (p, { rpcClient }) => {
      if (p.includeBodies === undefined) p.includeBodies = true;
      const data = await rpcClient.send('devtools.getApiResponses', p);
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'devtools_api', tool: 'fileforge_devtools_action_api', data: data.data ?? data });
      return { ok: true, ...stored, meta: metaFor('get_api_responses') };
    },
  },
  {
    name: 'fileforge_devtools_get_performance',
    action: 'get_performance',
    description: 'Get performance timing metrics. Legacy action — prefer query_devtools with performance module.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' }, store: { type: 'boolean', default: true } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('devtools.getPerformance', p);
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'devtools_perf', tool: 'fileforge_devtools_action_perf', data: data.data ?? data });
      return { ok: true, ...stored, meta: metaFor('get_performance') };
    },
  },
  {
    name: 'fileforge_devtools_get_websockets',
    action: 'get_websockets',
    description: 'Inspect WebSocket frames. Legacy action — prefer query_devtools with webSockets module.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' }, store: { type: 'boolean', default: true } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('devtools.getWebSockets', p);
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'devtools_ws', tool: 'fileforge_devtools_action_ws', data: data.data ?? data });
      return { ok: true, ...stored, meta: metaFor('get_websockets') };
    },
  },
  {
    name: 'fileforge_devtools_evaluate',
    action: 'evaluate',
    description: 'Run JS in page context via DevTools. Guarded: dryRun supported, dangerous patterns blocked unless allowDangerous=true.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        expression: { type: 'string' },
        dryRun: { type: 'boolean' },
        allowDangerous: { type: 'boolean' },
      },
      required: ['expression'],
    },
    handler: async (p, { rpcClient }) => {
      const check = validateEvaluate(p);
      if (check.error) return check.error;
      if (p.dryRun === true) {
        return { ok: true, data: { dryRun: true, expression: p.expression, accepted: true }, meta: metaFor('evaluate', { dryRun: true }) };
      }
      const data = await rpcClient.send('devtools.evaluate', p);
      return { ok: true, data, meta: metaFor('evaluate') };
    },
  },
  {
    name: 'fileforge_devtools_replay_request',
    action: 'replay_request',
    description: 'Replay a captured network request. Guarded: dryRun supported, non-idempotent methods and risky endpoints blocked unless allowUnsafeMethods=true.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        requestId: { type: 'string' },
        overrides: { type: 'object' },
        dryRun: { type: 'boolean' },
        allowUnsafeMethods: { type: 'boolean' },
      },
      required: ['requestId'],
    },
    handler: async (p, { rpcClient }) => {
      if (!p.requestId) return createErrorResponse('INVALID_FIELD', 'requestId is required for replay_request');
      const check = validateReplay(p, p.overrides ?? {});
      if (check.error) return check.error;
      if (p.dryRun === true) {
        return {
          ok: true,
          data: {
            dryRun: true,
            risk: check.risk,
            method: (p.overrides?.method ?? 'GET').toUpperCase(),
            url: p.overrides?.url ?? null,
          },
          meta: metaFor('replay_request', { dryRun: true, risk: check.risk }),
        };
      }
      const data = await rpcClient.send('devtools.replayRequest', p);
      return { ok: true, data, meta: metaFor('replay_request', { risk: check.risk }) };
    },
  },
  {
    name: 'fileforge_devtools_export_har',
    action: 'export_har',
    description: 'Export the captured session as a HAR archive on disk.',
    inputSchema: { type: 'object', properties: { tabId: { type: 'string', default: 'active' }, filename: { type: 'string' }, includeBodies: { type: 'boolean' } } },
    handler: async (p, { rpcClient }) => {
      const data = await rpcClient.send('devtools.exportHar', p);
      if (!data?.ok) return data;
      const rawHar = data.data?.har ?? data.data ?? data;
      const har = sanitizeHar(rawHar);
      const summary = summarizeHar(har);
      const filename = writeExportFile({
        filename: p.filename,
        defaultName: `fileforge-${Date.now()}.har`,
        contents: JSON.stringify(har, null, 2),
      });
      return { ok: true, data: { filename, summary, har: p.includeBodies ? har : undefined }, summary, meta: metaFor('export_har') };
    },
  },
];

const devtoolsCapabilities = {
  tool: TOOL_NAME,
  actions: {
    query_devtools: { description: 'Unified GraphQL-feel DevTools query (modules, presets, issues, recommendations).', params: { preset: { type: 'string' }, query: { type: 'object' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    start_session: { description: 'Start a DevTools capture session.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    stop_session: { description: 'Stop a DevTools capture session.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    clear_session: { description: 'Clear captured session data.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    session: { description: 'Unified session lifecycle action.', params: { operation: { type: 'string', required: true } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    get_console: { description: 'Legacy: get console messages.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    get_js_errors: { description: 'Legacy: get JS errors.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    get_network: { description: 'Legacy: get network requests.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true, network: true }, permissions: ['allowBrowser'], produces: ['json'] },
    get_api_responses: { description: 'Legacy: get API responses.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true, network: true }, permissions: ['allowBrowser'], produces: ['json'] },
    get_performance: { description: 'Legacy: get performance metrics.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    get_websockets: { description: 'Legacy: get WebSocket frames.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    evaluate: { description: 'Run guarded JS in page context. dryRun supported.', params: { expression: { type: 'string', required: true } }, risk: 'high', flags: { read: true, browser: true, mutate: true }, permissions: ['allowBrowser', 'allowEvaluate'], produces: ['json'] },
    replay_request: { description: 'Replay a captured request with risk classification.', params: { requestId: { type: 'string', required: true } }, risk: 'high', flags: { read: true, browser: true, network: true, mutate: true }, permissions: ['allowBrowser', 'allowNetwork'], produces: ['json'] },
    export_har: { description: 'Export captured session as HAR.', params: { tabId: { type: 'string' }, filename: { type: 'string' } }, risk: 'low', flags: { read: true, artifact: true }, permissions: ['allowFilesystemWrite'], produces: ['har'] },
  },
};

const baseDevtoolsTool = makeActionTool({
  name: TOOL_NAME,
  description: 'Unified DevTools tool. Primary action: query_devtools (GraphQL-feel modules + presets). Plus session lifecycle, evaluate, replay_request, export_har, and legacy get_* read actions.',
  actions: actionDefs,
  capabilities: devtoolsCapabilities,
});

const devtoolsTool = {
  ...baseDevtoolsTool,
  handler: (params = {}, ctx) => baseDevtoolsTool.handler({ ...params, action: normalizeActionName(params.action) }, ctx),
};

const tools = [devtoolsTool];

registry.registerMany(tools);
export { tools, classifyReplayRisk };
