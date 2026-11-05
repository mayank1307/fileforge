import { join } from 'path';
import { routineStore } from '../stores/routineStore.js';
import { runStore } from '../stores/runStore.js';
import { runArtifactStore } from '../stores/runArtifactStore.js';
import { runtimeStorage } from '../utils/runtimeStorage.js';
import { resolveParams, validateProps } from '../utils/propsResolver.js';
import { secretMask } from '../utils/secretMask.js';
import { evaluateCondition } from './conditionEvaluator.js';
import { checkStepPermissions } from './permissionGate.js';
import { buildRunContext, recordStepOutput } from './runContext.js';

function ts() { return new Date().toISOString(); }

function normalizeToolResult(rawResult, durationMs) {
  if (!rawResult || typeof rawResult !== 'object') {
    return { success: false, data: null, assets: [], logs: [], warnings: [], errors: [{ message: 'Empty response from tool.' }], durationMs, metadata: {} };
  }
  if (rawResult.success !== undefined) {
    return {
      success: rawResult.success !== false,
      data: rawResult.data ?? {},
      assets: rawResult.assets ?? [],
      logs: rawResult.logs ?? [],
      warnings: rawResult.warnings ?? [],
      errors: rawResult.errors ?? [],
      durationMs: rawResult.durationMs ?? durationMs,
      metadata: rawResult.metadata ?? rawResult.meta ?? {},
    };
  }
  const ok = rawResult.ok !== false;
  return {
    success: ok,
    data: rawResult.data ?? rawResult.summary ?? rawResult ?? {},
    assets: rawResult.assets ?? rawResult.artifacts ?? [],
    logs: [],
    warnings: rawResult.warnings ?? [],
    errors: ok ? [] : [rawResult.error ?? { message: 'tool returned ok=false' }],
    durationMs,
    metadata: { ...(rawResult.meta ?? {}), ref: rawResult.ref ?? null },
  };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
  });
}

async function callWithTimeout(call, timeoutMs, signal) {
  if (!timeoutMs || timeoutMs <= 0) return call();
  return new Promise(async (resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('STEP_TIMEOUT')); } }, timeoutMs);
    const onAbort = () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('aborted')); } };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const v = await call();
      if (!done) { done = true; clearTimeout(timer); resolve(v); }
    } catch (err) {
      if (!done) { done = true; clearTimeout(timer); reject(err); }
    }
  });
}

function topoOrderSteps(steps) {
  const idToIndex = new Map();
  for (let i = 0; i < steps.length; i += 1) {
    const id = steps[i].id ?? `step_${i + 1}`;
    idToIndex.set(id, i);
  }
  const visited = new Set();
  const order = [];
  const visit = (i) => {
    if (visited.has(i)) return;
    visited.add(i);
    const step = steps[i];
    for (const dep of step.dependsOn ?? []) {
      const di = idToIndex.get(dep);
      if (di !== undefined) visit(di);
    }
    order.push(i);
  };
  for (let i = 0; i < steps.length; i += 1) visit(i);
  return order.map((i) => ({ index: i, step: steps[i], stepId: steps[i].id ?? `step_${i + 1}` }));
}

export async function runRoutine({ runId, registry, abortSignal }) {
  if (!registry) throw new Error('routineRunner requires registry');
  const run = runStore.get(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const versionRow = routineStore.getVersion(run.routine_id, run.routine_version);
  const snapshot = versionRow?.snapshot ?? routineStore.get(run.routine_id);
  if (!snapshot) throw new Error(`Routine snapshot not found: ${run.routine_id}@${run.routine_version}`);

  const steps = snapshot.steps ?? [];
  const propsSchema = snapshot.props_schema ?? snapshot.propsSchema ?? {};
  const defaultProps = snapshot.default_props ?? snapshot.defaultProps ?? {};
  const permissions = snapshot.permissions ?? {};
  const retryPolicy = snapshot.retry_policy ?? snapshot.retryPolicy ?? {};
  const timeoutConfig = snapshot.timeout_config ?? snapshot.timeoutConfig ?? {};

  const mergedProps = { ...defaultProps, ...(run.resolved_props ?? {}) };
  const propsValidation = validateProps(mergedProps, propsSchema);
  if (propsValidation.errors.length) {
    runStore.updateStatus(runId, 'failed', {
      error: { code: 'INVALID_PROPS', errors: propsValidation.errors },
      summary: { successCount: 0, failureCount: 0, skippedCount: 0 },
      finishedAt: ts(),
    });
    runStore.addEvent(runId, 'failed', { reason: 'invalid_props', errors: propsValidation.errors });
    return runStore.get(runId);
  }
  const resolvedProps = propsValidation.value;
  runStore.setResolvedProps(runId, resolvedProps);

  const started = ts();
  runStore.updateStatus(runId, 'running', { startedAt: started });
  routineStore.setLastRunAt(run.routine_id, started);
  routineStore.setStatus(run.routine_id, 'running');
  runStore.addEvent(runId, 'started', { resolvedProps });

  runtimeStorage.writeJson(join(runtimeStorage.runDir(run.routine_id, runId), 'props.json'), resolvedProps);

  const ctx = buildRunContext({ run: { ...run, started_at: started }, resolvedProps });
  const ordered = topoOrderSteps(steps);
  const summary = { successCount: 0, failureCount: 0, skippedCount: 0, awaitingApprovalCount: 0 };
  let stopRun = false;
  let runStatus = 'completed';

  for (const { step, stepId, index } of ordered) {
    if (abortSignal?.aborted) { runStatus = 'cancelled'; break; }
    if (stopRun) break;

    const action = step.params?.action ?? step.action ?? null;

    runStore.createStep({ runId, stepId, stepIndex: index, tool: step.tool, action, status: 'pending', outputKey: step.outputKey ?? null });

    if (step.condition && !evaluateCondition(step.condition, ctx)) {
      summary.skippedCount += 1;
      runStore.updateStep(runId, stepId, { status: 'skipped', startedAt: ts(), finishedAt: ts(), durationMs: 0, result: { skipped: true, reason: 'condition_false' } });
      runStore.addEvent(runId, 'step_skipped', { stepId, reason: 'condition_false' });
      continue;
    }

    const permCheck = checkStepPermissions(step, permissions);
    if (!permCheck.allowed) {
      summary.failureCount += 1;
      const error = { code: 'PERMISSION_DENIED', missing: permCheck.missing, required: permCheck.requiredPermissions };
      runStore.updateStep(runId, stepId, { status: 'failed', startedAt: ts(), finishedAt: ts(), durationMs: 0, result: { success: false, errors: [error] } });
      runStore.addEvent(runId, 'step_failed', { stepId, error });
      if ((step.onFailure ?? 'stop') === 'stop') { stopRun = true; runStatus = 'failed'; }
      continue;
    }

    if (step.requiresApproval) {
      runStore.updateStep(runId, stepId, { status: 'awaiting_approval', startedAt: ts(), result: { reason: step.approvalReason ?? 'manual approval required' } });
      runStore.updateStatus(runId, 'awaiting_approval');
      runStore.addEvent(runId, 'awaiting_approval', { stepId, reason: step.approvalReason ?? null });
      summary.awaitingApprovalCount += 1;
      return runStore.get(runId);
    }

    let resolved;
    try {
      resolved = resolveParams(step.params ?? {}, ctx, { allowMissing: false });
    } catch (err) {
      summary.failureCount += 1;
      const error = { code: err.code ?? 'RESOLVE_ERROR', message: err.message, details: err.details ?? {} };
      runStore.updateStep(runId, stepId, { status: 'failed', startedAt: ts(), finishedAt: ts(), durationMs: 0, result: { success: false, errors: [error] } });
      runStore.addEvent(runId, 'step_failed', { stepId, error });
      if ((step.onFailure ?? 'stop') === 'stop') { stopRun = true; runStatus = 'failed'; }
      continue;
    }
    const resolvedParams = resolved.value;
    const secretValues = resolved.secretValues;
    const maskedParamsForLog = secretMask.mask(resolvedParams, secretValues);

    const maxAttempts = Math.max(1, (step.retry?.count ?? retryPolicy.count ?? 0) + 1);
    const backoffMs = step.retry?.backoffMs ?? retryPolicy.backoffMs ?? 500;
    const stepTimeout = step.timeout ?? timeoutConfig.stepMs ?? 60000;
    runStore.updateStep(runId, stepId, { status: 'running', startedAt: ts(), params: maskedParamsForLog });
    runStore.addEvent(runId, 'step_started', { stepId, tool: step.tool, action, paramsPreview: maskedParamsForLog });

    let attempt = 0;
    let lastError = null;
    let normalized = null;
    const stepStart = Date.now();

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const t0 = Date.now();
        const rawResult = await callWithTimeout(() => registry.call(step.tool, action ? { ...resolvedParams, action } : resolvedParams, {}), stepTimeout, abortSignal);
        const dur = Date.now() - t0;
        normalized = normalizeToolResult(rawResult, dur);
        if (normalized.success) break;
        lastError = normalized.errors?.[0] ?? { message: 'unknown failure' };
        if (attempt < maxAttempts) await sleep(backoffMs * attempt, abortSignal);
      } catch (err) {
        if (err.message === 'aborted') { runStatus = 'cancelled'; stopRun = true; break; }
        lastError = { code: err.code ?? 'STEP_ERROR', message: err.message };
        if (attempt < maxAttempts) await sleep(backoffMs * attempt, abortSignal);
      }
    }

    const finished = ts();
    const durationMs = Date.now() - stepStart;

    if (abortSignal?.aborted) {
      runStore.updateStep(runId, stepId, { status: 'cancelled', attempt, finishedAt: finished, durationMs, result: { success: false, errors: [{ message: 'cancelled' }] } });
      runStatus = 'cancelled';
      stopRun = true;
      break;
    }

    if (!normalized || !normalized.success) {
      summary.failureCount += 1;
      const maskedResult = secretMask.mask({ success: false, errors: [lastError ?? { message: 'failed' }] }, secretValues);
      runStore.updateStep(runId, stepId, { status: 'failed', attempt, finishedAt: finished, durationMs, result: maskedResult });
      runStore.addEvent(runId, 'step_failed', { stepId, attempt, error: lastError });
      runtimeStorage.writeJson(join(runtimeStorage.stepsDir(run.routine_id, runId), `${String(index).padStart(3,'0')}-${stepId}.json`), maskedResult);
      const onFailure = step.onFailure ?? 'stop';
      if (onFailure === 'stop') { stopRun = true; runStatus = 'failed'; }
      continue;
    }

    summary.successCount += 1;
    const maskedResult = secretMask.mask(normalized, secretValues);
    runStore.updateStep(runId, stepId, { status: 'success', attempt, finishedAt: finished, durationMs, result: maskedResult });
    recordStepOutput(ctx, stepId, normalized, step.outputKey);
    runStore.addEvent(runId, 'step_success', { stepId, attempt, durationMs });
    runtimeStorage.writeJson(join(runtimeStorage.stepsDir(run.routine_id, runId), `${String(index).padStart(3,'0')}-${stepId}.json`), maskedResult);

    for (const asset of normalized.assets ?? []) {
      if (asset?.path && asset?.type && asset?.filename) {
        try {
          runArtifactStore.register({
            runId,
            routineId: run.routine_id,
            stepId,
            sourceStepId: stepId,
            type: asset.type,
            filename: asset.filename,
            contents: asset.contents ?? '',
            mime: asset.mime ?? null,
            metadata: asset.metadata ?? null,
          });
        } catch (err) {
          runStore.addEvent(runId, 'artifact_register_failed', { stepId, error: err.message });
        }
      }
    }
  }

  const finishedAt = ts();
  const durationMs = Date.parse(finishedAt) - Date.parse(started);
  const finalSummary = { ...summary, totalSteps: steps.length };
  runStore.updateStatus(runId, runStatus, { finishedAt, durationMs, summary: finalSummary });
  routineStore.setStatus(run.routine_id, 'idle');
  runStore.addEvent(runId, 'finished', { status: runStatus, summary: finalSummary });

  runtimeStorage.writeJson(join(runtimeStorage.runDir(run.routine_id, runId), 'summary.json'), {
    runId,
    routineId: run.routine_id,
    routineVersion: run.routine_version,
    status: runStatus,
    summary: finalSummary,
    startedAt: started,
    finishedAt,
    durationMs,
  });

  return runStore.get(runId);
}
