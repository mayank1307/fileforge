import Database from 'better-sqlite3';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(homedir(), '.fileforge');
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

let _db = null;
function db() {
  if (_db) return _db;
  _db = new Database(join(DATA_DIR, 'memory.db'));
  _db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      project TEXT DEFAULT 'default',
      saved_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pages_url ON pages(url);
    CREATE INDEX IF NOT EXISTS idx_pages_project ON pages(project);
  `);
  return _db;
}

export const memoryStore = {
  savePage({ url, title, text, project = 'default' }) {
    db().prepare(`
      INSERT INTO pages (url, title, text, project, saved_at) VALUES (?, ?, ?, ?, ?)
    `).run(url, title ?? null, text, project, new Date().toISOString());
  },

  findByUrl(url) {
    return db().prepare('SELECT * FROM pages WHERE url = ? ORDER BY saved_at DESC LIMIT 1').get(url);
  },

  search({ query, project, limit = 10 }) {
    const like = `%${query}%`;
    return project
      ? db().prepare('SELECT * FROM pages WHERE project = ? AND (text LIKE ? OR title LIKE ?) ORDER BY saved_at DESC LIMIT ?').all(project, like, like, limit)
      : db().prepare('SELECT * FROM pages WHERE text LIKE ? OR title LIKE ? ORDER BY saved_at DESC LIMIT ?').all(like, like, limit);
  },
};
