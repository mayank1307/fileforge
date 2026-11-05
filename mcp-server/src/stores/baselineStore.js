import Database from 'better-sqlite3';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(homedir(), '.fileforge');
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

let _db = null;
function db() {
  if (_db) return _db;
  _db = new Database(join(DATA_DIR, 'baselines.db'));
  _db.exec(`
    CREATE TABLE IF NOT EXISTS baselines (
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      viewport TEXT NOT NULL DEFAULT 'desktop',
      path TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (name, viewport)
    );
  `);
  const columns = _db.prepare('PRAGMA table_info(baselines)').all().map((column) => column.name);
  if (!columns.includes('data')) _db.exec('ALTER TABLE baselines ADD COLUMN data TEXT');
  return _db;
}

export const baselineStore = {
  save({ name, url, viewport = 'desktop', path, data }) {
    db().prepare(`
      INSERT OR REPLACE INTO baselines (name, url, viewport, path, data, created_at) VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, url, viewport, path, data ? JSON.stringify(data) : null, new Date().toISOString());
  },

  get(name, viewport = 'desktop') {
    const row = db().prepare('SELECT * FROM baselines WHERE name = ? AND viewport = ?').get(name, viewport);
    return row ? { ...row, data: row.data ? JSON.parse(row.data) : null } : null;
  },

  list() {
    return db().prepare('SELECT * FROM baselines ORDER BY created_at DESC').all().map((row) => ({
      ...row,
      data: row.data ? JSON.parse(row.data) : null,
    }));
  },

  delete(name, viewport) {
    viewport
      ? db().prepare('DELETE FROM baselines WHERE name = ? AND viewport = ?').run(name, viewport)
      : db().prepare('DELETE FROM baselines WHERE name = ?').run(name);
  },
};
