import { routineStore } from '../stores/routineStore.js';
import { runStore } from '../stores/runStore.js';
import { runArtifactStore } from '../stores/runArtifactStore.js';
import { runQueue } from '../queue/runQueue.js';
import { capabilityCatalog } from '../planner/capabilityCatalog.js';
import { validatePlan } from '../planner/planValidator.js';
import { dryRunRoutine } from '../planner/dryRun.js';
import { buildPlanningPrompt } from '../planner/promptBuilder.js';
import { validateCronExpression, nextRunAt } from '../utils/cronExpr.js';
import { writeExportJson, writeExportCsv } from '../utils/runExporters/index.js';

function meta(tool) { return { tool: 'fileforge_task_action', subAction: tool }; }
function ok(data, tool) { return { ok: true, data, meta: meta(tool) }; }
function err(code, message, details, tool) { return { ok: false, error: { code, message, details }, meta: meta(tool) }; }

function ensureRoutine(routineId, tool) {
  const r = routineStore.get(routineId);
  if (!r) return { error: err('ROUTINE_NOT_FOUND', `No routine found: ${routineId}`, {}, tool) };
  return { routine: r };
}

function normalizeCron(triggerType, cronExpression) {
  if (triggerType !== 'cron') return { ok: true };
  if (!cronExpression) return { ok: false, error: err('INVALID_CRON', 'cronExpression required when triggerType is cron', {}, 'create') };
  const valid = validateCronExpression(cronExpression);
  if (!valid.ok) return { ok: false, error: err('INVALID_CRON', valid.message, {}, 'create') };
  return { ok: true };
}

export const routineActionDefs = [
  {
    name: 'fileforge_task_create',
    action: 'create',
    description: 'Create a routine (prompt or steps input).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        inputType: { type: 'string', enum: ['prompt', 'steps'] },
        prompt: { type: 'string' },
        steps: { type: 'array', items: { type: 'object' } },
        propsSchema: { type: 'object' },
        defaultProps: { type: 'object' },
        permissions: { type: 'object' },
        triggerType: { type: 'string', enum: ['manual', 'cron', 'event'] },
        cronExpression: { type: 'string' },
        enabled: { type: 'boolean' },
        concurrencyPolicy: { type: 'string', enum: ['allow', 'skip_if_running', 'queue', 'replace_running'] },
        retryPolicy: { type: 'object' },
        timeoutConfig: { type: 'object' },
        retentionPolicy: { type: 'object' },
        exportConfig: { type: 'object' },
        storageConfig: { type: 'object' },
        notificationConfig: { type: 'object' },
        metadata: { type: 'object' },
        createdBy: { type: 'string', enum: ['user', 'mcp', 'system'] },
        reason: { type: 'string' },
      },
      required: ['name'],
    },
    handler: async (p) => {
      const inputType = p.inputType ?? (p.steps?.length ? 'steps' : (p.prompt ? 'prompt' : 'steps'));
      if (inputType === 'steps' && (!Array.isArray(p.steps) || p.steps.length === 0)) {
        return err('INVALID_INPUT', 'inputType "steps" requires non-empty steps array.', {}, 'create');
      }
      if (inputType === 'prompt' && !p.prompt) {
        return err('INVALID_INPUT', 'inputType "prompt" requires a prompt.', {}, 'create');
      }
      const cron = normalizeCron(p.triggerType, p.cronExpression);
      if (!cron.ok) return cron.error;

      if (Array.isArray(p.steps) && p.steps.length) {
        const v = validatePlan({ steps: p.steps, propsSchema: p.propsSchema ?? {}, defaultProps: p.defaultProps ?? {}, permissions: p.permissions ?? {} });
        if (!v.ok) return err('INVALID_PLAN', 'Plan validation failed.', { errors: v.errors, warnings: v.warnings }, 'create');
      }

      const next = p.triggerType === 'cron' && p.cronExpression
        ? nextRunAt(p.cronExpression).toISOString()
        : null;
      const routine = routineStore.create({ ...p, inputType, nextRunAt: next });
      return ok({ routine }, 'create');
    },
  },
  {
    name: 'fileforge_task_update',
    action: 'update',
    description: 'Update a routine (snapshots a new version).',
    inputSchema: {
      type: 'object',
      properties: {
        routineId: { type: 'string' },
        patch: { type: 'object' },
        reason: { type: 'string' },
        updatedBy: { type: 'string', enum: ['user', 'mcp', 'system'] },
      },
      required: ['routineId', 'patch'],
    },
    handler: async (p) => {
      const { routine, error } = ensureRoutine(p.routineId, 'update');
      if (error) return error;
      const patch = p.patch ?? {};
      if (patch.steps) {
        const propsSchema = patch.propsSchema ?? routine.props_schema;
        const defaultProps = patch.defaultProps ?? routine.default_props;
        const permissions = patch.permissions ?? routine.permissions;
        const v = validatePlan({ steps: patch.steps, propsSchema, defaultProps, permissions });
        if (!v.ok) return err('INVALID_PLAN', 'Plan validation failed.', { errors: v.errors, warnings: v.warnings }, 'update');
      }
      if (patch.cronExpression || patch.triggerType) {
        const triggerType = patch.triggerType ?? routine.trigger_type;
        const cronExpression = patch.cronExpression ?? routine.cron_expression;
        const cron = normalizeCron(triggerType, cronExpression);
        if (!cron.ok) return cron.error;
        if (triggerType === 'cron' && cronExpression) patch.nextRunAt = nextRunAt(cronExpression).toISOString();
        else if (triggerType !== 'cron') patch.nextRunAt = null;
      }
      const updated = routineStore.update(p.routineId, patch, { updatedBy: p.updatedBy ?? 'user', reason: p.reason });
      return ok({ routine: updated }, 'update');
    },
  },
  {
    name: 'fileforge_task_get',
    action: 'get',
    description: 'Fetch a routine (optionally a specific version).',
    inputSchema: {
      type: 'object',
      properties: {
        routineId: { type: 'string' },
        version: { type: 'number' },
      },
      required: ['routineId'],
    },
    handler: async (p) => {
      if (p.version) {
        const v = routineStore.getVersion(p.routineId, p.version);
        if (!v) return err('NOT_FOUND', `No version ${p.version} for ${p.routineId}`, {}, 'get');
        return ok({ routine: v.snapshot, version: v.version }, 'get');
      }
      const { routine, error } = ensureRoutine(p.routineId, 'get');
      if (error) return error;
      const versions = routineStore.listVersions(p.routineId);
      return ok({ routine, versions }, 'get');
    },
  },
  {
    name: 'fileforge_task_duplicate',
    action: 'duplicate',
    description: 'Duplicate an existing routine.',
    inputSchema: {
      type: 'object',
      properties: { routineId: { type: 'string' }, name: { type: 'string' } },
      required: ['routineId'],
    },
    handler: async (p) => {
      const { routine, error } = ensureRoutine(p.routineId, 'duplicate');
      if (error) return error;
      const copy = routineStore.create({
        name: p.name ?? `${routine.name} (copy)`,
        description: routine.description,
        inputType: routine.input_type,
        prompt: routine.prompt,
        steps: routine.steps,
        propsSchema: routine.props_schema,
        defaultProps: routine.default_props,
        permissions: routine.permissions,
        triggerType: 'manual',
        concurrencyPolicy: routine.concurrency_policy,
        retryPolicy: routine.retry_policy,
        timeoutConfig: routine.timeout_config,
        retentionPolicy: routine.retention_policy,
        exportConfig: routine.export_config,
        storageConfig: routine.storage_config,
        notificationConfig: routine.notification_config,
        metadata: routine.metadata,
        createdBy: 'user',
        reason: `duplicated from ${routine.id}`,
      });
      return ok({ routine: copy }, 'duplicate');
    },
  },
  {
    name: 'fileforge_task_enable',
    action: 'enable',
    description: 'Enable a routine.',
    inputSchema: { type: 'object', properties: { routineId: { type: 'string' } }, required: ['routineId'] },
    handler: async (p) => {
      const { routine, error } = ensureRoutine(p.routineId, 'enable');
      if (error) return error;
      routineStore.setEnabled(p.routineId, true);
      return ok({ routineId: p.routineId, enabled: true }, 'enable');
    },
  },
  {
    name: 'fileforge_task_disable',
    action: 'disable',
    description: 'Disable a routine.',
    inputSchema: { type: 'object', properties: { routineId: { type: 'string' } }, required: ['routineId'] },
    handler: async (p) => {
      const { routine, error } = ensureRoutine(p.routineId, 'disable');
      if (error) return error;
      routineStore.setEnabled(p.routineId, false);
      return ok({ routineId: p.routineId, enabled: false }, 'disable');
    },
  },
  {
    name: 'fileforge_task_validate',
    action: 'validate',
    description: 'Validate a routine or an arbitrary step array against the tool catalog.',
    inputSchema: {
      type: 'object',
      properties: {
        routineId: { type: 'string' },
        steps: { type: 'array', items: { type: 'object' } },
        propsSchema: { type: 'object' },
        defaultProps: { type: 'object' },
        permissions: { type: 'object' },
      },
      required: [],
    },
    handler: async (p) => {
      let steps = p.steps;
      let propsSchema = p.propsSchema ?? {};
      let defaultProps = p.defaultProps ?? {};
      let permissions = p.permissions ?? {};
      if (p.routineId) {
        const { routine, error } = ensureRoutine(p.routineId, 'validate');
        if (error) return error;
        steps = steps ?? routine.steps;
        propsSchema = p.propsSchema ?? routine.props_schema;
        defaultProps = p.defaultProps ?? routine.default_props;
        permissions = p.permissions ?? routine.permissions;
      }
      if (!Array.isArray(steps)) return err('INVALID_INPUT', 'Provide routineId or steps array.', {}, 'validate');
      const v = validatePlan({ steps, propsSchema, defaultProps, permissions });
      return ok(v, 'validate');
    },
  },
  {
    name: 'fileforge_task_dry_run',
    action: 'dry_run',
    description: 'Produce a dry-run report for a routine without executing anything.',
    inputSchema: {
      type: 'object',
      properties: {
        routineId: { type: 'string' },
        propOverrides: { type: 'object' },
        simulateMissing: { type: 'boolean', default: false },
      },
      required: ['routineId'],
    },
    handler: async (p) => {
      const { routine, error } = ensureRoutine(p.routineId, 'dry_run');
      if (error) return error;
      const report = dryRunRoutine(routine, { propOverrides: p.propOverrides ?? {}, simulateMissing: !!p.simulateMissing });
      return ok(report, 'dry_run');
    },
  },
  {
    name: 'fileforge_task_run',
    action: 'run',
    description: 'Enqueue a routine for execution.',
    inputSchema: {
      type: 'object',
      properties: {
        routineId: { type: 'string' },
        propOverrides: { type: 'object' },
        idempotencyKey: { type: 'string' },
        priority: { type: 'number', default: 0 },
        trigger: { type: 'string', enum: ['manual', 'cron', 'event', 'mcp'], default: 'manual' },
        retryOfRunId: { type: 'string' },
        parentRunId: { type: 'string' },
      },
      required: ['routineId'],
    },
    handler: async (p) => {
      const result = await runQueue.enqueue({
        routineId: p.routineId,
        trigger: p.trigger ?? 'manual',
        propOverrides: p.propOverrides ?? {},
        idempotencyKey: p.idempotencyKey ?? null,
        priority: p.priority ?? 0,
        parentRunId: p.parentRunId ?? null,
        retryOfRunId: p.retryOfRunId ?? null,
      });
      if (!result.ok) return { ...result, meta: meta('run') };
      return { ...result, meta: meta('run') };
    },
  },
  {
    name: 'fileforge_task_stop',
    action: 'stop',
    description: 'Stop / cancel a running or queued run.',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string' }, reason: { type: 'string' } },
      required: ['runId'],
    },
    handler: async (p) => {
      const result = runQueue.cancel(p.runId, { reason: p.reason ?? 'cancelled' });
      return { ...result, meta: meta('stop') };
    },
  },
  {
    name: 'fileforge_task_get_runs',
    action: 'get_runs',
    description: 'List runs for a routine.',
    inputSchema: {
      type: 'object',
      properties: {
        routineId: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number', default: 50 },
        offset: { type: 'number', default: 0 },
      },
      required: ['routineId'],
    },
    handler: async (p) => {
      const runs = runStore.list({ routineId: p.routineId, status: p.status, limit: p.limit ?? 50, offset: p.offset ?? 0 });
      return ok({ routineId: p.routineId, runs }, 'get_runs');
    },
  },
  {
    name: 'fileforge_task_get_run_details',
    action: 'get_run_details',
    description: 'Get full details of a run (steps + events + artifacts).',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        includeStepResults: { type: 'boolean', default: true },
        includeEvents: { type: 'boolean', default: true },
      },
      required: ['runId'],
    },
    handler: async (p) => {
      const run = runStore.get(p.runId);
      if (!run) return err('NOT_FOUND', `No run: ${p.runId}`, {}, 'get_run_details');
      const steps = runStore.getSteps(p.runId);
      const events = p.includeEvents !== false ? runStore.getEvents(p.runId) : [];
      const artifacts = runArtifactStore.list({ runId: p.runId });
      return ok({ run, steps, events, artifacts }, 'get_run_details');
    },
  },
  {
    name: 'fileforge_task_export_run',
    action: 'export_run',
    description: 'Export a run as JSON or CSV.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
        includeRaw: { type: 'boolean', default: true },
        includeLogs: { type: 'boolean', default: true },
        includeSummary: { type: 'boolean', default: true },
      },
      required: ['runId'],
    },
    handler: async (p) => {
      const run = runStore.get(p.runId);
      if (!run) return err('NOT_FOUND', `No run: ${p.runId}`, {}, 'export_run');
      const steps = runStore.getSteps(p.runId);
      const events = p.includeLogs !== false ? runStore.getEvents(p.runId) : [];
      const artifacts = runArtifactStore.list({ runId: p.runId });
      const payload = { run, steps, events, artifacts };
      if (!p.includeRaw) {
        for (const s of payload.steps) delete s.result;
      }
      if (!p.includeSummary) delete payload.run.summary;
      const format = p.format ?? 'json';
      const path = format === 'csv'
        ? writeExportCsv({ runId: p.runId, routineId: run.routine_id, payload })
        : writeExportJson({ runId: p.runId, routineId: run.routine_id, payload });
      return ok({ runId: p.runId, format, path }, 'export_run');
    },
  },
  {
    name: 'fileforge_task_get_tool_registry',
    action: 'get_tool_registry',
    description: 'Return the FileForge tool capability catalog.',
    inputSchema: {
      type: 'object',
      properties: {
        filterPermissions: { type: 'object', description: 'Only return actions whose required permissions are all granted in this map.' },
      },
    },
    handler: async (p) => {
      const catalog = capabilityCatalog.get();
      let flat = catalog.flatActions;
      if (p.filterPermissions) flat = capabilityCatalog.filterByPermissions(p.filterPermissions);
      return ok({
        tools: Object.keys(catalog.tools),
        actions: flat,
        permissionKeys: capabilityCatalog.permissionKeys(),
      }, 'get_tool_registry');
    },
  },
  {
    name: 'fileforge_task_plan_from_prompt',
    action: 'plan_from_prompt',
    description: 'Return planning context (registry slice + schema + planning prompt) for an LLM to use when converting a prompt into an executable step array.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        propsSchema: { type: 'object' },
        permissions: { type: 'object' },
        hints: { type: 'array', items: { type: 'string' } },
      },
      required: ['prompt'],
    },
    handler: async (p) => {
      const context = buildPlanningPrompt({
        prompt: p.prompt,
        propsSchema: p.propsSchema ?? {},
        permissions: p.permissions ?? {},
        hints: p.hints ?? [],
      });
      return ok(context, 'plan_from_prompt');
    },
  },
  {
    name: 'fileforge_task_commit_plan',
    action: 'commit_plan',
    description: 'Validate an LLM-produced step array and save it as a routine (new or updated).',
    inputSchema: {
      type: 'object',
      properties: {
        routineId: { type: 'string' },
        plannedSteps: { type: 'array', items: { type: 'object' } },
        propsSchema: { type: 'object' },
        defaultProps: { type: 'object' },
        permissions: { type: 'object' },
        name: { type: 'string' },
        description: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['plannedSteps'],
    },
    handler: async (p) => {
      if (!Array.isArray(p.plannedSteps) || p.plannedSteps.length === 0) {
        return err('INVALID_INPUT', 'plannedSteps must be a non-empty array.', {}, 'commit_plan');
      }
      const v = validatePlan({
        steps: p.plannedSteps,
        propsSchema: p.propsSchema ?? {},
        defaultProps: p.defaultProps ?? {},
        permissions: p.permissions ?? {},
      });
      if (!v.ok) return err('INVALID_PLAN', 'Plan validation failed.', { errors: v.errors, warnings: v.warnings }, 'commit_plan');
      if (p.routineId) {
        const updated = routineStore.update(p.routineId, {
          steps: p.plannedSteps,
          inputType: 'steps',
          propsSchema: p.propsSchema,
          defaultProps: p.defaultProps,
          permissions: p.permissions,
          name: p.name,
          description: p.description,
        }, { updatedBy: 'mcp', reason: p.reason ?? 'commit_plan' });
        if (!updated) return err('ROUTINE_NOT_FOUND', `No routine: ${p.routineId}`, {}, 'commit_plan');
        return ok({ routine: updated }, 'commit_plan');
      }
      const created = routineStore.create({
        name: p.name ?? 'Planned routine',
        description: p.description,
        inputType: 'steps',
        steps: p.plannedSteps,
        propsSchema: p.propsSchema ?? {},
        defaultProps: p.defaultProps ?? {},
        permissions: p.permissions ?? {},
        createdBy: 'mcp',
        reason: p.reason ?? 'commit_plan',
      });
      return ok({ routine: created }, 'commit_plan');
    },
  },
];
