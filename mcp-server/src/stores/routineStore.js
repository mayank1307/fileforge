import Database from 'better-sqlite3';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = join(homedir(), '.fileforge');
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

let _db = null;
export function db() {
  if (_db) return _db;
  _db = new Database(join(DATA_DIR, 'routines.db'));
  _db.pragma('foreign_keys = ON');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      input_type TEXT NOT NULL DEFAULT 'steps',
      prompt TEXT,
      steps TEXT NOT NULL DEFAULT '[]',
      props_schema TEXT NOT NULL DEFAULT '{}',
      default_props TEXT NOT NULL DEFAULT '{}',
      permissions TEXT NOT NULL DEFAULT '{}',
      trigger_type TEXT NOT NULL DEFAULT 'manual',
      cron_expression TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'idle',
      concurrency_policy TEXT NOT NULL DEFAULT 'skip_if_running',
      retry_policy TEXT,
      timeout_config TEXT,
      retention_policy TEXT,
      export_config TEXT,
      storage_config TEXT,
      notification_config TEXT,
      metadata TEXT,
      last_run_at TEXT,
      next_run_at TEXT,
      created_by TEXT NOT NULL DEFAULT 'user',
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      current_version INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_routines_next_run ON routines(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_routines_trigger ON routines(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_routines_enabled ON routines(enabled);

    CREATE TABLE IF NOT EXISTS routine_versions (
      routine_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      updated_by TEXT,
      reason TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (routine_id, version),
      FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_runs (
      run_id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      routine_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      resolved_props TEXT NOT NULL DEFAULT '{}',
      idempotency_key TEXT,
      parent_run_id TEXT,
      retry_of_run_id TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER,
      summary TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_runs_routine ON task_runs(routine_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_idem ON task_runs(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON task_runs(status);

    CREATE TABLE IF NOT EXISTS run_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      tool TEXT NOT NULL,
      action TEXT,
      params TEXT,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1,
      result TEXT,
      output_key TEXT,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (run_id) REFERENCES task_runs(run_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps(run_id, step_index);

    CREATE TABLE IF NOT EXISTS run_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_id TEXT,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER,
      mime TEXT,
      source_step_id TEXT,
      created_at TEXT NOT NULL,
      metadata TEXT,
      FOREIGN KEY (run_id) REFERENCES task_runs(run_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_run_artifacts_run ON run_artifacts(run_id);

    CREATE TABLE IF NOT EXISTS run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES task_runs(run_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, id);

    CREATE TABLE IF NOT EXISTS legacy_task_map (
      legacy_task_id TEXT PRIMARY KEY,
      routine_id TEXT,
      run_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legacy_routine ON legacy_task_map(routine_id);
  `);
  return _db;
}

const JSON_COLUMNS = ['steps', 'props_schema', 'default_props', 'permissions', 'retry_policy', 'timeout_config', 'retention_policy', 'export_config', 'storage_config', 'notification_config', 'metadata'];

function parseRoutine(row) {
  if (!row) return null;
  const out = { ...row };
  for (const col of JSON_COLUMNS) {
    if (out[col] != null && typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]); } catch { /* keep raw */ }
    }
  }
  out.enabled = !!out.enabled;
  return out;
}

function stringifyJsonFields(obj) {
  const out = { ...obj };
  for (const col of JSON_COLUMNS) {
    if (out[col] !== undefined && out[col] !== null && typeof out[col] !== 'string') {
      out[col] = JSON.stringify(out[col]);
    }
  }
  return out;
}

function snapshotRoutine(routine) {
  return JSON.stringify(routine);
}

export const routineStore = {
  create(input = {}) {
    const now = new Date().toISOString();
    const id = input.id ?? `routine_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const row = stringifyJsonFields({
      id,
      name: input.name ?? 'Untitled routine',
      description: input.description ?? null,
      input_type: input.inputType ?? (input.prompt ? 'prompt' : 'steps'),
      prompt: input.prompt ?? null,
      steps: input.steps ?? [],
      props_schema: input.propsSchema ?? {},
      default_props: input.defaultProps ?? {},
      permissions: input.permissions ?? {},
      trigger_type: input.triggerType ?? 'manual',
      cron_expression: input.cronExpression ?? null,
      enabled: input.enabled === false ? 0 : 1,
      status: input.status ?? 'idle',
      concurrency_policy: input.concurrencyPolicy ?? 'skip_if_running',
      retry_policy: input.retryPolicy ?? null,
      timeout_config: input.timeoutConfig ?? null,
      retention_policy: input.retentionPolicy ?? null,
      export_config: input.exportConfig ?? null,
      storage_config: input.storageConfig ?? null,
      notification_config: input.notificationConfig ?? null,
      metadata: input.metadata ?? null,
      last_run_at: null,
      next_run_at: input.nextRunAt ?? null,
      created_by: input.createdBy ?? 'user',
      updated_by: input.updatedBy ?? input.createdBy ?? 'user',
      created_at: now,
      updated_at: now,
      current_version: 1,
    });
    db().prepare(`
      INSERT INTO routines (
        id, name, description, input_type, prompt, steps, props_schema, default_props, permissions,
        trigger_type, cron_expression, enabled, status, concurrency_policy, retry_policy, timeout_config,
        retention_policy, export_config, storage_config, notification_config, metadata,
        last_run_at, next_run_at, created_by, updated_by, created_at, updated_at, current_version
      ) VALUES (
        @id, @name, @description, @input_type, @prompt, @steps, @props_schema, @default_props, @permissions,
        @trigger_type, @cron_expression, @enabled, @status, @concurrency_policy, @retry_policy, @timeout_config,
        @retention_policy, @export_config, @storage_config, @notification_config, @metadata,
        @last_run_at, @next_run_at, @created_by, @updated_by, @created_at, @updated_at, @current_version
      )
    `).run(row);
    this.saveVersion(id, 1, this.get(id), { updatedBy: row.created_by, reason: input.reason ?? 'initial create' });
    return this.get(id);
  },

  update(id, patch = {}, { updatedBy = 'user', reason = null } = {}) {
    const existing = this.get(id);
    if (!existing) return null;
    const next = { ...existing };
    const mapping = {
      name: 'name',
      description: 'description',
      inputType: 'input_type',
      prompt: 'prompt',
      steps: 'steps',
      propsSchema: 'props_schema',
      defaultProps: 'default_props',
      permissions: 'permissions',
      triggerType: 'trigger_type',
      cronExpression: 'cron_expression',
      enabled: 'enabled',
      status: 'status',
      concurrencyPolicy: 'concurrency_policy',
      retryPolicy: 'retry_policy',
      timeoutConfig: 'timeout_config',
      retentionPolicy: 'retention_policy',
      exportConfig: 'export_config',
      storageConfig: 'storage_config',
      notificationConfig: 'notification_config',
      metadata: 'metadata',
      lastRunAt: 'last_run_at',
      nextRunAt: 'next_run_at',
    };
    for (const [key, col] of Object.entries(mapping)) {
      if (patch[key] !== undefined) next[col] = patch[key];
    }
    if (typeof next.enabled === 'boolean') next.enabled = next.enabled ? 1 : 0;
    const nextVersion = existing.current_version + 1;
    next.updated_at = new Date().toISOString();
    next.updated_by = updatedBy;
    next.current_version = nextVersion;
    const stringified = stringifyJsonFields(next);
    db().prepare(`
      UPDATE routines SET
        name=@name, description=@description, input_type=@input_type, prompt=@prompt, steps=@steps,
        props_schema=@props_schema, default_props=@default_props, permissions=@permissions,
        trigger_type=@trigger_type, cron_expression=@cron_expression, enabled=@enabled, status=@status,
        concurrency_policy=@concurrency_policy, retry_policy=@retry_policy, timeout_config=@timeout_config,
        retention_policy=@retention_policy, export_config=@export_config, storage_config=@storage_config,
        notification_config=@notification_config, metadata=@metadata, last_run_at=@last_run_at,
        next_run_at=@next_run_at, updated_by=@updated_by, updated_at=@updated_at, current_version=@current_version
      WHERE id=@id
    `).run(stringified);
    const refreshed = this.get(id);
    this.saveVersion(id, nextVersion, refreshed, { updatedBy, reason });
    return refreshed;
  },

  saveVersion(routineId, version, snapshot, { updatedBy = 'user', reason = null } = {}) {
    db().prepare(`
      INSERT OR REPLACE INTO routine_versions (routine_id, version, snapshot, updated_by, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(routineId, version, snapshotRoutine(snapshot), updatedBy, reason, new Date().toISOString());
  },

  getVersion(routineId, version) {
    const row = db().prepare('SELECT * FROM routine_versions WHERE routine_id = ? AND version = ?').get(routineId, version);
    if (!row) return null;
    try { return { ...row, snapshot: JSON.parse(row.snapshot) }; } catch { return row; }
  },

  listVersions(routineId) {
    const rows = db().prepare('SELECT routine_id, version, updated_by, reason, created_at FROM routine_versions WHERE routine_id = ? ORDER BY version').all(routineId);
    return rows;
  },

  get(id) {
    const row = db().prepare('SELECT * FROM routines WHERE id = ?').get(id);
    return parseRoutine(row);
  },

  getByName(name) {
    const row = db().prepare('SELECT * FROM routines WHERE name = ? ORDER BY created_at DESC LIMIT 1').get(name);
    return parseRoutine(row);
  },

  list({ status, triggerType, enabled, limit = 100, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (triggerType) { conditions.push('trigger_type = ?'); params.push(triggerType); }
    if (enabled !== undefined) { conditions.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db().prepare(`SELECT * FROM routines ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return rows.map(parseRoutine);
  },

  delete(id) {
    return db().prepare('DELETE FROM routines WHERE id = ?').run(id).changes > 0;
  },

  findDue(now = new Date()) {
    const iso = now.toISOString();
    const rows = db().prepare(`
      SELECT * FROM routines
      WHERE enabled = 1 AND trigger_type = 'cron'
        AND cron_expression IS NOT NULL
        AND (next_run_at IS NULL OR next_run_at <= ?)
    `).all(iso);
    return rows.map(parseRoutine);
  },

  setNextRunAt(id, iso) {
    db().prepare('UPDATE routines SET next_run_at = ? WHERE id = ?').run(iso, id);
  },

  setLastRunAt(id, iso) {
    db().prepare('UPDATE routines SET last_run_at = ? WHERE id = ?').run(iso, id);
  },

  setStatus(id, status) {
    db().prepare('UPDATE routines SET status = ? WHERE id = ?').run(status, id);
  },

  setEnabled(id, enabled) {
    db().prepare('UPDATE routines SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  },

  legacyMapping: {
    set(legacyTaskId, routineId, runId) {
      db().prepare(`
        INSERT OR REPLACE INTO legacy_task_map (legacy_task_id, routine_id, run_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(legacyTaskId, routineId, runId ?? null, new Date().toISOString());
    },
    get(legacyTaskId) {
      return db().prepare('SELECT * FROM legacy_task_map WHERE legacy_task_id = ?').get(legacyTaskId) ?? null;
    },
    findByRoutine(routineId) {
      return db().prepare('SELECT * FROM legacy_task_map WHERE routine_id = ?').get(routineId) ?? null;
    },
  },
};
