import Database from 'better-sqlite3';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(homedir(), '.fileforge');
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

let _db = null;
function db() {
  if (_db) return _db;
  _db = new Database(join(DATA_DIR, 'notes.db'));
  _db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tags TEXT,
      url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_url ON notes(url);
  `);
  return _db;
}

function parse(row) {
  return row ? { ...row, tags: row.tags ? JSON.parse(row.tags) : [] } : null;
}

export const noteStore = {
  create({ id, title, body, tags = [], url }) {
    const now = new Date().toISOString();
    db().prepare(`
      INSERT INTO notes (id, title, body, tags, url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, body, JSON.stringify(tags), url ?? null, now, now);
    return this.get(id);
  },

  get(id) {
    return parse(db().prepare('SELECT * FROM notes WHERE id = ?').get(id));
  },

  list({ tag, limit = 20, offset = 0 } = {}) {
    const rows = tag
      ? db().prepare('SELECT * FROM notes WHERE tags LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(`%"${tag}"%`, limit, offset)
      : db().prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    return rows.map(parse);
  },

  search({ query, limit = 20 } = {}) {
    const like = `%${query}%`;
    return db().prepare(`
      SELECT * FROM notes
      WHERE title LIKE ? OR body LIKE ? OR tags LIKE ? OR url LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(like, like, like, like, limit).map(parse);
  },

  delete(id) {
    db().prepare('DELETE FROM notes WHERE id = ?').run(id);
  },
};
