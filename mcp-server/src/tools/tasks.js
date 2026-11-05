import { registry } from '../registry.js';
import { recipeStore } from '../stores/recipeStore.js';
import { taskStore } from '../stores/taskStore.js';
import { writeExportFile } from '../utils/exportUtils.js';
import { makeRef } from '../utils/resultUtils.js';
import { normalizeUrl } from '../utils/urlUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { datedPayload, formatDDMMYYYY } from '../utils/dateUtils.js';
import { routineActionDefs } from './routineActions.js';

function dataOf(response) {
  return response?.data ?? response;
}

function normalizeTaskActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.map((step, index) => {
    const tool = step?.tool ?? step?.mcpTool;
    if (!tool || typeof tool !== 'string') throw new Error(`actions[${index}].tool is required`);
    const params = step.params ?? step.arguments ?? {};
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error(`actions[${index}].params must be an object`);
    return {
      name: step.name ?? `${tool}:${params.action ?? index + 1}`,
      tool,
      params,
      required: step.required !== false,
    };
  });
}

function taskTitleFromParams(params, actions = []) {
  return params.title
    ?? params.description
    ?? params.task
    ?? (actions.length ? `${actions.length} FileForge action${actions.length === 1 ? '' : 's'}` : 'FileForge task');
}

function taskLog(taskId, message, data = {}) {
  const payload = datedPayload(message, data);
  taskStore.addEvent(taskId, 'status_update', payload);
  console.error(`[fileforge ${payload.date}] ${taskId}: ${message}`);
  return payload;
}

async function runSavedRecipeTask(rpcClient, params, taskId) {
  const recipe = params.recipe;
  if (recipe?.name && Array.isArray(recipe.steps)) {
    recipeStore.save({ name: recipe.name, steps: recipe.steps, assertions: recipe.assertions });
    taskLog(taskId, 'Recipe saved', { recipeName: recipe.name });
  }

  const recipeName = params.recipeName ?? recipe?.name;
  if (!recipeName) throw new Error('recipeName is required for recipe tasks');

  taskLog(taskId, 'Task initialized', { recipeName });
  const workflow = await registry.call('fileforge_workflow_action', {
    action: 'run_recipe',
    name: recipeName,
    assertions: params.assertions ?? recipe?.assertions,
    store: params.store ?? true,
  }, { rpcClient });
  taskLog(taskId, 'Browser recipe completed', { recipeName, ok: workflow?.ok, workflowRef: workflow?.ref });
  return { recipeName, workflow };
}

async function runActionPlanTask(rpcClient, params, taskId) {
  const actions = normalizeTaskActions(params.actions);
  if (!actions.length) throw new Error('actions must include at least one FileForge tool invocation');

  taskLog(taskId, 'Task initialized', { actionCount: actions.length });
  const outputs = [];

  for (let index = 0; index < actions.length; index += 1) {
    const step = actions[index];
    taskLog(taskId, 'Invoking action', {
      index: index + 1,
      name: step.name,
      tool: step.tool,
      action: step.params?.action,
    });

    const response = await registry.call(step.tool, step.params, { rpcClient });
    outputs.push({
      index: index + 1,
      name: step.name,
      tool: step.tool,
      params: step.params,
      response,
    });

    if (response?.ok === false && step.required !== false) {
      return {
        status: 'failed',
        date: formatDDMMYYYY(),
        actionCount: actions.length,
        completedActions: outputs.length,
        failedAction: outputs.at(-1),
        outputs,
      };
    }
  }

  return {
    status: 'completed',
    date: formatDDMMYYYY(),
    actionCount: actions.length,
    completedActions: outputs.length,
    outputs,
  };
}

async function runTaskPrimitive(rpcClient, params, taskId) {
  if (Array.isArray(params.actions)) {
    return runActionPlanTask(rpcClient, params, taskId);
  }

  if (params.recipeName || params.recipe) {
    return runSavedRecipeTask(rpcClient, params, taskId);
  }

  if (params.url) {
    taskLog(taskId, 'Awaiting page load', { url: params.url });
    const opened = await rpcClient.send('browser.navigate', { url: params.url, active: false, newTab: true });
    if (!opened?.ok) return opened;
    const tabId = String(opened.data.id);
    try {
      await rpcClient.send('browser.wait', { tabId, until: 'load' }).catch(() => null);
      taskLog(taskId, 'Extracting data', { tabId });
      return dataOf(await rpcClient.send('scrape.page', { tabId, sections: params.capture }));
    } finally {
      await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
    }
  }
  return { note: 'Task recorded, but no URL or concrete collector primitive was provided.' };
}

function startBackgroundTask(taskId, params, { rpcClient }) {
  setTimeout(async () => {
    try {
      const result = await runTaskPrimitive(rpcClient, params, taskId);
      const finalStatus = result?.status === 'failed' ? 'failed' : 'completed';
      taskStore.addEvent(taskId, finalStatus, datedPayload(finalStatus === 'failed' ? 'Task failed cleanly' : 'Task completed', { result }));
      taskStore.updateStatus(taskId, finalStatus, result);
    } catch (err) {
      const failure = datedPayload('Task failed', { message: err.message });
      taskStore.addEvent(taskId, 'failed', failure);
      taskStore.updateStatus(taskId, 'failed', failure);
      console.error(`[fileforge ${failure.date}] ${taskId}: ${err.message}`);
    }
  }, 0);
}

const actionDefs = [
  {
    name: 'fileforge_task_start',
    description: 'Start an asynchronous task made of structured FileForge tool invocations.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Saved task id to run.' },
        title: { type: 'string', description: 'Optional label for an inline action task.' },
        actions: {
          type: 'array',
          description: 'Ordered FileForge tool invocations: [{ tool, params, name?, required? }].',
          items: { type: 'object' },
        },
        task: { type: 'string', description: 'Legacy label alias. Do not use as a prompt.' },
        description: { type: 'string', description: 'Legacy label alias. Do not use as a prompt.' },
        url: { type: 'string', description: 'Optional starting URL' },
        mode: { type: 'string', enum: ['interactive', 'collector', 'monitor'], default: 'interactive' },
        maxMinutes: { type: 'number', default: 10 },
        outputs: { type: 'array', items: { type: 'object' } },
        export: { type: 'array', items: { type: 'string' } },
        capture: { type: 'array', items: { type: 'string' } },
        recipeName: { type: 'string', description: 'Saved workflow recipe to run asynchronously.' },
        recipe: { type: 'object', description: 'Inline workflow recipe to save and run asynchronously.' },
        pollIntervalMs: { type: 'number', default: 15000 },
        timeoutMs: { type: 'number', default: 180000 },
        store: { type: 'boolean', default: true },
      },
      required: [],
    },
    handler: async (p, { rpcClient }) => {
      let taskId = p.taskId;
      let runParams = p;
      if (taskId) {
        const existing = taskStore.get(taskId);
        if (!existing) return { ok: false, error: { code: 'NOT_FOUND', message: `No task found: ${taskId}` } };
        runParams = { ...p, title: p.title ?? existing.description, actions: p.actions ?? existing.actions };
        taskStore.update(taskId, { status: 'running', result: null });
      } else {
        const actions = normalizeTaskActions(p.actions);
        taskId = makeRef('task');
        taskStore.create({ taskId, title: taskTitleFromParams(p, actions), actions, mode: p.mode ?? 'interactive', status: 'running' });
        runParams = { ...p, actions };
      }
      taskStore.addEvent(taskId, 'started', datedPayload('Task initialized', { params: p }));
      startBackgroundTask(taskId, runParams, { rpcClient });
      return {
        ok: true,
        data: {
          taskId,
          status: 'running',
          date: formatDDMMYYYY(),
          message: 'Task initialized',
        },
        meta: { tool: 'fileforge_task_start' },
      };
    },
  },
  {
    name: 'fileforge_task_add',
    description: 'Add a saved task made of structured FileForge tool invocations.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Optional explicit task id.' },
        title: { type: 'string', description: 'Task label.' },
        task: { type: 'string', description: 'Legacy label alias. Do not use as a prompt.' },
        description: { type: 'string', description: 'Legacy label alias. Do not use as a prompt.' },
        actions: {
          type: 'array',
          description: 'Ordered FileForge tool invocations: [{ tool, params, name?, required? }].',
          items: { type: 'object' },
        },
        mode: { type: 'string', enum: ['interactive', 'collector', 'monitor'], default: 'interactive' },
        status: { type: 'string', enum: ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'], default: 'pending' },
        result: { type: 'object' },
      },
      required: ['actions'],
    },
    handler: async (p) => {
      const actions = normalizeTaskActions(p.actions);
      if (!actions.length) throw new Error('actions must include at least one FileForge tool invocation');
      const title = taskTitleFromParams(p, actions);
      const taskId = p.taskId ?? makeRef('task');
      taskStore.create({ taskId, title, actions, mode: p.mode ?? 'interactive', status: p.status ?? 'pending', result: p.result });
      taskStore.addEvent(taskId, 'added', datedPayload('Task added', { taskId, title, actionCount: actions.length }));
      return { ok: true, data: { date: formatDDMMYYYY(), task: taskStore.get(taskId) }, meta: { tool: 'fileforge_task_add' } };
    },
  },
  {
    name: 'fileforge_task_edit',
    description: 'Edit a saved task record.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        title: { type: 'string', description: 'Task label.' },
        task: { type: 'string', description: 'Legacy label alias. Do not use as a prompt.' },
        description: { type: 'string', description: 'Legacy label alias. Do not use as a prompt.' },
        actions: {
          type: 'array',
          description: 'Ordered FileForge tool invocations: [{ tool, params, name?, required? }].',
          items: { type: 'object' },
        },
        mode: { type: 'string', enum: ['interactive', 'collector', 'monitor'] },
        status: { type: 'string', enum: ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'] },
        result: { type: 'object' },
      },
      required: ['taskId'],
    },
    handler: async (p) => {
      const actions = p.actions === undefined ? undefined : normalizeTaskActions(p.actions);
      const task = taskStore.update(p.taskId, {
        title: p.title,
        description: p.description ?? p.task,
        actions,
        mode: p.mode,
        status: p.status,
        result: p.result,
      });
      if (!task) return { ok: false, error: { code: 'NOT_FOUND', message: `No task found: ${p.taskId}` } };
      taskStore.addEvent(p.taskId, 'edited', datedPayload('Task edited', { taskId: p.taskId, actionCount: task.actions?.length ?? 0 }));
      return { ok: true, data: { date: formatDDMMYYYY(), task }, meta: { tool: 'fileforge_task_edit' } };
    },
  },
  {
    name: 'fileforge_task_status',
    description: 'Get the current status of a running task.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
    },
    handler: async (p) => {
      const task = taskStore.get(p.taskId);
      return task
        ? { ok: true, data: { date: formatDDMMYYYY(), task }, meta: { tool: 'fileforge_task_status' } }
        : { ok: false, error: { code: 'NOT_FOUND', message: `No task found: ${p.taskId}` } };
    },
  },
  {
    name: 'fileforge_task_events',
    description: 'Get progress events for a task.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' }, since: { type: 'string', description: 'ISO timestamp to get events after' } },
      required: ['taskId'],
    },
    handler: async (p) => {
      return { ok: true, data: { events: taskStore.getEvents(p.taskId, p.since) }, meta: { tool: 'fileforge_task_events' } };
    },
  },
  {
    name: 'fileforge_task_pause',
    description: 'Pause a running task.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
    handler: async (p) => {
      taskStore.updateStatus(p.taskId, 'paused');
      taskStore.addEvent(p.taskId, 'paused', datedPayload('Task paused'));
      return { ok: true, data: { taskId: p.taskId, status: 'paused' }, meta: { tool: 'fileforge_task_pause' } };
    },
  },
  {
    name: 'fileforge_task_resume',
    description: 'Resume a paused task.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
    handler: async (p) => {
      taskStore.updateStatus(p.taskId, 'running');
      taskStore.addEvent(p.taskId, 'resumed', datedPayload('Task resumed'));
      return { ok: true, data: { taskId: p.taskId, status: 'running' }, meta: { tool: 'fileforge_task_resume' } };
    },
  },
  {
    name: 'fileforge_task_cancel',
    description: 'Cancel a running task.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
    handler: async (p) => {
      taskStore.updateStatus(p.taskId, 'cancelled');
      taskStore.addEvent(p.taskId, 'cancelled', datedPayload('Task cancelled'));
      return { ok: true, data: { taskId: p.taskId, status: 'cancelled' }, meta: { tool: 'fileforge_task_cancel' } };
    },
  },
  {
    name: 'fileforge_task_list',
    description: 'List all tasks (running, paused, completed).',
    inputSchema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'all'], default: 'all' } },
    },
    handler: async (p) => {
      return { ok: true, data: { date: formatDDMMYYYY(), tasks: taskStore.list(p.status) }, meta: { tool: 'fileforge_task_list' } };
    },
  },
  {
    name: 'fileforge_task_delete',
    description: 'Delete a task and its event history.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
    },
    handler: async (p) => {
      const deleted = taskStore.delete(p.taskId);
      if (!deleted) return { ok: false, error: { code: 'NOT_FOUND', message: `No task found: ${p.taskId}` } };
      return { ok: true, data: { date: formatDDMMYYYY(), deleted: p.taskId }, meta: { tool: 'fileforge_task_delete' } };
    },
  },
  {
    name: 'fileforge_task_export',
    description: 'Export task results and artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        format: { type: 'string', enum: ['json', 'csv', 'zip'], default: 'json' },
      },
      required: ['taskId'],
    },
    handler: async (p) => {
      const task = taskStore.get(p.taskId);
      if (!task) return { ok: false, error: { code: 'NOT_FOUND', message: `No task found: ${p.taskId}` } };
      const events = taskStore.getEvents(p.taskId);
      const filename = writeExportFile({
        filename: `${p.taskId}.${p.format === 'csv' ? 'csv' : 'json'}`,
        defaultName: `${p.taskId}.json`,
        contents: JSON.stringify({ task, events }, null, 2),
      });
      return { ok: true, data: { filename, format: p.format ?? 'json' }, meta: { tool: 'fileforge_task_export' } };
    },
  },
  {
    name: 'fileforge_task_monitor_page',
    description: 'Monitor a page for changes over time.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        intervalMinutes: { type: 'number', default: 5 },
        maxMinutes: { type: 'number', default: 60 },
        watch: { type: 'array', items: { type: 'string' }, description: 'Selectors or data types to watch' },
        store: { type: 'boolean', default: true },
      },
      required: ['url'],
    },
    handler: async (p, { rpcClient }) => {
      return actionDefs[0].handler({ task: `Monitor ${p.url}`, mode: 'monitor', url: p.url, maxMinutes: p.maxMinutes, capture: p.watch, store: p.store }, { rpcClient });
    },
  },
  {
    name: 'fileforge_task_collect_table',
    description: 'Collect rows from a paginated table into a local dataset.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        selector: { type: 'string', description: 'CSS selector for the table' },
        maxPages: { type: 'number', default: 10 },
        store: { type: 'boolean', default: true },
      },
      required: ['url'],
    },
    handler: async (p, { rpcClient }) => {
      const opened = await rpcClient.send('browser.navigate', { url: p.url, active: false, newTab: true });
      if (!opened?.ok) return opened;
      const tabId = String(opened.data.id);
      try {
        await rpcClient.send('browser.wait', { tabId, until: 'load' }).catch(() => null);
        const table = await rpcClient.send('scrape.page', { tabId, sections: ['tables'] });
        return { ok: true, data: { url: p.url, tables: table.data?.tables ?? [] }, meta: { tool: 'fileforge_task_collect_table' } };
      } finally {
        await rpcClient.send('browser.closeTab', { tabId }).catch(() => null);
      }
    },
  },
  {
    name: 'fileforge_task_collect_search_results',
    description: 'Run a search on a website and collect all results into a dataset.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        query: { type: 'string' },
        maxPages: { type: 'number', default: 5 },
        store: { type: 'boolean', default: true },
      },
      required: ['url', 'query'],
    },
    handler: async (p, { rpcClient }) => {
      const url = new URL(normalizeUrl(p.url));
      url.searchParams.set('q', p.query);
      const data = await rpcClient.send('scrape.urls', { urls: [url.toString()], sections: ['metadata', 'links'] });
      return { ok: true, data: data.data ?? data, meta: { tool: 'fileforge_task_collect_search_results' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_task_action',
    description: 'Create, run, schedule, plan, inspect, validate, dry-run, and export FileForge routines (and legacy task pipelines).',
    prefix: 'fileforge_task_',
    actions: [...actionDefs, ...routineActionDefs],
  }),
];

registry.registerMany(tools);
export { tools };
