import { registry } from '../registry.js';
import { createIssue, issuesFromContext, summarizeIssues } from '../utils/issueUtils.js';

function dataOf(response) {
  return response?.data ?? response;
}

function a11yFindingsToIssues(data = {}) {
  const url = data.route?.route?.href ?? data.url;
  const baseIssues = issuesFromContext({ a11y: data }, { url });
  const findingIssues = (data.findings ?? []).map((finding) => createIssue({
    type: `accessibility.${finding.type}`,
    dimension: 'accessibility',
    severity: ['missing-alt', 'unlabeled-control', 'aria-reference-missing'].includes(finding.type) ? 'medium' : 'low',
    confidence: 0.84,
    title: {
      'missing-alt': 'Image is missing alt text',
      'unlabeled-control': 'Interactive control has no accessible name',
      'small-touch-target': 'Interactive target may be too small',
      'heading-order': 'Heading order skips a level',
      'aria-reference-missing': 'ARIA reference points to missing element',
    }[finding.type] ?? 'Accessibility finding',
    impact: 'Accessibility issues can block keyboard, screen-reader, or low-vision users from completing tasks.',
    evidence: [{ url, selector: finding.selector, text: finding.visibleLabel || finding.accessibleName || finding.tag, raw: finding }],
    suggestedFix: finding.suggestedFix ?? 'Review the element and update markup to meet WCAG expectations.',
  }));
  return [...baseIssues, ...findingIssues];
}

const a11yCapabilities = {
  tool: 'fileforge_a11y_action',
  actions: {
    audit: { description: 'Run an accessibility audit against the active or specified tab.', params: { tabId: { type: 'string' }, standard: { type: 'string' }, store: { type: 'boolean' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    get_tree: { description: 'Get the accessibility tree for the current page.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true, artifact: true }, permissions: ['allowBrowser'], produces: ['json'] },
    check_keyboard: { description: 'Check keyboard navigability.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
    check_contrast: { description: 'Check color contrast across the page.', params: { tabId: { type: 'string' } }, risk: 'low', flags: { read: true, browser: true }, permissions: ['allowBrowser'], produces: ['json'] },
  },
};

const tools = [
  {
    name: 'fileforge_a11y_action',
    description: 'Run accessibility audits and checks.',
    capabilities: a11yCapabilities,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['audit', 'get_tree', 'check_keyboard', 'check_contrast'],
          description: 'The accessibility action to perform.'
        },
        tabId: { type: 'string', default: 'active' },
        standard: { type: 'string', enum: ['wcag2a', 'wcag2aa', 'wcag21aa'], default: 'wcag2aa' },
        store: { type: 'boolean', default: true },
      },
      required: ['action']
    },
    handler: async (p, { rpcClient }) => {
      switch (p.action) {
        case 'audit': {
          const data = dataOf(await rpcClient.send('a11y.audit', p));
          const route = dataOf(await rpcClient.send('app.getRouteInfo', { tabId: p.tabId ?? 'active' }).catch(() => null));
          const enriched = { ...data, route };
          const issues = a11yFindingsToIssues(enriched);
          return { ok: issues.length === 0, data: { ...enriched, issues, summary: summarizeIssues(issues) }, meta: { tool: 'fileforge_a11y_action', action: p.action } };
        }
        case 'get_tree': {
          const data = await rpcClient.send('a11y.getTree', p);
          return { ok: true, data, meta: { tool: 'fileforge_a11y_action', action: p.action } };
        }
        case 'check_keyboard': {
          const data = await rpcClient.send('a11y.checkKeyboard', p);
          return { ok: true, data, meta: { tool: 'fileforge_a11y_action', action: p.action } };
        }
        case 'check_contrast': {
          const data = await rpcClient.send('a11y.checkContrast', p);
          return { ok: true, data, meta: { tool: 'fileforge_a11y_action', action: p.action } };
        }
        default:
          throw new Error(`Unknown action: ${p.action}`);
      }
    },
  },
];

registry.registerMany(tools);
export { tools };
