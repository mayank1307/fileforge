import { routineStore } from '../stores/routineStore.js';
import { runStore } from '../stores/runStore.js';
import { runRoutine } from '../runner/routineRunner.js';

const DEFAULT_GLOBAL_LIMIT = Number(process.env.FILEFORGE_QUEUE_GLOBAL_LIMIT ?? 3);

class RunQueue {
  constructor() {
    this.pending = [];
    this.runningByRoutine = new Map();
    this.perRoutineFifos = new Map();
    this.runningCount = 0;
    this.globalLimit = DEFAULT_GLOBAL_LIMIT;
    this.registry = null;
    this.draining = false;
  }

  configure({ registry, globalLimit } = {}) {
    if (registry) this.registry = registry;
    if (globalLimit) this.globalLimit = globalLimit;
  }

  async enqueue({ routineId, trigger = 'manual', propOverrides = {}, idempotencyKey = null, priority = 0, parentRunId = null, retryOfRunId = null }) {
    const routine = routineStore.get(routineId);
    if (!routine) return { ok: false, error: { code: 'ROUTINE_NOT_FOUND', message: `No routine: ${routineId}` } };
    if (!routine.enabled) return { ok: false, error: { code: 'ROUTINE_DISABLED', message: `Routine is disabled: ${routineId}` } };

    if (idempotencyKey) {
      const existing = runStore.findByIdempotency(routineId, idempotencyKey);
      if (existing) return { ok: true, data: { runId: existing.run_id, deduped: true, status: existing.status } };
    }

    const policy = routine.concurrency_policy ?? 'skip_if_running';
    const claimed = this.runningByRoutine.has(routineId) || this.pending.some((p) => p.routineId === routineId);

    if (claimed) {
      if (policy === 'skip_if_running') {
        return { ok: true, data: { skipped: true, reason: 'already_running', routineId } };
      }
      if (policy === 'replace_running' && this.runningByRoutine.has(routineId)) {
        const handle = this.runningByRoutine.get(routineId);
        handle.abort.abort();
        runStore.addEvent(handle.runId, 'replaced', { reason: 'replace_running' });
      }
      if (policy === 'queue') {
        const fifo = this.perRoutineFifos.get(routineId) ?? [];
        fifo.push({ routineId, trigger, propOverrides, idempotencyKey, priority, parentRunId, retryOfRunId });
        this.perRoutineFifos.set(routineId, fifo);
        return { ok: true, data: { queued: true, routineId, queuedAt: fifo.length } };
      }
    }

    let priorProps = {};
    if (retryOfRunId) {
      const prior = runStore.get(retryOfRunId);
      if (prior?.resolved_props) priorProps = prior.resolved_props;
    }
    const resolvedProps = { ...(routine.default_props ?? {}), ...priorProps, ...propOverrides };
    const run = runStore.create({
      routineId,
      routineVersion: routine.current_version,
      trigger,
      resolvedProps,
      idempotencyKey,
      parentRunId,
      retryOfRunId,
      priority,
    });
    this.pending.push({ runId: run.run_id, routineId, priority });
    runStore.addEvent(run.run_id, 'queued', { trigger, priority });
    this._drain();
    return { ok: true, data: { runId: run.run_id, status: 'queued', routineId } };
  }

  cancel(runId, { reason = 'cancelled' } = {}) {
    const run = runStore.get(runId);
    if (!run) return { ok: false, error: { code: 'RUN_NOT_FOUND' } };
    const handle = this.runningByRoutine.get(run.routine_id);
    if (handle && handle.runId === runId) {
      handle.abort.abort();
      runStore.addEvent(runId, 'cancel_requested', { reason });
      return { ok: true, data: { runId, status: 'cancel_requested' } };
    }
    const idx = this.pending.findIndex((p) => p.runId === runId);
    if (idx >= 0) {
      this.pending.splice(idx, 1);
      runStore.updateStatus(runId, 'cancelled', { finishedAt: new Date().toISOString() });
      runStore.addEvent(runId, 'cancelled', { reason: 'cancelled_before_start' });
      return { ok: true, data: { runId, status: 'cancelled' } };
    }
    return { ok: false, error: { code: 'RUN_NOT_QUEUED_OR_RUNNING', message: `Run ${runId} is not active.` } };
  }

  status() {
    return {
      pending: this.pending.length,
      running: this.runningCount,
      globalLimit: this.globalLimit,
      runningRoutines: Array.from(this.runningByRoutine.keys()),
      queuedRoutines: Array.from(this.perRoutineFifos.keys()),
    };
  }

  _drain() {
    if (this.draining) return;
    this.draining = true;
    setImmediate(() => this._drainSync().finally(() => { this.draining = false; }));
  }

  async _drainSync() {
    while (this.runningCount < this.globalLimit && this.pending.length) {
      this.pending.sort((a, b) => b.priority - a.priority);
      const next = this.pending.find((p) => !this.runningByRoutine.has(p.routineId));
      if (!next) break;
      this.pending = this.pending.filter((p) => p.runId !== next.runId);
      this._startRun(next.runId, next.routineId);
    }
  }

  _startRun(runId, routineId) {
    if (!this.registry) {
      runStore.updateStatus(runId, 'failed', { error: { code: 'NO_REGISTRY', message: 'runQueue has no registry configured' }, finishedAt: new Date().toISOString() });
      return;
    }
    const abort = new AbortController();
    this.runningByRoutine.set(routineId, { runId, abort });
    this.runningCount += 1;
    runRoutine({ runId, registry: this.registry, abortSignal: abort.signal })
      .catch((err) => {
        runStore.updateStatus(runId, 'failed', { error: { code: 'RUNNER_CRASH', message: err.message, stack: err.stack }, finishedAt: new Date().toISOString() });
        runStore.addEvent(runId, 'runner_crash', { message: err.message });
      })
      .finally(() => {
        this.runningCount -= 1;
        this.runningByRoutine.delete(routineId);
        const fifo = this.perRoutineFifos.get(routineId);
        if (fifo && fifo.length) {
          const next = fifo.shift();
          if (!fifo.length) this.perRoutineFifos.delete(routineId);
          this.enqueue(next);
        } else {
          this._drain();
        }
      });
  }
}

export const runQueue = new RunQueue();
