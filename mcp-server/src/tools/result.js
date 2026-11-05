import { registry } from '../registry.js';
import { resultStore } from '../stores/resultStore.js';
import { makeActionTool } from '../utils/actionToolUtils.js';

function sliceResultData(data, offset = 0, limit = 100) {
  if (Array.isArray(data)) return data.slice(offset, offset + limit);
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        return { key, items: value.slice(offset, offset + limit), total: value.length };
      }
    }
  }
  return data;
}

const actionDefs = [
  {
    name: 'fileforge_result_get',
    description: 'Retrieve a stored result by its ref.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'The result ref (e.g. scrape_page_20260509_abc123)' },
      },
      required: ['ref'],
    },
    handler: async ({ ref }) => {
      const result = resultStore.get(ref);
      if (!result) return { ok: false, error: { code: 'NOT_FOUND', message: `No result with ref: ${ref}` }, meta: { tool: 'fileforge_result_get' } };
      return { ok: true, data: result, meta: { tool: 'fileforge_result_get', url: result.url } };
    },
  },
  {
    name: 'fileforge_result_list',
    description: 'List stored results, newest first. Optionally filter by project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Filter by project name.' },
        limit: { type: 'number', default: 20 },
        offset: { type: 'number', default: 0 },
      },
    },
    handler: async ({ project, limit = 20, offset = 0 } = {}) => {
      const rows = resultStore.list({ project, limit, offset });
      return { ok: true, data: { results: rows, count: rows.length }, meta: { tool: 'fileforge_result_list' } };
    },
  },
  {
    name: 'fileforge_result_search',
    description: 'Search stored results by keyword across URL, tool name, and data.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        project: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
      required: ['query'],
    },
    handler: async ({ query, project, limit = 20 }) => {
      const rows = resultStore.search({ query, project, limit });
      return { ok: true, data: { results: rows, count: rows.length }, meta: { tool: 'fileforge_result_search' } };
    },
  },
  {
    name: 'fileforge_result_slice',
    description: 'Get a paginated slice of a stored result.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        offset: { type: 'number', default: 0 },
        limit: { type: 'number', default: 100 },
      },
      required: ['ref'],
    },
    handler: async (p) => {
      const result = resultStore.get(p.ref);
      if (!result) return { ok: false, error: { code: 'NOT_FOUND', message: `No result found for ref: ${p.ref}` } };
      const offset = Math.max(0, Number(p.offset ?? 0));
      const limit = Math.max(1, Math.min(Number(p.limit ?? 100), 1000));
      return { ok: true, data: { ref: p.ref, offset, limit, data: sliceResultData(result.data, offset, limit) }, meta: { tool: 'fileforge_result_slice' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_result_action',
    description: 'Retrieve, list, search, and slice stored FileForge results.',
    prefix: 'fileforge_result_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
