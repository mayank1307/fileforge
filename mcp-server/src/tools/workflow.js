import { registry } from '../registry.js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { recipeStore } from '../stores/recipeStore.js';
import { writeExportFile } from '../utils/exportUtils.js';
import { saveResult } from '../utils/resultUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { isSensitiveUrl, REDACTED_TAB_VALUE } from '../utils/privacyUtils.js';

const recordings = new Map();

function dataOf(response) {
  return response?.data ?? response;
}

function stepTabId(step, context) {
  return step.tabId ?? context.tabId ?? 'active';
}

async function runStep(rpcClient, step, context = {}) {
  const tabId = stepTabId(step, context);
  switch (step.action) {
    case 'open': {
      const result = dataOf(await rpcClient.send('browser.navigate', { url: step.url, active: step.active ?? false, newTab: step.newTab ?? true }));
      const id = result?.id ?? result?.tabId;
      if (id !== undefined && id !== null) context.tabId = String(id);
      return result;
    }
    case 'wait':
      return dataOf(await rpcClient.send('browser.wait', { tabId, until: 'load', timeoutMs: step.timeoutMs ?? 15000 }));
    case 'wait_for_selector':
      return dataOf(await rpcClient.send('page.waitForSelector', { tabId, selector: step.selector, timeoutMs: step.timeoutMs ?? 15000 }));
    case 'click':
      return dataOf(await rpcClient.send('page.click', { tabId, selector: step.selector }));
    case 'fill':
      return dataOf(await rpcClient.send('page.fill', { tabId, selector: step.selector, value: step.value }));
    case 'get_text':
      return dataOf(await rpcClient.send('page.getText', { tabId }));
    case 'dom_snapshot':
      return dataOf(await rpcClient.send('page.getDomSnapshot', { tabId, depth: step.depth ?? 10 }));
    case 'scrape':
      return dataOf(await rpcClient.send('scrape.page', { tabId, sections: step.sections }));
    case 'screenshot':
      return dataOf(await rpcClient.send('visual.captureScreenshot', { tabId, format: step.format ?? 'png' }));
    case 'close':
      return dataOf(await rpcClient.send('browser.closeTab', { tabId }));
    default:
      return { warning: `Unsupported workflow action: ${step.action}` };
  }
}

function isStepFailure(result) {
  return Boolean(result?.ok === false || result?.error);
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function runAssertion(rpcClient, assertion, outputs, context = {}) {
  const tabId = assertion.tabId ?? context.tabId ?? 'active';
  switch (assertion.type) {
    case 'url_contains': {
      const active = dataOf(await rpcClient.send('browser.getActiveTab', {}));
      const href = active?.url ?? '';
      return { ...assertion, ok: href.includes(assertion.value), actual: isSensitiveUrl(href) ? REDACTED_TAB_VALUE : href, expected: assertion.value };
    }
    case 'selector_visible': {
      const result = dataOf(await rpcClient.send('page.getElementDebugInfo', { tabId, selector: assertion.selector }).catch((err) => ({ error: err.message })));
      const visible = Boolean(result?.visible ?? result?.element?.visible ?? result?.box);
      return { ...assertion, ok: visible, actual: { visible, result }, expected: 'visible' };
    }
    case 'text_present': {
      const result = dataOf(await rpcClient.send('page.getText', { tabId }));
      const text = result?.text ?? '';
      return { ...assertion, ok: text.includes(assertion.value), actual: text.slice(0, 1000), expected: assertion.value };
    }
    case 'storage_changed': {
      const storage = dataOf(await rpcClient.send('app.getClientStorage', { tabId }));
      const namespace = assertion.namespace ?? 'localStorage';
      const value = storage?.[namespace]?.[assertion.key];
      const ok = assertion.notEquals !== undefined ? value !== assertion.notEquals : value === assertion.equals;
      return { ...assertion, ok, actual: value, expected: assertion.notEquals !== undefined ? `not ${assertion.notEquals}` : assertion.equals };
    }
    case 'network_succeeded': {
      const network = dataOf(await rpcClient.send('devtools.getNetwork', { tabId }));
      const matches = (network?.requests ?? []).filter((request) => request.url?.includes(assertion.urlContains ?? assertion.value ?? ''));
      const ok = matches.some((request) => (request.response?.status ?? 0) > 0 && (request.response?.status ?? 0) < 400 && !request.failed);
      return { ...assertion, ok, actual: matches.slice(0, 10), expected: 'one matching request with status < 400' };
    }
    case 'screenshot_changed':
    case 'screenshot_unchanged': {
      const named = outputs.filter((output) => output.step?.action === 'screenshot' && output.result?.screenshot?.fullImagePath);
      const before = named[assertion.beforeIndex ?? 0]?.result?.screenshot;
      const after = named[assertion.afterIndex ?? named.length - 1]?.result?.screenshot;
      const comparable = before?.fullImagePath && after?.fullImagePath;
      const changed = comparable ? hashFile(before.fullImagePath) !== hashFile(after.fullImagePath) : false;
      return {
        ...assertion,
        ok: assertion.type === 'screenshot_changed' ? changed : comparable && !changed,
        actual: { comparable, changed, before, after },
        expected: assertion.type === 'screenshot_changed' ? 'changed' : 'unchanged',
      };
    }
    default:
      return { ...assertion, ok: false, error: `Unsupported assertion type: ${assertion.type}` };
  }
}

const actionDefs = [
  {
    name: 'fileforge_workflow_start_recording',
    description: 'Start recording a browser workflow (clicks, typing, navigation).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Recipe name to save as' },
        tabId: { type: 'string', default: 'active' },
        steps: { type: 'array', items: { type: 'object' }, description: 'Optional explicit recipe steps to save immediately.' },
        assertions: { type: 'array', items: { type: 'object' }, description: 'Optional assertions saved with the recipe.' },
      },
      required: ['name'],
    },
    handler: async (p) => {
      if (Array.isArray(p.steps)) {
        recipeStore.save({ name: p.name, steps: p.steps, assertions: p.assertions });
        return { ok: true, data: { name: p.name, status: 'saved', steps: p.steps.length }, meta: { tool: 'fileforge_workflow_start_recording' } };
      }
      recordings.set(p.name, { name: p.name, tabId: p.tabId ?? 'active', steps: [], startedAt: new Date().toISOString() });
      return {
        ok: true,
        data: { name: p.name, status: 'recording', note: 'Manual event capture is not implemented yet; use saved recipes with explicit steps for replay.' },
        meta: { tool: 'fileforge_workflow_start_recording' },
      };
    },
  },
  {
    name: 'fileforge_workflow_stop_recording',
    description: 'Stop the current workflow recording and save the recipe.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_p) => {
      const [name, recording] = recordings.entries().next().value ?? [];
      if (!recording) return { ok: false, error: { code: 'NO_RECORDING', message: 'No workflow recording is active.' } };
      recipeStore.save({ name, steps: recording.steps });
      recordings.delete(name);
      return { ok: true, data: { name, steps: recording.steps.length }, meta: { tool: 'fileforge_workflow_stop_recording' } };
    },
  },
  {
    name: 'fileforge_workflow_list_recipes',
    description: 'List all saved workflow recipes.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return { ok: true, data: { recipes: recipeStore.list() }, meta: { tool: 'fileforge_workflow_list_recipes' } };
    },
  },
  {
    name: 'fileforge_workflow_run_recipe',
    description: 'Replay a saved workflow recipe.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        inputs: { type: 'object', description: 'Variable substitutions for the recipe' },
        capture: { type: 'array', items: { type: 'string', enum: ['console', 'network', 'screenshots'] } },
        assertions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['url_contains', 'selector_visible', 'text_present', 'storage_changed', 'network_succeeded', 'screenshot_changed', 'screenshot_unchanged'] },
            },
          },
        },
        store: { type: 'boolean', default: true },
      },
      required: ['name'],
    },
    handler: async (p, { rpcClient }) => {
      const recipe = recipeStore.get(p.name);
      if (!recipe) return { ok: false, error: { code: 'NOT_FOUND', message: `No recipe found: ${p.name}` } };
      const outputs = [];
      const context = {};
      let failedStep = null;
      for (const step of recipe.steps) {
        const resolvedStep = { ...step, ...(p.inputs?.[step.name] ?? {}) };
        const result = await runStep(rpcClient, resolvedStep, context);
        const output = { step: resolvedStep, result };
        outputs.push(output);
        if (isStepFailure(result) && resolvedStep.required !== false) {
          failedStep = {
            name: resolvedStep.name,
            action: resolvedStep.action,
            error: result.error ?? result,
          };
          break;
        }
      }
      const assertions = [];
      for (const assertion of p.assertions ?? recipe.assertions ?? []) assertions.push(await runAssertion(rpcClient, assertion, outputs, context));
      const data = {
        name: p.name,
        ok: !failedStep && assertions.every((assertion) => assertion.ok !== false),
        outputs,
        assertions,
        failedStep,
        summary: {
          steps: outputs.length,
          assertions: assertions.length,
          failedAssertions: assertions.filter((assertion) => assertion.ok === false).length,
          failedStep,
        },
      };
      const stored = p.store === false ? { data } : saveResult({ prefix: 'workflow_run', tool: 'fileforge_workflow_run_recipe', data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_workflow_run_recipe' } };
    },
  },
  {
    name: 'fileforge_workflow_export_recipe',
    description: 'Export a workflow recipe to a file.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, format: { type: 'string', enum: ['json', 'playwright'], default: 'json' } },
      required: ['name'],
    },
    handler: async (p) => {
      const recipe = recipeStore.get(p.name);
      if (!recipe) return { ok: false, error: { code: 'NOT_FOUND', message: `No recipe found: ${p.name}` } };
      const format = p.format ?? 'json';
      const contents = format === 'playwright'
        ? recipe.steps.map((step) => `// ${step.action}\n${JSON.stringify(step, null, 2)}`).join('\n\n')
        : JSON.stringify(recipe, null, 2);
      const filename = writeExportFile({ filename: `${p.name}.${format === 'playwright' ? 'js' : 'json'}`, contents, defaultName: `${p.name}.json` });
      return { ok: true, data: { filename, format }, meta: { tool: 'fileforge_workflow_export_recipe' } };
    },
  },
  {
    name: 'fileforge_workflow_delete_recipe',
    description: 'Delete a saved workflow recipe.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    handler: async (p) => {
      recipeStore.delete(p.name);
      return { ok: true, data: { deleted: p.name }, meta: { tool: 'fileforge_workflow_delete_recipe' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_workflow_action',
    description: 'Record, list, run, export, and delete browser workflow recipes.',
    prefix: 'fileforge_workflow_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools, runAssertion };
