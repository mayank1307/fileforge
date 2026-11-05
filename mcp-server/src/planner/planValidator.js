import { capabilityCatalog } from './capabilityCatalog.js';
import { collectReferences } from '../utils/propsResolver.js';

const KNOWN_REFERENCE_ROOTS = new Set(['props', 'steps', 'run', 'secret']);

function asArray(v) { return Array.isArray(v) ? v : []; }

function validateStepShape(step, index) {
  const errors = [];
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    errors.push({ code: 'INVALID_STEP', message: `Step ${index} must be an object.`, index });
    return errors;
  }
  if (!step.tool || typeof step.tool !== 'string') {
    errors.push({ code: 'STEP_MISSING_TOOL', message: `Step ${index} missing required "tool".`, index });
  }
  if (step.params != null && (typeof step.params !== 'object' || Array.isArray(step.params))) {
    errors.push({ code: 'STEP_PARAMS_INVALID', message: `Step ${index} "params" must be an object.`, index });
  }
  if (step.onFailure && !['stop', 'continue', 'skip'].includes(step.onFailure)) {
    errors.push({ code: 'STEP_BAD_ONFAILURE', message: `Step ${index} onFailure must be one of stop/continue/skip.`, index });
  }
  if (step.dependsOn && !Array.isArray(step.dependsOn)) {
    errors.push({ code: 'STEP_BAD_DEPENDS', message: `Step ${index} dependsOn must be an array.`, index });
  }
  return errors;
}

export function validatePlan({ steps, propsSchema = {}, defaultProps = {}, permissions = {} } = {}) {
  const errors = [];
  const warnings = [];
  const stepIds = new Set();
  const definedStepIds = new Set();
  const requiredPermissions = new Set();

  if (!Array.isArray(steps) || steps.length === 0) {
    return {
      ok: false,
      errors: [{ code: 'EMPTY_STEPS', message: 'A plan must include at least one step.' }],
      warnings,
      requiredPermissions: [],
      grantedPermissions: [],
      permissionGaps: [],
    };
  }

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    errors.push(...validateStepShape(step, i));
    if (!step?.tool) continue;
    const stepId = step.id ?? `step_${i + 1}`;
    if (stepIds.has(stepId)) {
      errors.push({ code: 'STEP_ID_DUPLICATE', message: `Duplicate step id "${stepId}".`, index: i });
    }
    stepIds.add(stepId);

    for (const dep of asArray(step.dependsOn)) {
      if (!definedStepIds.has(dep)) {
        errors.push({ code: 'STEP_DEPENDS_UNKNOWN', message: `Step "${stepId}" depends on unknown step "${dep}".`, index: i });
      }
    }

    const requestedAction = step.params?.action ?? step.action;
    const catalogEntry = requestedAction ? capabilityCatalog.findAction(step.tool, requestedAction) : null;

    if (!capabilityCatalog.get().tools[step.tool]) {
      warnings.push({ code: 'TOOL_NOT_CATALOGED', message: `Tool "${step.tool}" has no declared capabilities — cannot enforce permissions or required params.`, index: i });
    } else if (requestedAction && !catalogEntry) {
      errors.push({ code: 'UNKNOWN_ACTION', message: `Tool "${step.tool}" has no action "${requestedAction}".`, index: i });
    } else if (catalogEntry) {
      for (const perm of catalogEntry.permissions) requiredPermissions.add(perm);
      for (const [name, def] of Object.entries(catalogEntry.params ?? {})) {
        if (def.required && (step.params?.[name] === undefined || step.params?.[name] === null)) {
          errors.push({ code: 'STEP_MISSING_PARAM', message: `Step "${stepId}" missing required param "${name}".`, index: i });
        }
      }
    }

    const refs = collectReferences(step.params ?? {});
    for (const ref of refs) {
      const inner = ref.replace(/^\{+|\}+$/g, '').trim();
      if (inner.startsWith('secret:')) continue;
      const root = inner.split('.')[0];
      if (root === 'props' || (!KNOWN_REFERENCE_ROOTS.has(root) && !inner.includes('.'))) {
        const propName = root === 'props' ? inner.slice('props.'.length).split('.')[0] : root;
        if (!propsSchema[propName] && defaultProps[propName] === undefined) {
          warnings.push({ code: 'PROP_UNDECLARED', message: `Reference ${ref} not declared in propsSchema or defaultProps.`, index: i });
        }
      }
      if (root === 'steps') {
        const parts = inner.slice('steps.'.length).split('.');
        const referredStepId = parts[0];
        if (!definedStepIds.has(referredStepId) && referredStepId !== stepId) {
          warnings.push({ code: 'STEP_REF_UNRESOLVED', message: `Reference ${ref} points to step "${referredStepId}" which is not yet defined when step "${stepId}" runs.`, index: i });
        }
      }
    }

    definedStepIds.add(stepId);
  }

  const grantedPermissions = Object.entries(permissions).filter(([, v]) => v === true).map(([k]) => k);
  const permissionGaps = Array.from(requiredPermissions).filter((p) => !grantedPermissions.includes(p));
  const ok = errors.length === 0;
  return {
    ok,
    errors,
    warnings,
    requiredPermissions: Array.from(requiredPermissions),
    grantedPermissions,
    permissionGaps,
  };
}
