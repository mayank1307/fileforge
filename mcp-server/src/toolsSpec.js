// Import definitions, never the server entry point or WebSocket listener.
import './toolModules.js';
import { registry } from './registry.js';
import { SERVER_VERSION } from './version.js';

export const TOOLS_SPEC_URL = new URL('../../docs/tools-spec.json', import.meta.url);

function title(value) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parameters(schema) {
  return Object.entries(schema.properties ?? {}).map(([name, definition]) => ({
    name,
    required: (schema.required ?? []).includes(name),
    ...definition,
  }));
}

function actionSpec(tool, action) {
  const catalog = tool.actions?.find((entry) => entry.action === action);
  const capability = tool.capabilities?.actions?.[action] ?? null;
  const ownSchema = tool.actionInputSchemas?.[action];
  const schema = ownSchema
    ? { ...ownSchema, properties: { action: { type: 'string', const: action }, ...ownSchema.properties }, required: ['action', ...(ownSchema.required ?? [])] }
    : { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, action: { type: 'string', const: action } } };
  const documentedRequired = Object.entries(capability?.params ?? {}).filter(([, value]) => value.required).map(([name]) => name);
  return {
    id: `${tool.name}.${action}`,
    name: action,
    title: title(action),
    description: catalog?.description ?? capability?.description ?? '',
    input: {
      schemaScope: ownSchema ? 'action' : 'tool',
      schema,
      parameters: parameters(schema),
      capabilityParameters: capability?.params ?? null,
      documentedRequired,
      notes: ownSchema ? [] : ['The tool declares a shared input schema. Capability parameters are action-specific documentation hints, not a complete validation schema. Handler checks may impose additional requirements.'],
    },
    output: {
      responseFormat: 'json',
      envelopeRef: '#/responseFormats/result',
      schema: null,
      schemaStatus: 'not_declared',
      artifactFormats: capability?.produces ?? null,
    },
    capability,
    risk: capability?.risk ?? null,
    flags: capability?.flags ?? null,
    permissions: capability?.permissions ?? null,
    requestTemplate: {
      method: 'tools/call',
      params: {
        name: tool.name,
        arguments: Object.fromEntries([
          ['action', action],
          ...[...new Set([...(schema.required ?? []), ...documentedRequired])].filter((name) => name !== 'action').map((name) => [name, `<${name}>`]),
        ]),
      },
    },
  };
}

export function buildToolsSpec() {
  const tools = registry.listToolDefs().slice().sort((a, b) => a.name.localeCompare(b.name)).map((tool) => {
    const group = tool.name.replace(/^fileforge_/, '').replace(/_action$/, '');
    const actions = (tool.inputSchema?.properties?.action?.enum ?? []).map((action) => actionSpec(tool, action));
    return {
      id: tool.name,
      name: tool.name,
      slug: group,
      title: title(group),
      description: tool.description,
      documentationAnchor: `tools.md#${tool.name}`,
      inputSchema: tool.inputSchema,
      capabilities: tool.capabilities ?? null,
      features: actions.map(({ name, description }) => ({ action: name, description })),
      actionCount: actions.length,
      actions,
    };
  });
  return {
    schemaVersion: '1.0.0',
    product: { name: 'FileForge', version: SERVER_VERSION, description: 'Local MCP server and Chrome extension for browser automation, inspection, analysis, and local artifacts.' },
    generatedFrom: 'mcp-server/src/toolModules.js and the registered tool definitions',
    regenerate: 'cd mcp-server && npm run docs:tools',
    counts: { tools: tools.length, actions: tools.reduce((sum, tool) => sum + tool.actionCount, 0) },
    conventions: {
      toolNaming: 'fileforge_<group>_action',
      actionSelection: 'Pass action in the tool arguments. Missing or unknown actions may resolve to a normalized match or the first action, with a warning.',
      inputSchemas: 'Schemas preserve registered definitions, including defaults, enums, nested properties, and constraints. Defaults are documentation and are applied by individual handlers, not uniformly by the registry.',
      missingMetadata: 'null means metadata is not declared; it does not mean no risk, no permissions, or no output.',
      requestTemplates: 'Schematic tools/call payloads, without a JSON-RPC envelope. Replace <parameter> placeholders with values of the declared type and satisfy handler-specific requirements before use.',
      outputSchemas: 'Action-specific output schemas are not declared in the registry. The shared response format is descriptive, not an enforced output contract. Examples are illustrative, not captured live results.',
      permissions: 'Capability permission identifiers are FileForge policy flags, not Chrome manifest permission names. See docs/permissions.md for Chrome permissions.',
    },
    transport: {
      protocol: 'MCP',
      serverTransport: 'stdio',
      result: { content: [{ type: 'text', text: '<JSON-serialized result object>' }] },
      extensionBridge: { transport: 'WebSocket', url: 'ws://127.0.0.1:47821' },
    },
    responseFormats: {
      result: {
        description: 'Common FileForge result fields. Fields vary by action; ok:false may also represent audit findings without an error object.',
        fields: {
          ok: { type: 'boolean', description: 'Operation or check outcome.' },
          data: { description: 'Action-specific payload; may be any JSON value or absent when stored by reference.' },
          ref: { type: 'string', description: 'Optional reference to stored results.' },
          summary: { description: 'Optional action-specific summary.' },
          warnings: { type: 'array', items: { type: 'string' }, description: 'Optional execution or action-resolution warnings.' },
          meta: { type: 'object', description: 'Tool identity and optional action, URL, tab, timing, and resolution metadata.' },
          error: { type: 'object', description: 'Failure details, usually code and message, optionally details.' },
        },
        successExample: { ok: true, data: { pong: true }, meta: { tool: 'fileforge_runtime_action', action: 'ping' } },
        errorExample: { ok: false, error: { code: 'HANDLER_ERROR', message: 'Illustrative failure', details: {} }, meta: { tool: 'fileforge_runtime_action' } },
      },
    },
    tools,
  };
}

export function renderToolsSpec() {
  return `${JSON.stringify(buildToolsSpec(), null, 2)}\n`;
}
