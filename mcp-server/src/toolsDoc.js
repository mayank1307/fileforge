// Renders docs/tools.md from the tool registry. Imports the tool modules only, never index.js or
// wsServer.js, so rendering does not open the bridge port.
import './toolModules.js';
import { registry } from './registry.js';

export const TOOLS_DOC_URL = new URL('../../docs/tools.md', import.meta.url);

// Escapes text for one line of Markdown: no line breaks, no table-breaking pipes, no stray HTML.
function inline(text) {
  return String(text ?? '')
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

function code(value) {
  return `\`${typeof value === 'string' ? value : JSON.stringify(value)}\``;
}

function typeLabel(schema = {}) {
  if (Array.isArray(schema.type)) return schema.type.join(' or ');
  if (schema.type === 'array') return schema.items?.type ? `array of ${schema.items.type}` : 'array';
  if (schema.type) return schema.type;
  if (schema.oneOf || schema.anyOf) return (schema.oneOf ?? schema.anyOf).map((s) => typeLabel(s)).join(' or ');
  return 'any';
}

function paramDescription(schema = {}) {
  const parts = [];
  if (schema.description) parts.push(inline(schema.description));
  const values = schema.enum ?? schema.items?.enum;
  if (values) parts.push(`One of: ${values.map(code).join(', ')}.`);
  if (schema.default !== undefined) parts.push(`Default: ${code(schema.default)}.`);
  return parts.join(' ');
}

// Per-action descriptions come from makeActionTool's catalog, or else from the tool's capabilities.
function actionRows(tool) {
  const names = tool.inputSchema?.properties?.action?.enum ?? [];
  const catalog = new Map((tool.actions ?? []).map((entry) => [entry.action, entry]));
  const capabilities = registry.getCapabilities(tool.name)?.actions ?? {};
  return names.map((name) => ({
    name,
    description: catalog.get(name)?.description ?? capabilities[name]?.description ?? '',
    required: catalog.get(name)?.required ?? [],
  }));
}

function renderTool(tool) {
  const lines = [`## ${tool.name}`, '', inline(tool.description), '', '### Actions', ''];
  for (const action of actionRows(tool)) {
    let line = `- ${code(action.name)}`;
    if (action.description) line += `: ${inline(action.description)}`;
    if (action.required.length) line += ` Requires ${action.required.map(code).join(', ')}.`;
    lines.push(line);
  }

  const params = Object.entries(tool.inputSchema?.properties ?? {}).filter(([name]) => name !== 'action');
  lines.push('', '### Parameters', '');
  if (!params.length) {
    lines.push('Only `action`.');
  } else {
    lines.push('| Parameter | Type | Description |', '| --- | --- | --- |');
    for (const [name, schema] of params) {
      lines.push(`| ${code(name)} | ${inline(typeLabel(schema))} | ${paramDescription(schema)} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function renderToolsDoc() {
  const tools = registry.listToolDefs().slice().sort((a, b) => a.name.localeCompare(b.name));
  const actionCount = tools.reduce((sum, tool) => sum + actionRows(tool).length, 0);
  const lines = [
    '# Tool reference',
    '',
    '<!-- Generated from the tool registry by `npm run docs:tools` in mcp-server/. Do not edit by hand. -->',
    '',
    `FileForge registers ${tools.length} tools with ${actionCount} actions in all. Every tool takes a required \`action\` parameter that picks what it does; the other parameters apply to the actions that use them. An unknown or missing \`action\` falls back to the closest match, or to the first action, and the response's \`warnings\` say so.`,
    '',
    '| Tool | Actions | Description |',
    '| --- | --- | --- |',
    ...tools.map((tool) => `| [${tool.name}](#${tool.name}) | ${actionRows(tool).length} | ${inline(tool.description)} |`),
    '',
    ...tools.map(renderTool),
  ];
  return lines.join('\n');
}
