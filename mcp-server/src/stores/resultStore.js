import Database from 'better-sqlite3';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { sqlStore } from './sqlStore.js';

const DATA_DIR = join(homedir(), '.fileforge');
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

let _db = null;
function db() {
  if (_db) return _db;
  _db = new Database(join(DATA_DIR, 'results.db'));
  _db.exec(`
    CREATE TABLE IF NOT EXISTS results (
      ref TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      url TEXT,
      project TEXT DEFAULT 'default',
      data TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return _db;
}

export const resultStore = {
  save({ ref, tool, url, project = 'default', data, summary }) {
    const createdAt = new Date().toISOString();
    db().prepare(`
      INSERT OR REPLACE INTO results (ref, tool, url, project, data, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ref, tool, url ?? null, project, JSON.stringify(data), summary ? JSON.stringify(summary) : null, createdAt);

    sqlStore.ingestResult({
      ref,
      tool,
      url: url ?? null,
      project,
      createdAt,
      data,
    });
  },

  get(ref) {
    const row = db().prepare('SELECT * FROM results WHERE ref = ?').get(ref);
    if (!row) return null;
    return { ...row, data: JSON.parse(row.data), summary: row.summary ? JSON.parse(row.summary) : null };
  },

  list({ project, limit = 20, offset = 0 } = {}) {
    return project
      ? db().prepare('SELECT ref, tool, url, project, summary, created_at FROM results WHERE project = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(project, limit, offset)
      : db().prepare('SELECT ref, tool, url, project, summary, created_at FROM results ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  },

  search({ query, project, limit = 20 } = {}) {
    const like = `%${query}%`;
    return project
      ? db().prepare(`
        SELECT ref, tool, url, project, summary, created_at
        FROM results
        WHERE project = ? AND (data LIKE ? OR summary LIKE ? OR url LIKE ? OR tool LIKE ?)
        ORDER BY created_at DESC
        LIMIT ?
      `).all(project, like, like, like, like, limit)
      : db().prepare(`
        SELECT ref, tool, url, project, summary, created_at
        FROM results
        WHERE data LIKE ? OR summary LIKE ? OR url LIKE ? OR tool LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(like, like, like, like, limit);
  },

  delete(ref) {
    db().prepare('DELETE FROM results WHERE ref = ?').run(ref);
    sqlStore.deleteResult(ref);
  },
};
