import { registry } from '../registry.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { SERVER_VERSION, extensionVersionWarning } from '../version.js';
import { EXPECTED_BUILD_ID, extensionBuildWarning } from '../extensionBuild.js';
import { PAIRING_REQUIRED_CODE } from '../bridgeAuth.js';

const actionDefs = [
  {
    name: 'fileforge_runtime_ping',
    description: 'Check that the MCP server is alive.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_params, _ctx) => ({
      ok: true,
      data: { pong: true },
      meta: { tool: 'fileforge_runtime_ping', createdAt: new Date().toISOString() },
    }),
  },
  {
    name: 'fileforge_runtime_status',
    description: 'Get the current status of the MCP bridge and extension connection.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_params, { rpcClient }) => {
      try {
        const response = await rpcClient.send('runtime.status', {});
        const { version: extensionVersion, buildId } = response?.data ?? response ?? {};
        const warning = extensionVersionWarning(extensionVersion);
        // Only meaningful once the versions match: a different version already explains a different build.
        const buildWarning = warning ? null : extensionBuildWarning(buildId);
        return {
          ok: true,
          data: response,
          summary: {
            serverVersion: SERVER_VERSION,
            extensionVersion: extensionVersion ?? null,
            versionsMatch: !warning,
            extensionBuild: buildId ?? null,
            expectedBuild: EXPECTED_BUILD_ID,
            buildsMatch: !warning && !buildWarning,
          },
          warnings: [warning, buildWarning].filter(Boolean),
          meta: { tool: 'fileforge_runtime_status' },
        };
      } catch (err) {
        // The bridge owner reports an extension it refused for lack of pairing as `PAIRING_REQUIRED: <help>`.
        const code = err.message.startsWith(`${PAIRING_REQUIRED_CODE}: `) ? PAIRING_REQUIRED_CODE : 'BRIDGE_UNAVAILABLE';
        const message = code === PAIRING_REQUIRED_CODE ? err.message.slice(PAIRING_REQUIRED_CODE.length + 2) : err.message;
        return { ok: false, error: { code, message }, meta: { tool: 'fileforge_runtime_status' } };
      }
    },
  },
  {
    name: 'fileforge_runtime_capabilities',
    description: 'List all registered tools and their availability.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_params, _ctx) => ({
      ok: true,
      data: { tools: registry.listTools().map((t) => t.name) },
      meta: { tool: 'fileforge_runtime_capabilities' },
    }),
  },
  {
    name: 'fileforge_runtime_request_log',
    description: 'Get recent RPC request log entries.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return', default: 50 },
        failuresOnly: { type: 'boolean', default: false },
        includeDetails: { type: 'boolean', default: true },
      },
    },
    handler: async (_params, { rpcClient }) => {
      const response = await rpcClient.send('runtime.requestLog', {
        limit: _params.limit ?? 50,
        failuresOnly: _params.failuresOnly ?? false,
        includeDetails: _params.includeDetails ?? true,
      });
      return { ok: true, data: response?.data ?? response, meta: { tool: 'fileforge_runtime_request_log' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_runtime_action',
    description: 'Runtime health, status, capabilities, and request log actions.',
    prefix: 'fileforge_runtime_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
