import { registry } from '../registry.js';
import { writeExportFile } from '../utils/exportUtils.js';
import { maybeStoreResult } from '../utils/resultUtils.js';

// Every action here builds on this data, so a failed reply must not look like a page with no API calls.
function dataOf(response) {
  if (response?.ok === false) {
    const error = new Error(response.error?.message ?? 'The extension reported a failure.');
    error.code = response.error?.code;
    throw error;
  }
  return response?.data ?? response;
}

function apiRequests(payload) {
  return payload?.responses ?? payload?.requests ?? [];
}

function toCurl(request) {
  const headers = Object.entries(request.requestHeaders ?? {})
    .map(([name, value]) => `-H ${JSON.stringify(`${name}: ${value}`)}`)
    .join(' ');
  const body = request.postData ? ` --data ${JSON.stringify(request.postData)}` : '';
  return `curl -X ${request.method ?? 'GET'} ${headers}${body} ${JSON.stringify(request.url)}`.replace(/\s+/g, ' ').trim();
}

const tools = [
  {
    name: 'fileforge_api_action',
    actions: [
      { action: 'discover', description: 'List the API calls captured in a tab, grouped by path, method or status and by domain. Stores the result by default.', required: [] },
      { action: 'get_graphql_operations', description: 'List the GraphQL requests captured in a tab. Stores the result by default.', required: [] },
      { action: 'find_openapi_specs', description: "Send HEAD requests to common OpenAPI and Swagger paths on the tab's origin and list the ones found.", required: [] },
      { action: 'export_curl', description: 'Write the captured API calls to a shell file as curl commands.', required: [] },
      { action: 'export_postman', description: 'Write the captured API calls to a Postman collection file.', required: [] },
      { action: 'generate_msw_mocks', description: 'Write the captured API calls to a file of MSW mock handlers.', required: [] },
    ],
    description: 'Work with the API calls a page makes: discover REST and GraphQL requests, find OpenAPI specs, and export them as curl, Postman or MSW mocks. Reads a running DevTools session, so call start_session on fileforge_devtools_action first or results are empty. Exports replace a file of the same name and can include captured auth headers, so review them before sharing. Needs the extension.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'discover', 'get_graphql_operations', 'find_openapi_specs', 
            'export_curl', 'export_postman', 'generate_msw_mocks'
          ],
        },
        tabId: { type: 'string', default: 'active' },
        groupBy: { type: 'string', enum: ['route', 'method', 'status'], default: 'route' },
        includeBodies: { type: 'boolean', default: false },
        store: { type: 'boolean', default: true },
        filename: { type: 'string' }
      },
      required: ['action']
    },
    handler: async (p, { rpcClient }) => {
      switch (p.action) {
        case 'discover': {
          const payload = dataOf(await rpcClient.send('devtools.getApiResponses', { tabId: p.tabId, includeBodies: p.includeBodies ?? false }));
          const responses = apiRequests(payload);
          const routeData = await rpcClient.send('app.getRouteInfo', { tabId: p.tabId }).catch(() => null);
          const tabOrigin = routeData?.data?.route?.origin ?? null;
          const grouped = responses.reduce((acc, request) => {
            let path = request.url ?? 'unknown';
            try {
              path = new URL(request.url).pathname;
            } catch (_) {}
            const key = p.groupBy === 'method'
              ? request.method ?? 'GET'
              : p.groupBy === 'status'
                ? String(request.response?.status ?? 'unknown')
                : path;
            acc[key] ??= [];
            acc[key].push(request);
            return acc;
          }, {});
          const byDomain = responses.reduce((acc, request) => {
            let hostname = 'unknown';
            let firstParty = null;
            try {
              const u = new URL(request.url);
              hostname = u.hostname;
              firstParty = tabOrigin ? u.origin === tabOrigin : null;
            } catch (_) {}
            acc[hostname] ??= { firstParty, requests: [] };
            acc[hostname].requests.push(request);
            return acc;
          }, {});
          const data = { responses, grouped, byDomain, tabOrigin };
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'api_discover', tool: 'fileforge_api_discover', data });
          return { ok: true, ...stored, meta: { tool: 'fileforge_api_action', action: p.action } };
        }
        case 'get_graphql_operations': {
          const payload = dataOf(await rpcClient.send('devtools.getApiResponses', { tabId: p.tabId, includeBodies: true }));
          const operations = apiRequests(payload)
            .filter((request) => /graphql/i.test(request.url ?? '') || /graphql/i.test(request.body?.body ?? request.postData ?? ''))
            .map((request) => ({ url: request.url, method: request.method, requestId: request.requestId, body: request.body?.body ?? request.postData }));
          const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'api_graphql', tool: 'fileforge_api_get_graphql_operations', data: { operations } });
          return { ok: true, ...stored, meta: { tool: 'fileforge_api_action', action: p.action } };
        }
        case 'find_openapi_specs': {
          const route = dataOf(await rpcClient.send('app.getRouteInfo', { tabId: p.tabId }));
          const origin = route.route?.origin;
          const candidates = ['/openapi.json', '/swagger.json', '/api-docs', '/swagger/v1/swagger.json'];
          const found = [];
          if (origin) {
            for (const path of candidates) {
              const url = new URL(path, origin).toString();
              try {
                // The origin is the open tab's, which the browser can already reach, and only fixed paths are probed.
                const response = await fetch(url, { method: 'HEAD' });
                if (response.ok) found.push({ url, status: response.status, contentType: response.headers.get('content-type') });
              } catch (_) {}
            }
          }
          return { ok: true, data: { origin, specs: found }, meta: { tool: 'fileforge_api_action', action: p.action } };
        }
        case 'export_curl': {
          const payload = dataOf(await rpcClient.send('devtools.getApiResponses', { tabId: p.tabId, includeBodies: false }));
          const commands = apiRequests(payload).map(toCurl);
          const filename = writeExportFile({ filename: p.filename, defaultName: `api-${Date.now()}.sh`, contents: commands.join('\n') });
          return { ok: true, data: { filename, commands }, meta: { tool: 'fileforge_api_action', action: p.action } };
        }
        case 'export_postman': {
          const payload = dataOf(await rpcClient.send('devtools.getApiResponses', { tabId: p.tabId, includeBodies: false }));
          const collection = {
            info: { name: 'FileForge Captured API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
            item: apiRequests(payload).map((request) => ({ name: `${request.method} ${request.url}`, request: { method: request.method, url: request.url, header: Object.entries(request.requestHeaders ?? {}).map(([key, value]) => ({ key, value: String(value) })) } })),
          };
          const filename = writeExportFile({ filename: p.filename, defaultName: `postman-${Date.now()}.json`, contents: JSON.stringify(collection, null, 2) });
          return { ok: true, data: { filename, collection }, meta: { tool: 'fileforge_api_action', action: p.action } };
        }
        case 'generate_msw_mocks': {
          const payload = dataOf(await rpcClient.send('devtools.getApiResponses', { tabId: p.tabId, includeBodies: true }));
          const handlers = [
            "import { http, HttpResponse } from 'msw';",
            '',
            'export const handlers = [',
            ...apiRequests(payload).map((request) => `  http.${(request.method ?? 'get').toLowerCase()}(${JSON.stringify(request.url)}, () => HttpResponse.text(${JSON.stringify(request.body?.body ?? '')})),`),
            '];',
          ].join('\n');
          const filename = writeExportFile({ filename: p.filename, defaultName: `msw-${Date.now()}.js`, contents: handlers });
          return { ok: true, data: { filename, handlers }, meta: { tool: 'fileforge_api_action', action: p.action } };
        }
        default:
          throw new Error(`Unknown action: ${p.action}`);
      }
    },
  },
];

registry.registerMany(tools);
export { tools };
