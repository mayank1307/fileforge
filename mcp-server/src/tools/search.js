import { registry } from '../registry.js';
import { memoryStore } from '../stores/memoryStore.js';
import { noteStore } from '../stores/noteStore.js';
import { resultStore } from '../stores/resultStore.js';
import { makeActionTool } from '../utils/actionToolUtils.js';

function searchInData(data, query, limit = 20) {
  const hits = [];
  const needle = query.toLowerCase();
  function walk(value, path = []) {
    if (hits.length >= limit) return;
    if (typeof value === 'string') {
      const index = value.toLowerCase().indexOf(needle);
      if (index >= 0) hits.push({ path: path.join('.'), snippet: value.slice(Math.max(0, index - 80), index + needle.length + 160) });
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, [...path, index]));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => walk(item, [...path, key]));
  }
  walk(data);
  return hits;
}

async function optionalRpc(rpcClient, method, params) {
  try {
    const response = await rpcClient.send(method, params);
    return response?.ok ? response.data : { error: response?.error?.message ?? 'Unavailable' };
  } catch (err) {
    return { error: err.message };
  }
}

const actionDefs = [
  {
    name: 'fileforge_search_all',
    description: 'Search across pages, notes, history, and bookmarks.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number', default: 20 } },
      required: ['query'],
    },
    handler: async (p, { rpcClient }) => {
      const limit = p.limit ?? 20;
      const [history, bookmarks] = await Promise.all([
        optionalRpc(rpcClient, 'search.history', p),
        optionalRpc(rpcClient, 'search.bookmarks', p),
      ]);
      return {
        ok: true,
        data: {
          memory: memoryStore.search({ query: p.query, limit }),
          notes: noteStore.search({ query: p.query, limit }),
          results: resultStore.search({ query: p.query, limit }),
          history,
          bookmarks,
        },
        meta: { tool: 'fileforge_search_all' },
      };
    },
  },
  {
    name: 'fileforge_search_page',
    description: 'Search within the text of a specific page result.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, ref: { type: 'string' } },
      required: ['query'],
    },
    handler: async (p) => {
      if (p.ref) {
        const result = resultStore.get(p.ref);
        if (!result) return { ok: false, error: { code: 'NOT_FOUND', message: `No result found for ref: ${p.ref}` } };
        return { ok: true, data: { ref: p.ref, hits: searchInData(result.data, p.query, p.limit ?? 20) }, meta: { tool: 'fileforge_search_page' } };
      }
      const results = resultStore.search({ query: p.query, limit: p.limit ?? 20 });
      return { ok: true, data: { results }, meta: { tool: 'fileforge_search_page' } };
    },
  },
  {
    name: 'fileforge_search_notes',
    description: 'Search saved notes.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number', default: 20 } },
      required: ['query'],
    },
    handler: async (p) => {
      const notes = noteStore.search(p);
      return { ok: true, data: { notes }, meta: { tool: 'fileforge_search_notes' } };
    },
  },
  {
    name: 'fileforge_search_history',
    description: 'Search browser history.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number', default: 20 } },
      required: ['query'],
    },
    handler: async (p, { rpcClient }) => {
      const data = await optionalRpc(rpcClient, 'search.history', p);
      return { ok: !data.error, data, error: data.error ? { code: 'SEARCH_HISTORY_UNAVAILABLE', message: data.error } : undefined, meta: { tool: 'fileforge_search_history' } };
    },
  },
  {
    name: 'fileforge_search_bookmarks',
    description: 'Search browser bookmarks.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number', default: 20 } },
      required: ['query'],
    },
    handler: async (p, { rpcClient }) => {
      const data = await optionalRpc(rpcClient, 'search.bookmarks', p);
      return { ok: !data.error, data, error: data.error ? { code: 'SEARCH_BOOKMARKS_UNAVAILABLE', message: data.error } : undefined, meta: { tool: 'fileforge_search_bookmarks' } };
    },
  },
];

const searchCapabilities = {
  tool: 'fileforge_search_action',
  actions: {
    all: { description: 'Search across saved pages, notes, results, history, bookmarks.', params: { query: { type: 'string', required: true }, limit: { type: 'number' } }, risk: 'low', flags: { read: true }, permissions: [], produces: ['json'] },
    page: { description: 'Search within a specific stored page result.', params: { query: { type: 'string', required: true }, ref: { type: 'string' } }, risk: 'low', flags: { read: true }, permissions: [], produces: ['json'] },
    notes: { description: 'Search saved notes.', params: { query: { type: 'string', required: true } }, risk: 'low', flags: { read: true }, permissions: [], produces: ['json'] },
    history: { description: 'Search browser history.', params: { query: { type: 'string', required: true } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    bookmarks: { description: 'Search browser bookmarks.', params: { query: { type: 'string', required: true } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
  },
};

const tools = [
  makeActionTool({
    name: 'fileforge_search_action',
    description: 'Search local data by text: saved pages, stored results, notes, browser history and bookmarks. Use all to search everything, or narrow it to one source. Use fileforge_memory_action to compare page visits and fileforge_scrape_action to read a live page. History and bookmarks need the extension.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    prefix: 'fileforge_search_',
    actions: actionDefs,
    capabilities: searchCapabilities,
  }),
];

registry.registerMany(tools);
export { tools };
