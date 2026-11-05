function deriveActionName(name, prefix) {
  if (!name || !prefix || !name.startsWith(prefix)) return name;
  return name.slice(prefix.length).replace(/^_+/, '');
}

function mergeActionProperties(actions) {
  const properties = {};
  for (const action of actions) {
    for (const [key, value] of Object.entries(action.inputSchema?.properties ?? {})) {
      if (!properties[key]) {
        properties[key] = value;
        continue;
      }
      const existingEnum = properties[key].enum;
      const nextEnum = value.enum;
      if (Array.isArray(existingEnum) && Array.isArray(nextEnum)) {
        properties[key] = { ...properties[key], ...value, enum: Array.from(new Set([...existingEnum, ...nextEnum])) };
      } else {
        properties[key] = { ...properties[key], ...value };
        delete properties[key].enum;
      }
    }
  }
  return properties;
}

function normalizeActionResult(result, tool, action) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { ok: true, data: result, meta: { tool, action } };
  }
  return { ...result, meta: { ...(result.meta ?? {}), tool, action } };
}

function requireActionParams(action, params) {
  for (const key of action.inputSchema?.required ?? []) {
    if (params[key] === undefined || params[key] === null) {
      throw new Error(`${key} is required for ${action.action}`);
    }
  }
}

function actionCatalog(actions) {
  return actions.map((action) => ({
    action: action.action,
    description: action.description,
    required: action.inputSchema?.required ?? [],
  }));
}

function normalizeActionKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Returns the action a request names, ignoring case and punctuation, or undefined. It never guesses further: a near
// miss could be a different state-changing action, so callers must reject anything this doesn't match.
export function matchAction(availableActions, requestedAction) {
  if (availableActions.includes(requestedAction)) return requestedAction;
  const requestedKey = normalizeActionKey(requestedAction);
  if (!requestedKey) return undefined;
  return availableActions.find((action) => normalizeActionKey(action) === requestedKey);
}

export function unknownActionError(tool, requestedAction, availableActions) {
  const list = availableActions.join(', ');
  const message = requestedAction
    ? `Unknown action "${requestedAction}" for ${tool}. Nothing was run. Available actions: ${list}.`
    : `No action provided for ${tool}. Nothing was run. Available actions: ${list}.`;
  return {
    ok: false,
    error: { code: 'UNKNOWN_ACTION', message, details: { requestedAction, availableActions } },
    meta: { tool },
  };
}

// One entry per action, from the tool's own catalog or else its capabilities.
export function actionEntries(tool) {
  const names = tool.inputSchema?.properties?.action?.enum ?? [];
  const catalog = new Map((tool.actions ?? []).map((entry) => [entry.action, entry]));
  const capabilities = tool.capabilities?.actions ?? {};
  return names.map((action) => {
    const capability = capabilities[action];
    const required = catalog.get(action)?.required
      ?? Object.entries(capability?.params ?? {}).filter(([, param]) => param.required).map(([param]) => param);
    return {
      action,
      description: catalog.get(action)?.description ?? capability?.description ?? '',
      required: required.filter((param) => param !== 'action'),
    };
  });
}

// Every parameter sits in one flat schema, so the action list is where an agent learns what each action does and needs.
export function withActionCatalog(tool) {
  const actionSchema = tool.inputSchema?.properties?.action;
  if (!actionSchema?.enum) return tool;
  const lines = actionEntries(tool).map(({ action, description, required }) => {
    const signature = required.length ? `${action} (${required.join(', ')})` : action;
    return description ? `${signature}: ${description}` : signature;
  });
  const properties = {
    ...tool.inputSchema.properties,
    action: { ...actionSchema, description: `What to do. Required parameters are in brackets. ${lines.join(' ')}` },
  };
  return { ...tool, inputSchema: { ...tool.inputSchema, properties } };
}

function buildCapabilities(name, normalizedActions) {
  const actionsCaps = {};
  for (const action of normalizedActions) {
    if (!action.capability) continue;
    actionsCaps[action.action] = {
      description: action.capability.description ?? action.description ?? '',
      params: action.capability.params ?? {},
      risk: action.capability.risk ?? 'low',
      flags: action.capability.flags ?? {},
      permissions: action.capability.permissions ?? [],
      produces: action.capability.produces ?? [],
    };
  }
  if (Object.keys(actionsCaps).length === 0) return null;
  return { tool: name, actions: actionsCaps };
}

export function makeActionTool({ name, description, annotations, actions, prefix, capabilities }) {
  const normalizedActions = actions.map((action) => ({
    ...action,
    action: action.action ?? deriveActionName(action.name, prefix),
  }));
  const actionMap = new Map(normalizedActions.map((action) => [action.action, action]));
  const actionNames = normalizedActions.map((action) => action.action);
  const aggregatedCapabilities = capabilities ?? buildCapabilities(name, normalizedActions);

  return {
    name,
    description,
    annotations,
    capabilities: aggregatedCapabilities,
    actions: actionCatalog(normalizedActions),
    // Documentation metadata only; keep the runtime action catalog compact.
    actionInputSchemas: Object.fromEntries(normalizedActions.map((action) => [action.action, action.inputSchema ?? { type: 'object', properties: {} }])),
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: normalizedActions.map((item) => item.action),
        },
        ...mergeActionProperties(normalizedActions),
      },
      required: ['action'],
    },
    handler: async (params = {}, ctx) => {
      const actionName = matchAction(actionNames, params.action);
      if (!actionName) return unknownActionError(name, params.action, actionNames);
      const action = actionMap.get(actionName);
      const resolvedParams = { ...params, action: action.action };
      requireActionParams(action, resolvedParams);
      const result = normalizeActionResult(await action.handler(resolvedParams, ctx), name, action.action);
      const meta = {
        ...(result.meta ?? {}),
        requestedAction: params.action,
      };
      if (actionName === params.action) return { ...result, meta };
      const warning = `Unknown action "${params.action}"; matched "${actionName}".`;
      meta.actionWarning = warning;
      return { ...result, warnings: [warning, ...(result.warnings ?? [])], meta };
    },
  };
}
