import Database from 'better-sqlite3';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(homedir(), '.fileforge');
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

let _db = null;
function db() {
  if (_db) return _db;
  _db = new Database(join(DATA_DIR, 'recipes.db'));
  _db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      name TEXT PRIMARY KEY,
      steps TEXT NOT NULL,
      assertions TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const columns = db().prepare('PRAGMA table_info(recipes)').all().map((column) => column.name);
  if (!columns.includes('assertions')) db().exec('ALTER TABLE recipes ADD COLUMN assertions TEXT');
  return _db;
}

export const recipeStore = {
  save({ name, steps, assertions = [] }) {
    const now = new Date().toISOString();
    const existing = db().prepare('SELECT created_at FROM recipes WHERE name = ?').get(name);
    db().prepare(`
      INSERT OR REPLACE INTO recipes (name, steps, assertions, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    `).run(name, JSON.stringify(steps), JSON.stringify(assertions ?? []), existing?.created_at ?? now, now);
  },

  get(name) {
    const row = db().prepare('SELECT * FROM recipes WHERE name = ?').get(name);
    return row ? { ...row, steps: JSON.parse(row.steps), assertions: row.assertions ? JSON.parse(row.assertions) : [] } : null;
  },

  list() {
    return db().prepare('SELECT name, created_at, updated_at FROM recipes ORDER BY updated_at DESC').all();
  },

  delete(name) {
    db().prepare('DELETE FROM recipes WHERE name = ?').run(name);
  },
};
