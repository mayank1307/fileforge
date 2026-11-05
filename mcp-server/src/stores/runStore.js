import { randomUUID } from 'crypto';
import { db } from './routineStore.js';

const RUN_JSON_COLS = ['resolved_props', 'summary', 'error'];
const STEP_JSON_COLS = ['params', 'result'];

function parseRun(row) {
  if (!row) return null;
  const out = { ...row };
  for (const col of RUN_JSON_COLS) {
    if (out[col] != null && typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]); } catch { /* keep raw */ }
    }
  }
  return out;
}

function parseStep(row) {
  if (!row) return null;
  const out = { ...row };
  for (const col of STEP_JSON_COLS) {
    if (out[col] != null && typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]); } catch { /* keep raw */ }
    }
  }
  return out;
}

export const runStore = {
  create({ runId, routineId, routineVersion, trigger = 'manual', resolvedProps = {}, idempotencyKey = null, parentRunId = null, retryOfRunId = null, priority = 0, status = 'queued' } = {}) {
    const id = runId ?? `run_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    db().prepare(`
      INSERT INTO task_runs (
        run_id, routine_id, routine_version, status, trigger, resolved_props,
        idempotency_key, parent_run_id, retry_of_run_id, priority, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, routineId, routineVersion, status, trigger, JSON.stringify(resolvedProps), idempotencyKey, parentRunId, retryOfRunId, priority, now);
    return this.get(id);
  },

  get(runId) {
    return parseRun(db().prepare('SELECT * FROM task_runs WHERE run_id = ?').get(runId));
  },

  findByIdempotency(routineId, idempotencyKey) {
    if (!idempotencyKey) return null;
    return parseRun(db().prepare('SELECT * FROM task_runs WHERE routine_id = ? AND idempotency_key = ? ORDER BY created_at DESC LIMIT 1').get(routineId, idempotencyKey));
  },

  list({ routineId, status, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    if (routineId) { conditions.push('routine_id = ?'); params.push(routineId); }
    if (status) { conditions.push('status = ?'); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db().prepare(`SELECT * FROM task_runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return rows.map(parseRun);
  },

  updateStatus(runId, status, { error = null, summary = null, startedAt = null, finishedAt = null, durationMs = null } = {}) {
    const existing = this.get(runId);
    if (!existing) return null;
    db().prepare(`
      UPDATE task_runs SET
        status = ?,
        started_at = COALESCE(?, started_at),
        finished_at = COALESCE(?, finished_at),
        duration_ms = COALESCE(?, duration_ms),
        summary = COALESCE(?, summary),
        error = COALESCE(?, error)
      WHERE run_id = ?
    `).run(
      status,
      startedAt,
      finishedAt,
      durationMs,
      summary != null ? JSON.stringify(summary) : null,
      error != null ? JSON.stringify(error) : null,
      runId,
    );
    return this.get(runId);
  },

  setResolvedProps(runId, resolvedProps) {
    db().prepare('UPDATE task_runs SET resolved_props = ? WHERE run_id = ?').run(JSON.stringify(resolvedProps), runId);
  },

  addEvent(runId, type, data = null) {
    try {
      db().prepare(`
        INSERT INTO run_events (run_id, type, data, created_at) VALUES (?, ?, ?, ?)
      `).run(runId, type, data != null ? JSON.stringify(data) : null, new Date().toISOString());
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return;
      throw err;
    }
  },

  getEvents(runId) {
    const rows = db().prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY id').all(runId);
    return rows.map((r) => ({ ...r, data: r.data ? safeParse(r.data) : null }));
  },

  createStep({ runId, stepId, stepIndex, tool, action = null, params = null, status = 'pending', outputKey = null } = {}) {
    db().prepare(`
      INSERT INTO run_steps (run_id, step_id, step_index, tool, action, params, status, output_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(runId, stepId, stepIndex, tool, action, params != null ? JSON.stringify(params) : null, status, outputKey);
  },

  updateStep(runId, stepId, patch = {}) {
    const fields = [];
    const values = [];
    const mapping = {
      status: 'status',
      attempt: 'attempt',
      result: 'result',
      params: 'params',
      action: 'action',
      startedAt: 'started_at',
      finishedAt: 'finished_at',
      durationMs: 'duration_ms',
      outputKey: 'output_key',
    };
    for (const [key, col] of Object.entries(mapping)) {
      if (patch[key] !== undefined) {
        fields.push(`${col} = ?`);
        const val = (key === 'result' || key === 'params') && patch[key] != null && typeof patch[key] !== 'string'
          ? JSON.stringify(patch[key])
          : patch[key];
        values.push(val);
      }
    }
    if (!fields.length) return;
    values.push(runId, stepId);
    db().prepare(`UPDATE run_steps SET ${fields.join(', ')} WHERE run_id = ? AND step_id = ?`).run(...values);
  },

  getSteps(runId) {
    const rows = db().prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY step_index, id').all(runId);
    return rows.map(parseStep);
  },

  getStep(runId, stepId) {
    return parseStep(db().prepare('SELECT * FROM run_steps WHERE run_id = ? AND step_id = ?').get(runId, stepId));
  },

  deleteRun(runId) {
    db().prepare('DELETE FROM task_runs WHERE run_id = ?').run(runId);
  },
};

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }
