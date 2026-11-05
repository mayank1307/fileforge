export function buildRunContext({ run, resolvedProps }) {
  return {
    props: { ...resolvedProps },
    steps: {},
    run: {
      id: run.run_id,
      routineId: run.routine_id,
      routineVersion: run.routine_version,
      startedAt: run.started_at,
      trigger: run.trigger,
    },
  };
}

export function recordStepOutput(ctx, stepId, normalizedResult, outputKey) {
  const entry = {
    success: normalizedResult.success !== false,
    data: normalizedResult.data ?? {},
    assets: normalizedResult.assets ?? [],
    warnings: normalizedResult.warnings ?? [],
    errors: normalizedResult.errors ?? [],
    durationMs: normalizedResult.durationMs ?? 0,
    metadata: normalizedResult.metadata ?? {},
  };
  ctx.steps[stepId] = entry;
  if (outputKey) ctx.steps[outputKey] = entry;
  return entry;
}
