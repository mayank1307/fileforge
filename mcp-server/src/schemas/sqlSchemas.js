// Core table names that exist only when their data source is working.
// Never expose a table that doesn't have real data backing it.

export const CORE_TABLES = [
  'pages', 'links', 'page_links', 'images', 'files', 'videos',
  'tables', 'colors', 'fonts', 'lists', 'icons', 'qr_codes',
  'structured_data', 'metadata', 'notes', 'history', 'bookmarks', 'top_sites',
];

// Added only after DevTools group is implemented
export const DEVTOOLS_TABLES = [
  'network_requests', 'api_responses', 'console_logs', 'js_errors',
  'performance_events', 'websocket_messages',
];

// Added after Tasks group is implemented
export const TASK_TABLES = [
  'tasks', 'task_events', 'task_steps', 'task_outputs', 'task_artifacts', 'task_errors',
];
