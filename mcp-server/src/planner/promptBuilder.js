import { capabilityCatalog } from './capabilityCatalog.js';

function paramListLine(params) {
  return Object.entries(params ?? {})
    .map(([name, def]) => `${name}${def.required ? '*' : ''}:${def.type ?? 'any'}`)
    .join(', ');
}

function renderRegistry(flatActions) {
  const lines = [];
  for (const entry of flatActions) {
    lines.push(`- ${entry.tool}.${entry.action} (${entry.risk}) — ${entry.description}`);
    lines.push(`    params: ${paramListLine(entry.params)}`);
    if (entry.permissions?.length) lines.push(`    needs: ${entry.permissions.join(', ')}`);
    if (entry.produces?.length) lines.push(`    produces: ${entry.produces.join(', ')}`);
  }
  return lines.join('\n');
}

export function buildPlanningPrompt({ prompt, propsSchema = {}, permissions = {}, hints = [] }) {
  const granted = Object.entries(permissions).filter(([, v]) => v === true).map(([k]) => k);
  const filtered = capabilityCatalog.filterByPermissions(permissions);
  const flat = filtered.length ? filtered : capabilityCatalog.get().flatActions;

  const propsLines = Object.entries(propsSchema)
    .map(([name, def]) => `- ${name}: ${def.type ?? 'any'}${def.required ? ' (required)' : ''}${def.default !== undefined ? ` default=${JSON.stringify(def.default)}` : ''}${def.description ? ` — ${def.description}` : ''}`)
    .join('\n');

  const planningPrompt = [
    'You are planning an executable FileForge routine from a natural-language goal.',
    '',
    'GOAL:',
    prompt,
    '',
    propsLines ? 'PROPS (referenced as {name} in step params):\n' + propsLines : 'PROPS: none declared',
    '',
    `PERMISSIONS GRANTED: ${granted.length ? granted.join(', ') : '(none)'} — do not emit steps requiring permissions not in this set.`,
    '',
    'AVAILABLE TOOL ACTIONS (only use these):',
    renderRegistry(flat),
    '',
    hints.length ? 'HINTS:\n' + hints.map((h) => `- ${h}`).join('\n') : '',
    '',
    'OUTPUT: a JSON array of steps. Each step is:',
    '{',
    '  "id": "<unique slug>",',
    '  "name": "<short label>",',
    '  "tool": "<one of the tools above>",',
    '  "params": { "action": "<sub-action>", ... },  // use {prop} placeholders, never inline secrets',
    '  "dependsOn": ["<step id>", ...]?,',
    '  "onFailure": "stop" | "continue" | "skip"?,',
    '  "condition": "<expression>"?,',
    '  "outputKey": "<context alias>"?,',
    '  "store": true?,',
    '  "retry": { "count": <n>, "backoffMs": <n> }?,',
    '  "timeout": <ms>?',
    '}',
  ].filter(Boolean).join('\n');

  return {
    planningPrompt,
    toolRegistry: flat,
    propsSchema,
    permissions,
    grantedPermissions: granted,
    responseSchema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'tool', 'params'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          tool: { type: 'string' },
          params: { type: 'object' },
          dependsOn: { type: 'array', items: { type: 'string' } },
          onFailure: { type: 'string', enum: ['stop', 'continue', 'skip'] },
          condition: { type: 'string' },
          outputKey: { type: 'string' },
          store: { type: 'boolean' },
          retry: { type: 'object' },
          timeout: { type: 'number' },
        },
      },
    },
  };
}
