import { registry } from '../registry.js';
import { sqlStore } from '../stores/sqlStore.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { formatRows, writeExportFile } from '../utils/exportUtils.js';

function normalizeSelectQuery(query) {
  const sql = query.trim().replace(/;+\s*$/, '');
  if (!/^(select|with)\b/i.test(sql)) {
    throw new Error('Only SELECT queries are allowed.');
  }
  if (sql.includes(';')) {
    throw new Error('Multiple SQL statements are not allowed.');
  }
  return sql;
}

const actionDefs = [
  {
    name: 'fileforge_sql_list_tables',
    description: 'List all available SQL tables.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const tables = sqlStore.listTables();
      return { ok: true, data: { tables }, meta: { tool: 'fileforge_sql_list_tables' } };
    },
  },
  {
    name: 'fileforge_sql_describe_table',
    description: 'Describe the columns and schema of a table.',
    inputSchema: {
      type: 'object',
      properties: { table: { type: 'string' } },
      required: ['table'],
    },
    handler: async (p) => {
      const columns = sqlStore.describeTable(p.table);
      return { ok: true, data: { table: p.table, columns }, meta: { tool: 'fileforge_sql_describe_table' } };
    },
  },
  {
    name: 'fileforge_sql_query',
    description: 'Run a SQL SELECT query against stored data.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL SELECT statement' },
        ref: { type: 'string', description: 'Optional result ref to scope the query' },
        limit: { type: 'number', default: 100 },
        offset: { type: 'number', default: 0 },
      },
      required: ['query'],
    },
    handler: async (p) => {
      const sql = normalizeSelectQuery(p.query);
      const limit = Math.max(1, Math.min(Number(p.limit ?? 100), 1000));
      const offset = Math.max(0, Number(p.offset ?? 0));
      const rows = sqlStore.query(`SELECT * FROM (${sql}) LIMIT ? OFFSET ?`, [limit, offset]);
      return { ok: true, data: { rows, limit, offset }, meta: { tool: 'fileforge_sql_query' } };
    },
  },
  {
    name: 'fileforge_sql_export_query',
    description: 'Run a SQL query and export the results to a file.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        format: { type: 'string', enum: ['csv', 'json', 'markdown'], default: 'csv' },
        filename: { type: 'string' },
      },
      required: ['query'],
    },
    handler: async (p) => {
      const sql = normalizeSelectQuery(p.query);
      const rows = sqlStore.query(sql);
      const format = p.format ?? 'csv';
      const ext = format === 'markdown' ? 'md' : format;
      const filename = writeExportFile({
        filename: p.filename,
        defaultName: `query-${Date.now()}.${ext}`,
        contents: formatRows(rows, format),
      });
      return { ok: true, data: { filename, rows: rows.length, format }, meta: { tool: 'fileforge_sql_export_query' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_sql_action',
    description: 'List, describe, query, and export SQL-backed FileForge data.',
    prefix: 'fileforge_sql_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
