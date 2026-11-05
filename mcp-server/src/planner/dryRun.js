import { capabilityCatalog } from './capabilityCatalog.js';
import { resolveParams, validateProps } from '../utils/propsResolver.js';
import { validatePlan } from './planValidator.js';

export function dryRunRoutine(routine, { propOverrides = {}, simulateMissing = false } = {}) {
  const propsSchema = routine.props_schema ?? routine.propsSchema ?? {};
  const defaultProps = routine.default_props ?? routine.defaultProps ?? {};
  const permissions = routine.permissions ?? {};
  const steps = routine.steps ?? [];

  const mergedProps = { ...defaultProps, ...propOverrides };
  const propsValidation = validateProps(mergedProps, propsSchema);
  const validation = validatePlan({ steps, propsSchema, defaultProps, permissions });

  const ctx = {
    props: propsValidation.value,
    steps: {},
    run: { id: 'dry_run', routineId: routine.id ?? null, startedAt: new Date().toISOString() },
  };

  const plannedSteps = [];
  const missingInputs = [];
  const riskyActions = [];
  const expectedArtifacts = [];

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const stepId = step.id ?? `step_${i + 1}`;
    const action = step.params?.action ?? step.action ?? null;
    let resolvedParams = step.params ?? {};
    const resolveResult = (() => {
      try {
        return resolveParams(step.params ?? {}, ctx, { allowMissing: true });
      } catch (err) {
        return { value: step.params ?? {}, missing: [{ kind: 'error', error: err.message, ref: null }], secretValues: [] };
      }
    })();
    resolvedParams = resolveResult.value;
    for (const m of resolveResult.missing) {
      missingInputs.push({ stepId, ...m });
    }

    const catalogEntry = action ? capabilityCatalog.findAction(step.tool, action) : null;
    let willRun = true;
    let skipReason = null;
    if (!simulateMissing && resolveResult.missing.some((m) => m.kind === 'prop' || m.kind === 'secret')) {
      willRun = false;
      skipReason = 'unresolved input';
    }
    if (catalogEntry && (catalogEntry.risk === 'high' || catalogEntry.risk === 'medium')) {
      riskyActions.push({ stepId, tool: step.tool, action, risk: catalogEntry.risk, description: catalogEntry.description });
    }
    if (catalogEntry?.produces?.length) {
      for (const type of catalogEntry.produces) {
        expectedArtifacts.push({ stepId, type });
      }
    }

    plannedSteps.push({
      stepId,
      tool: step.tool,
      action,
      resolvedParams,
      willRun,
      skipReason,
    });

    ctx.steps[stepId] = { success: true, data: {} };
  }

  const validationErrors = [
    ...validation.errors,
    ...propsValidation.errors.map((e) => ({ code: e.code, message: e.message })),
  ];

  return {
    routineId: routine.id ?? null,
    resolvedProps: propsValidation.value,
    missingInputs,
    plannedSteps,
    riskyActions,
    requiredPermissions: validation.requiredPermissions,
    grantedPermissions: validation.grantedPermissions,
    permissionGaps: validation.permissionGaps,
    expectedArtifacts,
    validationErrors,
    validationWarnings: validation.warnings,
  };
}
