import Database from 'better-sqlite3';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

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

    CREATE TABLE IF NOT EXISTS scrape_pages (
      ref TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      url TEXT,
      title TEXT,
      project TEXT DEFAULT 'default',
      tab_id INTEGER,
      link_count INTEGER DEFAULT 0,
      page_link_count INTEGER DEFAULT 0,
      table_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scrape_links (
      ref TEXT NOT NULL,
      kind TEXT NOT NULL,
      link_index INTEGER NOT NULL,
      url TEXT,
      project TEXT DEFAULT 'default',
      text TEXT,
      href TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (ref, kind, link_index)
    );

    CREATE TABLE IF NOT EXISTS scrape_tables (
      ref TEXT NOT NULL,
      table_index INTEGER NOT NULL,
      tool TEXT NOT NULL,
      url TEXT,
      project TEXT DEFAULT 'default',
      caption TEXT,
      selector TEXT,
      column_count INTEGER DEFAULT 0,
      row_count INTEGER DEFAULT 0,
      headers_json TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (ref, table_index)
    );

    CREATE TABLE IF NOT EXISTS scrape_table_rows (
      ref TEXT NOT NULL,
      table_index INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      url TEXT,
      project TEXT DEFAULT 'default',
      row_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (ref, table_index, row_index)
    );
  `);
  return _db;
}

function insertRowsInternal(table, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => '?').join(', ');
  const stmt = db().prepare(`INSERT OR REPLACE INTO "${table}" (${cols.join(', ')}) VALUES (${placeholders})`);
  for (const row of rows) stmt.run(...cols.map((c) => row[c]));
}

function stringify(value) {
  return value == null ? null : JSON.stringify(value);
}

function normalizeLinkRows(ref, url, project, createdAt, links, kind) {
  if (!Array.isArray(links)) return [];
  return links.map((link, index) => ({
    ref,
    kind,
    link_index: index,
    url: url ?? null,
    project,
    text: link?.text ?? link?.label ?? null,
    href: link?.href ?? link?.url ?? null,
    created_at: createdAt,
  }));
}

function normalizeTableRows(ref, tool, url, project, createdAt, tables) {
  if (!Array.isArray(tables)) return { tables: [], rows: [] };

  const tableRows = [];
  const rowRows = [];

  for (const table of tables) {
    const tableIndex = Number(table?.index ?? tableRows.length);
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    tableRows.push({
      ref,
      table_index: tableIndex,
      tool,
      url: url ?? null,
      project,
      caption: table?.caption ?? null,
      selector: table?.selector ?? null,
      column_count: Number(table?.columnCount ?? table?.headers?.length ?? 0),
      row_count: Number(table?.rowCount ?? rows.length ?? 0),
      headers_json: stringify(table?.headers ?? []),
      created_at: createdAt,
    });

    rows.forEach((row, rowIndex) => {
      rowRows.push({
        ref,
        table_index: tableIndex,
        row_index: rowIndex,
        url: url ?? null,
        project,
        row_json: stringify(row ?? {}),
        created_at: createdAt,
      });
    });
  }

  return { tables: tableRows, rows: rowRows };
}

export const sqlStore = {
  query(sql, params = []) {
    return db().prepare(sql).all(...params);
  },

  listTables() {
    return db().prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all().map((r) => r.name);
  },

  describeTable(table) {
    return db().prepare(`PRAGMA table_info("${table}")`).all();
  },

  exec(sql) {
    db().exec(sql);
  },

  insertRows(table, rows) {
    db().exec('BEGIN');
    try {
      insertRowsInternal(table, rows);
      db().exec('COMMIT');
    } catch (err) {
      db().exec('ROLLBACK');
      throw err;
    }
  },

  ingestResult({ ref, tool, url, project = 'default', createdAt, data }) {
    const created_at = createdAt ?? new Date().toISOString();
    const pageRow = {
      ref,
      tool,
      url: url ?? data?.url ?? null,
      title: data?.title ?? data?.metadata?.title ?? null,
      project,
      tab_id: data?.tabId ?? null,
      link_count: Array.isArray(data?.links) ? data.links.length : 0,
      page_link_count: Array.isArray(data?.pageLinks) ? data.pageLinks.length : 0,
      table_count: Array.isArray(data?.tables) ? data.tables.length : 0,
      created_at,
    };
    const links = normalizeLinkRows(ref, pageRow.url, project, created_at, data?.links, 'links');
    const pageLinks = normalizeLinkRows(ref, pageRow.url, project, created_at, data?.pageLinks, 'pageLinks');
    const { tables, rows } = normalizeTableRows(ref, tool, pageRow.url, project, created_at, data?.tables);

    db().exec('BEGIN');
    try {
      db().prepare('DELETE FROM scrape_pages WHERE ref = ?').run(ref);
      db().prepare('DELETE FROM scrape_links WHERE ref = ?').run(ref);
      db().prepare('DELETE FROM scrape_tables WHERE ref = ?').run(ref);
      db().prepare('DELETE FROM scrape_table_rows WHERE ref = ?').run(ref);

      if (pageRow.url || pageRow.title || pageRow.link_count || pageRow.page_link_count || pageRow.table_count) {
        db().prepare(`
          INSERT INTO scrape_pages (
            ref, tool, url, title, project, tab_id, link_count, page_link_count, table_count, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          pageRow.ref,
          pageRow.tool,
          pageRow.url,
          pageRow.title,
          pageRow.project,
          pageRow.tab_id,
          pageRow.link_count,
          pageRow.page_link_count,
          pageRow.table_count,
          pageRow.created_at
        );
      }

      insertRowsInternal('scrape_links', [...links, ...pageLinks]);
      insertRowsInternal('scrape_tables', tables);
      insertRowsInternal('scrape_table_rows', rows);
      db().exec('COMMIT');
    } catch (err) {
      db().exec('ROLLBACK');
      throw err;
    }
  },

  deleteResult(ref) {
    db().exec('BEGIN');
    try {
      db().prepare('DELETE FROM scrape_pages WHERE ref = ?').run(ref);
      db().prepare('DELETE FROM scrape_links WHERE ref = ?').run(ref);
      db().prepare('DELETE FROM scrape_tables WHERE ref = ?').run(ref);
      db().prepare('DELETE FROM scrape_table_rows WHERE ref = ?').run(ref);
      db().exec('COMMIT');
    } catch (err) {
      db().exec('ROLLBACK');
      throw err;
    }
  },
};
