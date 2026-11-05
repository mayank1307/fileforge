import { describeToolParams } from './utils/paramDescriptions.js';
import { normalizeToolResponse, TOOL_OUTPUT_SCHEMA } from './utils/toolResponse.js';
import { matchAction, unknownActionError, withActionCatalog } from './utils/actionToolUtils.js';

const _tools = new Map();
const _capabilities = new Map();

function resolveActionParams(tool, params = {}) {
  const actionSchema = tool.inputSchema?.properties?.action;
  const availableActions = Array.isArray(actionSchema?.enum) ? actionSchema.enum : [];
  if (!availableActions.length) return { params, availableActions };

  const requested = params.action;
  if (availableActions.includes(requested)) return { params, availableActions };

  // Tools with legacy aliases (such as go_back) resolve them in their own handlers.
  if (requested && tool.normalizeAction && tool.normalizeAction(requested) !== requested) {
    return { params, availableActions };
  }

  const action = matchAction(availableActions, requested);
  if (!action) return { rejection: unknownActionError(tool.name, requested, availableActions) };
  return {
    params: { ...params, action },
    availableActions,
    actionWarning: `Unknown action "${requested}"; matched "${action}".`,
    requestedAction: requested,
  };
}

function attachActionResolution(result, toolName, resolution) {
  if (!resolution?.actionWarning && !resolution?.availableActions?.length) return result;
  const normalized = result && typeof result === 'object' && !Array.isArray(result)
    ? result
    : { ok: true, data: result };
  const warnings = resolution.actionWarning
    ? [resolution.actionWarning, ...(normalized.warnings ?? [])]
    : normalized.warnings;
  return {
    ...normalized,
    warnings,
    meta: {
      ...(normalized.meta ?? {}),
      tool: normalized.meta?.tool ?? toolName,
      requestedAction: resolution.requestedAction,
      actionWarning: resolution.actionWarning,
    },
  };
}

export const registry = {
  register(rawToolDef) {
    const toolDef = withActionCatalog(describeToolParams(rawToolDef));
    _tools.set(toolDef.name, toolDef);
    if (toolDef.capabilities) _capabilities.set(toolDef.name, toolDef.capabilities);
  },

  registerMany(toolDefs) {
    for (const t of toolDefs) this.register(t);
  },

  listTools() {
    return Array.from(_tools.values()).map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema,
      outputSchema: TOOL_OUTPUT_SCHEMA,
      ...(annotations ? { annotations } : {}),
    }));
  },

  // Full definitions, including the per-action catalog from makeActionTool. Used to generate docs/tools.md.
  listToolDefs() {
    return Array.from(_tools.values());
  },

  getCapabilities(toolName) {
    return _capabilities.get(toolName) ?? null;
  },

  allCapabilities() {
    const out = {};
    for (const [name, caps] of _capabilities) out[name] = caps;
    return out;
  },

  async call(name, params, ctx) {
    const tool = _tools.get(name);
    if (!tool) {
      return {
        ok: false,
        error: { code: 'UNKNOWN_TOOL', message: `No tool registered: ${name}` },
        meta: { tool: name },
      };
    }
    try {
      const resolution = resolveActionParams(tool, params ?? {});
      if (resolution.rejection) return resolution.rejection;
      const result = await tool.handler(resolution.params, ctx);
      return normalizeToolResponse(attachActionResolution(result, name, resolution));
    } catch (err) {
      return {
        ok: false,
        error: { code: err?.code ?? 'HANDLER_ERROR', message: err?.message ?? String(err), details: err?.details ?? {} },
        meta: { tool: name },
      };
    }
  },
};
