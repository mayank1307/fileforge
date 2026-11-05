import { registry } from '../registry.js';
import { resultStore } from '../stores/resultStore.js';
import { sqlStore } from '../stores/sqlStore.js';
import { createZipBuffer, formatRows, writeExportFile } from '../utils/exportUtils.js';
import { collectIssuesFromData } from '../utils/issueUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';

const FORMATS = ['json', 'csv', 'markdown', 'html', 'har', 'sqlite', 'zip', 'postman', 'msw'];

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

function formatResult(result, format = 'json') {
  if (format === 'markdown') {
    return `# ${result.ref}\n\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\`\n`;
  }
  if (format === 'html') {
    return `<!doctype html><meta charset="utf-8"><title>${result.ref}</title><pre>${JSON.stringify(result.data, null, 2)}</pre>`;
  }
  return JSON.stringify(result, null, 2);
}

function formatResultBundle(result) {
  const issues = collectIssuesFromData(result.data);
  return createZipBuffer([
    { name: 'result.json', contents: JSON.stringify(result, null, 2) },
    { name: 'summary.json', contents: JSON.stringify(result.summary ?? {}, null, 2) },
    { name: 'issues.json', contents: JSON.stringify(issues, null, 2) },
  ]);
}

const actionDefs = [
  {
    name: 'fileforge_export_result',
    description: 'Export a stored result ref to a file.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        format: { type: 'string', enum: FORMATS, default: 'json' },
        filename: { type: 'string' },
      },
      required: ['ref'],
    },
    handler: async (p) => {
      const result = resultStore.get(p.ref);
      if (!result) return { ok: false, error: { code: 'NOT_FOUND', message: `No result found for ref: ${p.ref}` } };
      const format = p.format ?? 'json';
      if (!['json', 'markdown', 'html', 'har', 'postman', 'msw', 'zip'].includes(format)) {
        return { ok: false, error: { code: 'UNSUPPORTED_FORMAT', message: `Export format is not supported yet: ${format}` } };
      }
      const ext = format === 'markdown' ? 'md' : format;
      const filename = writeExportFile({
        filename: p.filename,
        defaultName: `${p.ref}.${ext}`,
        contents: format === 'zip' ? formatResultBundle(result) : formatResult(result, format),
      });
      return { ok: true, data: { filename, format, issues: collectIssuesFromData(result.data).length }, meta: { tool: 'fileforge_export_result' } };
    },
  },
  {
    name: 'fileforge_export_query',
    description: 'Run a SQL query and export results to a file.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        format: { type: 'string', enum: ['json', 'csv', 'markdown', 'sqlite'], default: 'csv' },
        filename: { type: 'string' },
      },
      required: ['query'],
    },
    handler: async (p) => {
      const format = p.format ?? 'csv';
      if (!['json', 'csv', 'markdown'].includes(format)) {
        return { ok: false, error: { code: 'UNSUPPORTED_FORMAT', message: `Export format is not supported yet: ${format}` } };
      }
      const rows = sqlStore.query(normalizeSelectQuery(p.query));
      const ext = format === 'markdown' ? 'md' : format;
      const filename = writeExportFile({
        filename: p.filename,
        defaultName: `query-${Date.now()}.${ext}`,
        contents: formatRows(rows, format),
      });
      return { ok: true, data: { filename, rows: rows.length, format }, meta: { tool: 'fileforge_export_query' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_export_action',
    description: 'Write stored results or SQL query output to a file in formats such as CSV, JSON, Markdown, HAR or ZIP. Use this to hand data to another tool. Use fileforge_result_action or fileforge_sql_action to read data without creating a file. Writes only to FileForge\'s exports folder, and a filename you reuse replaces that file.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    prefix: 'fileforge_export_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
