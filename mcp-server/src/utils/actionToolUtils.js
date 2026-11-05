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

function resolveAction(actionMap, normalizedActions, requestedAction) {
  if (!requestedAction) {
    return {
      action: normalizedActions[0],
      warning: `No action provided; defaulted to "${normalizedActions[0].action}".`,
      requestedAction,
    };
  }

  const direct = actionMap.get(requestedAction);
  if (direct) return { action: direct };

  const requestedKey = normalizeActionKey(requestedAction);
  const fuzzy = normalizedActions.find((item) => normalizeActionKey(item.action) === requestedKey)
    ?? (() => {
      const contains = normalizedActions.filter((item) => {
        const actionKey = normalizeActionKey(item.action);
        return requestedKey.includes(actionKey) || actionKey.includes(requestedKey);
      });
      return contains.length === 1 ? contains[0] : undefined;
    })();
  if (fuzzy) {
    return {
      action: fuzzy,
      warning: `Unknown action "${requestedAction}"; matched "${fuzzy.action}".`,
      requestedAction,
    };
  }

  return {
    action: normalizedActions[0],
    warning: `Unknown action "${requestedAction}"; defaulted to "${normalizedActions[0].action}".`,
    requestedAction,
  };
}

function describeActions(actions) {
  return actions
    .map((action) => `${action.action}: ${action.description}`)
    .join(' ');
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

export function makeActionTool({ name, description, actions, prefix, capabilities }) {
  const normalizedActions = actions.map((action) => ({
    ...action,
    action: action.action ?? deriveActionName(action.name, prefix),
  }));
  const actionMap = new Map(normalizedActions.map((action) => [action.action, action]));
  const aggregatedCapabilities = capabilities ?? buildCapabilities(name, normalizedActions);

  return {
    name,
    description,
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
          description: `The action to perform. Available actions: ${describeActions(normalizedActions)}`,
        },
        ...mergeActionProperties(normalizedActions),
      },
      required: ['action'],
    },
    handler: async (params = {}, ctx) => {
      const resolved = resolveAction(actionMap, normalizedActions, params.action);
      const action = resolved.action;
      const resolvedParams = { ...params, action: action.action };
      requireActionParams(action, resolvedParams);
      const result = normalizeActionResult(await action.handler(resolvedParams, ctx), name, action.action);
      const meta = {
        ...(result.meta ?? {}),
        requestedAction: resolved.requestedAction,
        availableActions: actionCatalog(normalizedActions),
      };
      if (resolved.warning) meta.actionWarning = resolved.warning;
      const warnings = resolved.warning ? [resolved.warning, ...(result.warnings ?? [])] : result.warnings;
      return { ...result, warnings, meta };
    },
  };
}
