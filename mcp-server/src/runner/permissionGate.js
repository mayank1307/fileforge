import { capabilityCatalog } from '../planner/capabilityCatalog.js';

export function checkStepPermissions(step, routinePermissions = {}) {
  const action = step.params?.action ?? step.action ?? null;
  const entry = action ? capabilityCatalog.findAction(step.tool, action) : null;
  if (!entry) {
    return { allowed: true, requiredPermissions: [], grantedPermissions: [], missing: [] };
  }
  const granted = Object.entries(routinePermissions).filter(([, v]) => v === true).map(([k]) => k);
  const missing = entry.permissions.filter((p) => !granted.includes(p));
  return {
    allowed: missing.length === 0,
    requiredPermissions: entry.permissions,
    grantedPermissions: granted,
    missing,
    risk: entry.risk,
  };
}
