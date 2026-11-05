import { registry } from '../registry.js';

const PERMISSION_KEYS = [
  'allowBrowser',
  'allowNetwork',
  'allowFilesystemRead',
  'allowFilesystemWrite',
  'allowDownloads',
  'allowScreenshots',
  'allowCookies',
  'allowClipboard',
  'allowAuthenticatedSession',
  'allowExternalWebhooks',
];

let _cache = null;

function buildCatalog() {
  const all = registry.allCapabilities();
  const tools = {};
  const flatActions = [];
  const byPermission = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, []]));

  for (const [toolName, caps] of Object.entries(all)) {
    if (!caps?.actions) continue;
    tools[toolName] = caps;
    for (const [actionName, actionCaps] of Object.entries(caps.actions)) {
      const entry = {
        tool: toolName,
        action: actionName,
        description: actionCaps.description ?? '',
        params: actionCaps.params ?? {},
        risk: actionCaps.risk ?? 'low',
        flags: actionCaps.flags ?? {},
        permissions: actionCaps.permissions ?? [],
        produces: actionCaps.produces ?? [],
      };
      flatActions.push(entry);
      for (const perm of entry.permissions) {
        if (byPermission[perm]) byPermission[perm].push({ tool: toolName, action: actionName });
      }
    }
  }
  return { tools, flatActions, byPermission, permissionKeys: PERMISSION_KEYS };
}

export const capabilityCatalog = {
  build({ refresh = true } = {}) {
    if (refresh || !_cache) _cache = buildCatalog();
    return _cache;
  },

  get() {
    if (!_cache) _cache = buildCatalog();
    return _cache;
  },

  refresh() {
    _cache = buildCatalog();
    return _cache;
  },

  findAction(tool, action) {
    const catalog = this.get();
    return catalog.flatActions.find((a) => a.tool === tool && a.action === action) ?? null;
  },

  hasAction(tool, action) {
    return this.findAction(tool, action) !== null;
  },

  toolNames() {
    return Object.keys(this.get().tools);
  },

  filterByPermissions(grantedPermissions = {}) {
    const granted = new Set(
      Object.entries(grantedPermissions)
        .filter(([, v]) => v === true)
        .map(([k]) => k),
    );
    return this.get().flatActions.filter((a) => a.permissions.every((p) => granted.has(p)));
  },

  permissionKeys() {
    return PERMISSION_KEYS;
  },
};
