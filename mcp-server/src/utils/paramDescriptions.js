// Short descriptions for parameters that many actions share, so each schema doesn't repeat them. The registry fills
// these in for any parameter without its own description. Keys are `name:type` when a name's meaning depends on its
// type, otherwise `name`. Keep them short: every word is sent to the client in the tool list.
export const PARAM_DESCRIPTIONS = {
  // Targets
  tabId: 'Tab ID, or "active" for the active tab.',
  tabIds: 'Tab IDs to act on.',
  url: 'Page URL. Omit to use the active tab where the action allows it.',
  urls: 'URLs to process.',
  baseUrl: 'Origin that routes are resolved against.',
  routes: 'Route paths to visit, such as "/pricing".',
  selector: 'CSS selector of the target element.',
  selectors: 'CSS selectors of the target elements.',
  ignoreSelectors: 'CSS selectors to mask before comparing.',
  target: 'What to audit: { url } or { tabId }. Defaults to the active tab.',
  source: 'What to scrape: { url } or { tabId }. Defaults to the active tab.',
  dataUri: 'Data URI to read.',
  // Stored results
  store: 'Save the result in ~/.fileforge and return a ref.',
  project: 'Project name that groups stored results.',
  ref: 'Ref of a stored result.',
  beforeRef: 'Ref of the earlier stored result.',
  afterRef: 'Ref of the later stored result.',
  crawlRef: 'Ref of a stored crawl to reuse.',
  beforeSnapshotId: 'ID of the earlier snapshot.',
  afterSnapshotId: 'ID of the later snapshot.',
  beforeStateId: 'stateId of the earlier page state.',
  afterStateId: 'stateId of the later page state.',
  filename: 'Output filename.',
  run: 'Run ID that groups output files.',
  // Paging and limits
  limit: 'Maximum items to return.',
  offset: 'Items to skip, for paging.',
  maxPages: 'Maximum pages to visit.',
  maxChecks: 'Maximum checks to run.',
  maxElements: 'Maximum elements to return.',
  maxTextChars: 'Maximum characters of text to return.',
  maxTextLength: 'Maximum text length to return.',
  maxHtmlLength: 'Maximum HTML length to return.',
  maxHeight: 'Maximum capture height in pixels.',
  maxMinutes: 'Maximum run time in minutes.',
  textSampleLimit: 'Maximum characters in the text sample.',
  textPreviewLimit: 'Maximum characters in the text preview.',
  domDepth: 'How many DOM levels to include.',
  // Timing
  timeoutMs: 'Time limit in milliseconds.',
  settleMs: 'Milliseconds to wait after load before capturing.',
  networkIdleMs: 'Quiet network period that counts as idle, in milliseconds.',
  networkIdleTimeoutMs: 'Longest wait for network idle, in milliseconds.',
  scrollWaitMs: 'Milliseconds to wait after each scroll.',
  captureForMs: 'How long to capture, in milliseconds.',
  pollIntervalMs: 'Milliseconds between polls.',
  intervalMinutes: 'Minutes between runs.',
  // Queries and output
  'query:string': 'Search text.',
  'query:object': 'Modules to return and their options. Takes priority over preset.',
  preset: 'Named set of query modules.',
  'format:string': 'Output format.',
  overrides: 'Request fields to change when replaying, such as method.',
  filter: 'Filter by status, type or URL.',
  sections: 'Page sections to scrape.',
  export: 'Output formats to generate.',
  capture: 'Data to capture while running.',
  include: 'Evidence to include in the bundle.',
  checks: 'Checks to run. Defaults apply if omitted.',
  viewports: 'Viewport presets to use, such as "desktop" or "mobile".',
  groupBy: 'Field to group API calls by.',
  standard: 'Accessibility standard to check against.',
  levels: 'Console levels to include.',
  area: 'chrome.storage area to read.',
  table: 'SQL table name.',
  // Include switches
  includeScreenshot: 'Include a screenshot.',
  includeScreenshotFallback: 'Use a screenshot when text extraction fails.',
  includeApiBodies: 'Include API response bodies.',
  includeBodies: 'Include response bodies.',
  includePerformance: 'Include performance metrics.',
  includeHar: 'Include a HAR capture.',
  includeBase64: 'Return the image as base64 as well as a file.',
  includeSelectors: 'Include CSS selectors for elements.',
  includeExternal: 'Include external links.',
  includeStorage: 'Include client storage. Values are not redacted.',
  includeStateHints: 'Include hints about client state.',
  includeTextPreview: 'Include a preview of the text.',
  includeDetails: 'Include extra detail for each entry.',
  includeStepResults: 'Include each step\'s result.',
  includeEvents: 'Include run events.',
  includeRaw: 'Include raw output.',
  includeLogs: 'Include logs.',
  includeSummary: 'Include a summary.',
  failuresOnly: 'Return failed requests only.',
  // Page and capture behavior
  active: 'Focus the tab while capturing.',
  keepOpen: 'Leave the tab open afterward.',
  reload: 'Reload the page before capturing.',
  bypassCache: 'Reload without the browser cache.',
  fallback: 'Try a simpler method if the first one fails.',
  direction: 'Scroll direction.',
  amount: 'Scroll distance in pixels.',
  fullPage: 'Capture the whole page, not just the viewport.',
  hideFixedElements: 'Hide fixed elements while stitching the capture.',
  padding: 'Extra pixels around the element.',
  x: 'Left edge in pixels.',
  y: 'Top edge in pixels.',
  width: 'Width in pixels.',
  height: 'Height in pixels.',
  coordinateSpace: 'Whether x and y are relative to the viewport or the page.',
  threshold: 'Per-channel color difference to ignore. 0 counts every change.',
  namePrefix: 'Prefix for baseline names.',
  quality: 'Image quality for lossy formats.',
  previousUrl: 'URL to compare the current page against.',
  previousTextHash: 'Text hash to compare the current page against.',
  // DevTools
  autoStartSession: 'Start a capture session if none is running.',
  stopAfterCapture: 'Stop the session after capturing.',
  operation: 'Session operation to perform.',
  expression: 'JavaScript to run in the page.',
  dryRun: 'Report what would happen without doing it.',
  allowDangerous: 'Allow expressions the safety check blocks. Use with care.',
  allowUnsafeMethods: 'Allow replaying non-idempotent requests. Use with care.',
  requestId: 'ID of a captured network request.',
  // Audits and storage
  watchId: 'ID returned when the watch started.',
  listingCopy: 'Store listing text to check.',
  manifest: 'Extension manifest to check.',
  namespace: 'Web storage area that holds the value.',
  location: 'Exact location returned by the audit.',
  key: 'Storage key.',
  issues: 'Issues to rank.',
  projectType: 'Project type used to rank issues.',
  summaryMode: 'Summary length.',
  text: 'Text to check.',
  body: 'Note text.',
  tags: 'Tags to attach.',
  tag: 'Tag to filter by.',
  question: 'Question to answer from saved pages.',
  // Routines
  mode: 'Kind of task: interactive, collector or monitor.',
  result: 'Result data to store on the task.',
  inputType: 'Whether the task starts from a prompt or from steps.',
  prompt: 'Plain-language description of the routine.',
  steps: 'Ordered steps: { id, tool, params, dependsOn, condition, onFailure, retry, timeout, outputKey, requiresApproval }. params includes the tool\'s action.',
  propsSchema: 'JSON schema for the routine\'s inputs.',
  defaultProps: 'Default input values.',
  permissions: 'What the routine may do, such as { allowBrowser: true }. Also allowNetwork, allowScreenshots, allowCookies, allowClipboard, allowDownloads, allowFilesystemRead, allowFilesystemWrite, allowAuthenticatedSession, allowExternalWebhooks.',
  triggerType: 'What starts the routine.',
  cronExpression: 'Cron schedule for scheduled routines.',
  enabled: 'Whether the routine can run.',
  concurrencyPolicy: 'What to do when a run is already active.',
  retryPolicy: '{ count, backoffMs } for failed steps. A step\'s own retry takes priority.',
  timeoutConfig: '{ stepMs }: time limit per step. Defaults to 60000.',
  retentionPolicy: 'Saved with the routine. Runs do not act on it yet.',
  exportConfig: 'Saved with the routine. Runs do not act on it yet.',
  storageConfig: 'Saved with the routine. Runs do not act on it yet.',
  notificationConfig: 'Saved with the routine. Runs do not act on it yet.',
  metadata: 'Free-form metadata to store with the routine.',
  createdBy: 'Who created it.',
  updatedBy: 'Who made the change.',
  reason: 'Why the change was made.',
  routineId: 'Routine ID.',
  patch: 'Routine fields to change, using the same names as create.',
  version: 'Routine version.',
  propOverrides: 'Input values for this run.',
  simulateMissing: 'Simulate unavailable tools during validation.',
  idempotencyKey: 'Key that prevents starting the same run twice.',
  priority: 'Queue priority. Higher runs first.',
  trigger: 'What started this run.',
  retryOfRunId: 'ID of the run this one retries.',
  parentRunId: 'ID of the parent run.',
  runId: 'Run ID.',
  hints: 'Extra guidance for plan_from_prompt.',
  plannedSteps: 'Steps from plan_from_prompt to commit.',
};

// For names that mean different things on different tools. These win over a module's own description, because merging
// action schemas keeps only the last action's wording.
const TOOL_PARAM_DESCRIPTIONS = {
  fileforge_audit_action: {
    title: 'Page title to include in the sensitivity check.',
    text: 'Page text to include in the sensitivity check.',
    key: 'Storage key whose value to reveal.',
  },
  fileforge_coding_action: { title: 'Bug title. Defaults to the page title.' },
  fileforge_export_action: { query: 'SQL SELECT whose rows to export.' },
  fileforge_extension_action: { key: 'Storage key whose value to reveal.' },
  fileforge_eye_action: { tabId: 'Numeric tab ID: the tab to lock onto, or the incognito tab to close.' },
  fileforge_file_action: {
    name: 'Output file name.',
    format: 'Image format for convert_data_uri_image, or the format to parse as for parse_resource. Inferred if omitted when parsing.',
    from: 'Source format. Inferred from the URL and content type if omitted.',
    to: 'Target format: json, csv, tsv or txt. csv and tsv need tabular input.',
  },
  fileforge_memory_action: { url: 'URL to look up in saved pages.' },
  fileforge_note_action: { title: 'Note title.', query: 'Text to search notes for.' },
  fileforge_perf_action: { url: 'Page URL to audit.' },
  fileforge_qa_testing: { url: 'Page URL to load.' },
  fileforge_report_action: { title: 'Report title.' },
  fileforge_responsive_action: { url: 'Page URL to scan. Required for scan_layout and capture_matrix.' },
  fileforge_result_action: { query: 'Text to search stored results for.' },
  fileforge_task_action: {
    name: 'Routine name.',
    query: 'Search text to collect results for.',
    status: 'add and edit: pending, running, paused, completed, failed or cancelled. list: any of those, or "all". get_runs: a run status.',
    capture: 'Page sections to scrape while running.',
  },
};

export function paramDescription(name, schema) {
  return PARAM_DESCRIPTIONS[`${name}:${schema?.type}`] ?? PARAM_DESCRIPTIONS[name];
}

function withDescriptions(schema, overrides = {}) {
  if (!schema?.properties) return schema;
  const properties = Object.fromEntries(Object.entries(schema.properties).map(([name, value]) => {
    if (overrides[name]) return [name, { ...value, description: overrides[name] }];
    if (value?.description) return [name, value];
    const description = paramDescription(name, value);
    return [name, description ? { ...value, description } : value];
  }));
  return { ...schema, properties };
}

// Returns a copy of a tool definition with descriptions filled in: per-tool ones first, then the module's, then shared.
export function describeToolParams(tool) {
  const overrides = TOOL_PARAM_DESCRIPTIONS[tool.name];
  const actionInputSchemas = tool.actionInputSchemas
    && Object.fromEntries(Object.entries(tool.actionInputSchemas).map(([action, schema]) => [action, withDescriptions(schema, overrides)]));
  return {
    ...tool,
    inputSchema: withDescriptions(tool.inputSchema, overrides),
    ...(actionInputSchemas ? { actionInputSchemas } : {}),
  };
}
