const _tools = new Map();
const _capabilities = new Map();

function normalizeActionKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveActionParams(tool, params = {}) {
  const actionSchema = tool.inputSchema?.properties?.action;
  const availableActions = Array.isArray(actionSchema?.enum) ? actionSchema.enum : [];
  if (!availableActions.length) return { params, availableActions };

  if (!params.action) {
    return {
      params: { ...params, action: availableActions[0] },
      availableActions,
      actionWarning: `No action provided; defaulted to "${availableActions[0]}".`,
      requestedAction: params.action,
    };
  }

  if (availableActions.includes(params.action)) return { params, availableActions };

  const requestedKey = normalizeActionKey(params.action);
  const fuzzy = availableActions.find((action) => normalizeActionKey(action) === requestedKey)
    ?? (() => {
      const contains = availableActions.filter((action) => {
        const actionKey = normalizeActionKey(action);
        return requestedKey.includes(actionKey) || actionKey.includes(requestedKey);
      });
      return contains.length === 1 ? contains[0] : undefined;
    })();
  const action = fuzzy ?? availableActions[0];
  return {
    params: { ...params, action },
    availableActions,
    actionWarning: fuzzy
      ? `Unknown action "${params.action}"; matched "${action}".`
      : `Unknown action "${params.action}"; defaulted to "${action}".`,
    requestedAction: params.action,
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
      availableActions: normalized.meta?.availableActions ?? resolution.availableActions,
      actionWarning: resolution.actionWarning,
    },
  };
}

export const registry = {
  register(toolDef) {
    _tools.set(toolDef.name, toolDef);
    if (toolDef.capabilities) _capabilities.set(toolDef.name, toolDef.capabilities);
  },

  registerMany(toolDefs) {
    for (const t of toolDefs) this.register(t);
  },

  listTools() {
    return Array.from(_tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
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
      const result = await tool.handler(resolution.params, ctx);
      return attachActionResolution(result, name, resolution);
    } catch (err) {
      return {
        ok: false,
        error: { code: err?.code ?? 'HANDLER_ERROR', message: err?.message ?? String(err), details: err?.details ?? {} },
        meta: { tool: name },
      };
    }
  },
};
