import { registry } from '../registry.js';
import { noteStore } from '../stores/noteStore.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { makeRef } from '../utils/resultUtils.js';

const actionDefs = [
  {
    name: 'fileforge_note_create',
    description: 'Create a local note.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        url: { type: 'string', description: 'Associated URL, if any' },
      },
      required: ['title', 'body'],
    },
    handler: async (p) => {
      const note = noteStore.create({ id: makeRef('note'), ...p });
      return { ok: true, data: { note }, meta: { tool: 'fileforge_note_create' } };
    },
  },
  {
    name: 'fileforge_note_list',
    description: 'List saved notes.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string' },
        limit: { type: 'number', default: 20 },
        offset: { type: 'number', default: 0 },
      },
    },
    handler: async (p) => {
      const notes = noteStore.list(p);
      return { ok: true, data: { notes }, meta: { tool: 'fileforge_note_list' } };
    },
  },
  {
    name: 'fileforge_note_search',
    description: 'Search notes by text.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number', default: 20 } },
      required: ['query'],
    },
    handler: async (p) => {
      const notes = noteStore.search(p);
      return { ok: true, data: { notes }, meta: { tool: 'fileforge_note_search' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_note_action',
    description: 'Keep local notes: create, list and search them. Use this to save findings across sessions. Use fileforge_memory_action to save page content and fileforge_report_action for shareable evidence. Notes stay in ~/.fileforge, and there\'s no update or delete action.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    prefix: 'fileforge_note_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
