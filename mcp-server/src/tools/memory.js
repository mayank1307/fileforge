import { registry } from '../registry.js';
import { memoryStore } from '../stores/memoryStore.js';
import { resultStore } from '../stores/resultStore.js';
import { compactText, maybeStoreResult, sliceData, summarizeData } from '../utils/resultUtils.js';

function unwrap(response) {
  if (!response?.ok) return response;
  return response.data ?? response;
}

function diffText(previous, current) {
  const prevLines = new Set(String(previous ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const currentLines = String(current ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const added = currentLines.filter((line) => !prevLines.has(line)).slice(0, 100);
  return { added, addedCount: added.length };
}

const tools = [
  {
    name: 'fileforge_memory_action',
    actions: [
      { action: 'save_page', description: "Save the text of a tab's page to local memory.", required: [] },
      { action: 'query', description: 'Search saved pages by keyword.', required: ['query'] },
      { action: 'semantic_search', description: 'Run the same keyword search as query. Embeddings are not configured.', required: ['query'] },
      { action: 'answer', description: "Return saved pages relevant to a question as evidence. It doesn't write an answer.", required: ['question'] },
      { action: 'find_previous_visit', description: 'Find the saved copy of a URL.', required: ['url'] },
      { action: 'diff_page', description: "Compare a tab's text with a stored result (ref) or the page's saved copy. Stores the diff by default.", required: [] },
      { action: 'compact_result', description: 'Summarize a stored result.', required: ['ref'] },
      { action: 'get_result_slice', description: 'Read part of a stored result using offset and limit.', required: ['ref'] },
    ],
    description: 'Remember pages over time: save a page, find earlier visits, diff it against a previous visit, and search saved pages or pull evidence for a question. Use this to see what changed on a page. Use fileforge_result_action to read tool results and fileforge_search_action to search history. Data stays in ~/.fileforge. save_page and diff_page need the extension.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'save_page', 'query', 'semantic_search', 'answer', 
            'find_previous_visit', 'diff_page', 'compact_result', 
            'get_result_slice'
          ],
        },
        tabId: { type: 'string', default: 'active' },
        project: { type: 'string', default: 'default' },
        query: { type: 'string' },
        question: { type: 'string' },
        url: { type: 'string' },
        limit: { type: 'number', default: 10 },
        ref: { type: 'string' },
        offset: { type: 'number', default: 0 },
        store: { type: 'boolean', default: true },
      },
      required: ['action']
    },
    handler: async (p, { rpcClient }) => {
      switch (p.action) {
        case 'save_page': {
          const route = unwrap(await rpcClient.send('app.getRouteInfo', p));
          const page = unwrap(await rpcClient.send('page.getText', p));
          if (route?.ok === false || page?.ok === false) return route?.ok === false ? route : page;
          memoryStore.savePage({
            url: route.route?.href ?? route.url,
            title: route.route?.title,
            text: page.text ?? '',
            project: p.project ?? 'default',
          });
          return {
            ok: true,
            data: { url: route.route?.href, title: route.route?.title, textLength: (page.text ?? '').length },
            meta: { tool: 'fileforge_memory_action', action: p.action },
          };
        }
        case 'query': {
          if (!p.query) throw new Error('query is required for query action');
          const pages = memoryStore.search(p).map((page) => ({ ...page, text: compactText(page.text) }));
          return { ok: true, data: { pages }, meta: { tool: 'fileforge_memory_action', action: p.action } };
        }
        case 'semantic_search': {
          if (!p.query) throw new Error('query is required for semantic_search action');
          const pages = memoryStore.search(p).map((page) => ({ ...page, text: compactText(page.text), score: 'lexical' }));
          return {
            ok: true,
            data: { pages, warning: 'Semantic embeddings are not configured yet; using local lexical search.' },
            meta: { tool: 'fileforge_memory_action', action: p.action },
          };
        }
        case 'answer': {
          if (!p.question) throw new Error('question is required for answer action');
          const pages = memoryStore.search({ query: p.question, project: p.project, limit: 5 })
            .map((page) => ({ url: page.url, title: page.title, snippet: compactText(page.text, 500), saved_at: page.saved_at }));
          return {
            ok: true,
            data: { question: p.question, evidence: pages, answer: pages.length ? 'Relevant local memory entries are included as evidence.' : 'No local memory entries matched.' },
            meta: { tool: 'fileforge_memory_action', action: p.action },
          };
        }
        case 'find_previous_visit': {
          if (!p.url) throw new Error('url is required for find_previous_visit action');
          const page = memoryStore.findByUrl(p.url);
          return page
            ? { ok: true, data: { page: { ...page, text: compactText(page.text) } }, meta: { tool: 'fileforge_memory_action', action: p.action } }
            : { ok: false, error: { code: 'NOT_FOUND', message: `No previous memory for URL: ${p.url}` }, meta: { tool: 'fileforge_memory_action', action: p.action } };
        }
        case 'diff_page': {
          const route = unwrap(await rpcClient.send('app.getRouteInfo', p));
          const page = unwrap(await rpcClient.send('page.getText', p));
          const previous = p.ref ? resultStore.get(p.ref)?.data : memoryStore.findByUrl(route.route?.href);
          if (!previous) return { ok: false, error: { code: 'NOT_FOUND', message: 'No previous result or memory page found to diff.' } };
          const previousText = previous.text ?? JSON.stringify(previous);
          const data = { url: route.route?.href, ...diffText(previousText, page.text ?? '') };
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'memory_diff', tool: 'fileforge_memory_action_diff', url: route.route?.href, data });
          return { ok: true, ...stored, meta: { tool: 'fileforge_memory_action', action: p.action } };
        }
        case 'compact_result': {
          if (!p.ref) throw new Error('ref is required for compact_result action');
          const result = resultStore.get(p.ref);
          if (!result) return { ok: false, error: { code: 'NOT_FOUND', message: `No result found for ref: ${p.ref}` } };
          const summary = summarizeData(result.data);
          return { ok: true, data: { ref: p.ref, summary }, meta: { tool: 'fileforge_memory_action', action: p.action } };
        }
        case 'get_result_slice': {
          if (!p.ref) throw new Error('ref is required for get_result_slice action');
          const result = resultStore.get(p.ref);
          if (!result) return { ok: false, error: { code: 'NOT_FOUND', message: `No result found for ref: ${p.ref}` } };
          return {
            ok: true,
            data: { ref: p.ref, offset: p.offset ?? 0, limit: p.limit ?? 100, ...sliceData(result.data, p.offset ?? 0, p.limit ?? 100) },
            meta: { tool: 'fileforge_memory_action', action: p.action },
          };
        }
        default:
          throw new Error(`Unknown action: ${p.action}`);
      }
    },
  },
];

registry.registerMany(tools);
export { tools };
