import test from 'node:test';
import assert from 'node:assert/strict';
import { resultStore } from './resultStore.js';
import { sqlStore } from './sqlStore.js';

function makeRef(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test('stored scrape results are queryable from the results SQL table', () => {
  const ref = makeRef('sql_results');

  try {
    resultStore.save({
      ref,
      tool: 'fileforge_scrape_action_page',
      url: 'https://example.com/',
      project: 'sql-test',
      data: {
        url: 'https://example.com/',
        title: 'Example Domain',
        links: [{ href: 'https://www.iana.org/domains/example', text: 'More information...' }],
      },
      summary: { title: 'Example Domain' },
    });

    const rows = sqlStore.query('SELECT ref, url, project FROM results WHERE ref = ?', [ref]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ref, ref);
    assert.equal(rows[0].project, 'sql-test');

    const tables = sqlStore.listTables();
    assert(tables.includes('results'));
    assert(tables.includes('scrape_pages'));
  } finally {
    resultStore.delete(ref);
  }
});

test('extract_tables results are materialized into scrape tables', () => {
  const ref = makeRef('sql_tables');

  try {
    resultStore.save({
      ref,
      tool: 'fileforge_scrape_action_tables',
      url: 'https://www.iana.org/domains/reserved',
      project: 'sql-test',
      data: {
        url: 'https://www.iana.org/domains/reserved',
        title: 'IANA-managed Reserved Domains',
        tables: [
          {
            index: 0,
            caption: 'Reserved domains',
            selector: '#arpa-table',
            columnCount: 2,
            rowCount: 2,
            headers: ['Domain', 'Notes'],
            rows: [
              { Domain: 'example', Notes: 'documentation' },
              { Domain: 'invalid', Notes: 'testing' },
            ],
          },
        ],
      },
      summary: { tables: 1 },
    });

    const tableRows = sqlStore.query(
      'SELECT ref, table_index, row_count FROM scrape_tables WHERE ref = ?',
      [ref]
    );
    const dataRows = sqlStore.query(
      'SELECT row_index, row_json FROM scrape_table_rows WHERE ref = ? ORDER BY row_index',
      [ref]
    );

    assert.equal(tableRows.length, 1);
    assert.equal(tableRows[0].row_count, 2);
    assert.equal(dataRows.length, 2);
    assert.match(dataRows[0].row_json, /example/);
  } finally {
    resultStore.delete(ref);
  }
});
