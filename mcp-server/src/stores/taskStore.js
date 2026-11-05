import Database from 'better-sqlite3';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(homedir(), '.fileforge');
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

let _db = null;
function db() {
  if (_db) return _db;
  _db = new Database(join(DATA_DIR, 'tasks.db'));
  _db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      mode TEXT DEFAULT 'interactive',
      actions TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      result TEXT
    );
    CREATE TABLE IF NOT EXISTS task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(task_id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
  `);
  const columns = db().prepare('PRAGMA table_info(tasks)').all().map((column) => column.name);
  if (!columns.includes('actions')) db().exec('ALTER TABLE tasks ADD COLUMN actions TEXT');
  return _db;
}

function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    actions: row.actions ? JSON.parse(row.actions) : [],
    result: row.result ? JSON.parse(row.result) : null,
  };
}

export const taskStore = {
  create({ taskId, title, description, actions = [], mode = 'interactive', status = 'running', result = null }) {
    const now = new Date().toISOString();
    const label = title ?? description ?? (actions.length ? `${actions.length} FileForge action${actions.length === 1 ? '' : 's'}` : 'Untitled task');
    db().prepare(`
      INSERT INTO tasks (task_id, description, status, mode, actions, created_at, updated_at, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(taskId, label, status, mode, JSON.stringify(actions ?? []), now, now, result ? JSON.stringify(result) : null);
  },

  updateStatus(taskId, status, result = null) {
    db().prepare(`
      UPDATE tasks SET status = ?, updated_at = ?, result = ? WHERE task_id = ?
    `).run(status, new Date().toISOString(), result ? JSON.stringify(result) : null, taskId);
  },

  update(taskId, { title, description, actions, mode, status, result } = {}) {
    const existing = this.get(taskId);
    if (!existing) return null;
    const next = {
      description: title ?? description ?? existing.description,
      actions: actions ?? existing.actions ?? [],
      mode: mode ?? existing.mode,
      status: status ?? existing.status,
      result: result === undefined ? existing.result : result,
    };
    db().prepare(`
      UPDATE tasks SET description = ?, actions = ?, mode = ?, status = ?, updated_at = ?, result = ? WHERE task_id = ?
    `).run(next.description, JSON.stringify(next.actions), next.mode, next.status, new Date().toISOString(), next.result ? JSON.stringify(next.result) : null, taskId);
    return this.get(taskId);
  },

  get(taskId) {
    const row = db().prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId);
    return parseRow(row);
  },

  list(status) {
    const rows = status && status !== 'all'
      ? db().prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC').all(status)
      : db().prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
    return rows.map(parseRow);
  },

  delete(taskId) {
    db().prepare('DELETE FROM task_events WHERE task_id = ?').run(taskId);
    const result = db().prepare('DELETE FROM tasks WHERE task_id = ?').run(taskId);
    return result.changes > 0;
  },

  addEvent(taskId, type, data = null) {
    db().prepare(`
      INSERT INTO task_events (task_id, type, data, created_at) VALUES (?, ?, ?, ?)
    `).run(taskId, type, data ? JSON.stringify(data) : null, new Date().toISOString());
  },

  getEvents(taskId, since = null) {
    const rows = since
      ? db().prepare('SELECT * FROM task_events WHERE task_id = ? AND created_at > ? ORDER BY id').all(taskId, since)
      : db().prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY id').all(taskId);
    return rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null }));
  },
};
