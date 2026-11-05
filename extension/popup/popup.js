'use strict';

/* ----- icon helpers (build SVG via DOM, no innerHTML so CSP is happy) ----- */
const SVGNS = 'http://www.w3.org/2000/svg';
function svg(size, paths) {
  const el = document.createElementNS(SVGNS, 'svg');
  el.setAttribute('width', size);
  el.setAttribute('height', size);
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '2');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  for (const p of paths) {
    const node = document.createElementNS(SVGNS, p.tag);
    for (const [k, v] of Object.entries(p)) {
      if (k === 'tag') continue;
      node.setAttribute(k, v);
    }
    el.append(node);
  }
  return el;
}
const I = {
  pin: () => svg(14, [{ tag:'path', d:'M12 17v5' }, { tag:'path', d:'M9 10.76V6h6v4.76l3 3.24v2H6v-2z' }]),
  x: () => svg(14, [{ tag:'path', d:'M18 6L6 18M6 6l12 12' }]),
  tools: () => svg(13, [{ tag:'path', d:'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' }]),
  chart: () => svg(13, [{ tag:'line', x1:'18', y1:'20', x2:'18', y2:'10' }, { tag:'line', x1:'12', y1:'20', x2:'12', y2:'4' }, { tag:'line', x1:'6', y1:'20', x2:'6', y2:'14' }]),
  activity: () => svg(13, [{ tag:'polyline', points:'22 12 18 12 15 21 9 3 6 12 2 12' }]),
  settings: () => svg(13, [{ tag:'circle', cx:'12', cy:'12', r:'3' }, { tag:'path', d:'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }]),
  copy: () => svg(11, [{ tag:'rect', x:'9', y:'9', width:'13', height:'13', rx:'2' }, { tag:'path', d:'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]),
  download: () => svg(13, [{ tag:'path', d:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }, { tag:'polyline', points:'7 10 12 15 17 10' }, { tag:'line', x1:'12', y1:'15', x2:'12', y2:'3' }]),
  clear: () => svg(13, [{ tag:'polyline', points:'3 6 5 6 21 6' }, { tag:'path', d:'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]),
  chev: () => svg(9, [{ tag:'polyline', points:'6 9 12 15 18 9' }]),
  arrowUp: () => svg(9, [{ tag:'polyline', points:'18 15 12 9 6 15' }]),
  arrowDown: () => svg(9, [{ tag:'polyline', points:'6 9 12 15 18 9' }]),
  globe: () => svg(14, [{ tag:'circle', cx:'12', cy:'12', r:'10' }, { tag:'line', x1:'2', y1:'12', x2:'22', y2:'12' }, { tag:'path', d:'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' }]),
  cursor: () => svg(14, [{ tag:'path', d:'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z' }]),
  eye: () => svg(14, [{ tag:'path', d:'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }, { tag:'circle', cx:'12', cy:'12', r:'3' }]),
  app: () => svg(14, [{ tag:'rect', x:'3', y:'3', width:'7', height:'7' }, { tag:'rect', x:'14', y:'3', width:'7', height:'7' }, { tag:'rect', x:'14', y:'14', width:'7', height:'7' }, { tag:'rect', x:'3', y:'14', width:'7', height:'7' }]),
  shield: () => svg(14, [{ tag:'path', d:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]),
  zap: () => svg(14, [{ tag:'polygon', points:'13 2 3 14 12 14 11 22 21 10 12 10 13 2' }]),
  refresh: () => svg(13, [{ tag:'polyline', points:'23 4 23 10 17 10' }, { tag:'polyline', points:'1 20 1 14 7 14' }, { tag:'path', d:'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }]),
  code: () => svg(14, [{ tag:'polyline', points:'16 18 22 12 16 6' }, { tag:'polyline', points:'8 6 2 12 8 18' }]),
  bolt: () => svg(14, [{ tag:'polygon', points:'13 2 3 14 12 14 11 22 21 10 12 10 13 2' }]),
  database: () => svg(14, [{ tag:'ellipse', cx:'12', cy:'5', rx:'9', ry:'3' }, { tag:'path', d:'M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5' }, { tag:'path', d:'M3 12c0 1.66 4 3 9 3s9-1.34 9-3' }]),
  monitor: () => svg(14, [{ tag:'rect', x:'2', y:'3', width:'20', height:'14', rx:'2' }, { tag:'line', x1:'8', y1:'21', x2:'16', y2:'21' }, { tag:'line', x1:'12', y1:'17', x2:'12', y2:'21' }]),
  image: () => svg(14, [{ tag:'rect', x:'3', y:'3', width:'18', height:'18', rx:'2' }, { tag:'circle', cx:'8.5', cy:'8.5', r:'1.5' }, { tag:'polyline', points:'21 15 16 10 5 21' }]),
};

/* ----- tool catalog (mirrors background/modules/*) ----- */
const TOOL_CATEGORIES = [
  { id:'browser', label:'Browser', icon:I.globe, mcpTool:'fileforge_browser_action', tools:[
    { name:'browser.getActiveTab',  desc:'Returns id, url, title, status of the active tab', params:[] },
    { name:'browser.getRawContext', desc:'Snapshot all open tabs and window context', params:[] },
    { name:'browser.openUrl',       desc:'Open a URL in a new tab', params:[
      { name:'url', type:'string', req:true },
      { name:'newTab', type:'boolean', req:false },
    ]},
    { name:'browser.navigateUrl',   desc:'Navigate the current tab to a URL', params:[
      { name:'url', type:'string', req:true },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'browser.activateTab',   desc:'Bring a tab into focus', params:[
      { name:'tabId', type:'number', req:true },
    ]},
    { name:'browser.closeTab',      desc:'Close a tab by id', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'browser.reloadTab',     desc:'Reload a tab', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'browser.history',       desc:'Navigate back or forward in history', params:[
      { name:'direction', type:'string', req:false },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'browser.waitForLoad',   desc:'Wait for tab to finish loading', params:[
      { name:'tabId', type:'number', req:false },
      { name:'timeout', type:'number', req:false },
    ]},
  ]},
  { id:'page', label:'Page', icon:I.cursor, mcpTool:'fileforge_page_interaction', tools:[
    { name:'page.getInteractiveElements', desc:'Lists interactive nodes with selectors', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.getText',               desc:'Read text content by selector', params:[
      { name:'selector', type:'string', req:true },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.getDomSnapshot',        desc:'Full DOM snapshot of the page', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.getLayeredSnapshot',    desc:'Layered DOM snapshot with visibility info (server-composed)', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.getAccessibilityTree',  desc:'Full accessibility tree of the page', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.getForms',              desc:'Extract all form elements and their state', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.waitForSelector',       desc:'Wait for an element to appear in the DOM', params:[
      { name:'selector', type:'string', req:true },
      { name:'timeout', type:'number', req:false },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.click',                 desc:'Click an element by selector', params:[
      { name:'selector', type:'string', req:true },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.fill',                  desc:'Type into an input field', params:[
      { name:'selector', type:'string', req:true },
      { name:'value', type:'string', req:true },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.scroll',                desc:'Scroll the page or an element', params:[
      { name:'selector', type:'string', req:false },
      { name:'direction', type:'string', req:false },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.reveal',                desc:'Scroll element into view', params:[
      { name:'selector', type:'string', req:true },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.extractArticle',        desc:'Extract main article content from page', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.getElementDebugInfo',   desc:'Debug info for an element by selector', params:[
      { name:'selector', type:'string', req:true },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.hideElements',          desc:'Hide elements by selector list', params:[
      { name:'selectors', type:'string[]', req:true },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.restoreHiddenElements', desc:'Restore previously hidden elements', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'page.compareVisibleVsArticle', desc:'Compare visible content vs extracted article', params:[
      { name:'tabId', type:'number', req:false },
    ]},
  ]},
  { id:'scrape', label:'Scrape', icon:I.code, mcpTool:'fileforge_scrape_action', tools:[
    { name:'scrape.page',   desc:'Extract structured page content', params:[
      { name:'sections', type:'string[]', req:false },
      { name:'store', type:'boolean', req:false },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'scrape.extractTables', desc:'Read all HTML tables as JSON', params:[
      { name:'tabId', type:'number', req:false },
    ]},
  ]},
  { id:'a11y', label:'Accessibility', icon:I.eye, mcpTool:'fileforge_a11y_action', tools:[
    { name:'a11y.audit',        desc:'Run accessibility audit on page', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'a11y.getTree',      desc:'Capture full accessibility tree', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'a11y.checkKeyboard', desc:'Verify keyboard navigability', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'a11y.checkContrast', desc:'Check color contrast ratios', params:[
      { name:'tabId', type:'number', req:false },
    ]},
  ]},
  { id:'devtools', label:'DevTools', icon:I.bolt, mcpTool:'fileforge_devtools_action', tools:[
    { name:'devtools.startSession',    desc:'Start instrumented DevTools capture', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'devtools.stopSession',     desc:'Stop the DevTools capture session', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'devtools.clearSession',    desc:'Clear captured session data', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'devtools.getConsole',      desc:'Read recent console messages', params:[
      { name:'tabId', type:'number', req:false },
      { name:'level', type:'string', req:false },
    ]},
    { name:'devtools.getJsErrors',     desc:'Get JavaScript errors from console', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'devtools.getNetwork',      desc:'Inspect network requests', params:[
      { name:'tabId', type:'number', req:false },
      { name:'filter', type:'string', req:false },
    ]},
    { name:'devtools.getApiResponses', desc:'Extract API response bodies', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'devtools.getPerformance',  desc:'Get performance timing metrics', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'devtools.getWebSockets',   desc:'Inspect WebSocket frames', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'devtools.evaluate',        desc:'Run JS in page context via DevTools', params:[
      { name:'code', type:'string', req:true },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'devtools.replayRequest',   desc:'Replay a captured network request', params:[
      { name:'requestId', type:'string', req:true },
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'devtools.exportHar',       desc:'Export session as HAR archive', params:[
      { name:'tabId', type:'number', req:false },
    ]},
  ]},
  { id:'visual', label:'Visual', icon:I.image, mcpTool:'fileforge_visual_action', tools:[
    { name:'visual.captureFullPage',   desc:'Capture full-page screenshot', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'visual.captureScreenshot', desc:'Capture visible viewport screenshot', params:[
      { name:'tabId', type:'number', req:false },
      { name:'selector', type:'string', req:false },
    ]},
  ]},
  { id:'app', label:'App', icon:I.app, mcpTool:'fileforge_app_action', tools:[
    { name:'app.getRouteInfo', desc:'Inspect current route + params', params:[
      { name:'tabId', type:'number', req:false },
    ]},
    { name:'app.getClientStorage', desc:'Snapshot localStorage and sessionStorage', params:[
      { name:'tabId', type:'number', req:false },
    ]},
  ]},
  { id:'sql', label:'SQL', icon:I.database, mcpTool:'fileforge_sql_action', tools:[
    { name:'sql.query', desc:'Query collected results', params:[
      { name:'query', type:'string', req:true },
    ]},
    { name:'sql.listTables', desc:'List tables and columns', params:[] },
  ]},
  { id:'tasks', label:'Tasks', icon:I.monitor, mcpTool:'fileforge_task_action', tools:[
    { name:'task.add', desc:'Create a saved task action plan without starting execution', params:[
      { name:'title', type:'string', req:false },
      { name:'actions', type:'object[]', req:true },
      { name:'mode', type:'string', req:false },
      { name:'status', type:'string', req:false },
    ]},
    { name:'task.edit', desc:'Edit a saved task action plan', params:[
      { name:'taskId', type:'string', req:true },
      { name:'title', type:'string', req:false },
      { name:'actions', type:'object[]', req:false },
      { name:'mode', type:'string', req:false },
      { name:'status', type:'string', req:false },
    ]},
    { name:'task.list', desc:'List saved and running tasks', params:[
      { name:'status', type:'string', req:false },
    ]},
    { name:'task.delete', desc:'Delete a task and its event history', params:[
      { name:'taskId', type:'string', req:true },
    ]},
    { name:'task.start', desc:'Start an asynchronous FileForge task', params:[
      { name:'taskId', type:'string', req:false },
      { name:'actions', type:'object[]', req:false },
    ]},
    { name:'task.status', desc:'Read task status', params:[
      { name:'taskId', type:'string', req:true },
    ]},
  ]},
];
const ALL_TOOLS = TOOL_CATEGORIES.flatMap(c => c.tools);

/* ----- state ----- */
const DEFAULT_SETTINGS = {
  autoReplay: false,
  streamResults: true,
  prettyJson: true,
  notifyErrors: false,
};

const state = {
  tab: 'tools',
  toolsQuery: '',
  activityQuery: '',
  analytics: { bridgeConnected: false, mcpEvents: [], recentRequests: [], activeRequests: [], actionTypes: [] },
  settings: { ...DEFAULT_SETTINGS },
  startedAt: Date.now(),
  bridgeConnectedSince: null,
  // filter states
  activityStatusFilter: 'all',   // 'all' | 'ok' | 'warn' | 'err'
  toolsCategoryFilter: 'all',    // 'all' | category id
  expandedToolId: null,          // currently expanded tool name
  sqlConsole: {
    query: 'SELECT ref, tool, url, created_at FROM results ORDER BY created_at DESC LIMIT 20',
    loading: false,
    result: null,
    error: '',
  },
};

/* ----- utilities ----- */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') {/* never use */}
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'value' && ('value' in node)) node.value = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'data' && typeof v === 'object') for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

function captureContentFocus(container) {
  const active = document.activeElement;
  if (!active?.closest?.('#content')) return null;
  if (!active.matches?.('input, textarea, select')) return null;

  const focusId = active.dataset.focusId;
  const selector = focusId
    ? `[data-focus-id="${CSS.escape(focusId)}"]`
    : `${active.tagName.toLowerCase()}[placeholder="${CSS.escape(active.placeholder || '')}"]`;

  return {
    selector,
    value: active.value,
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd,
    scrollTop: active.scrollTop,
    scrollLeft: active.scrollLeft,
    hadFocus: container.contains(active),
  };
}

function restoreContentFocus(container, snapshot) {
  if (!snapshot?.hadFocus) return;
  const next = container.querySelector(snapshot.selector);
  if (!next) return;

  next.focus();
  if ('value' in next && next.value !== snapshot.value) next.value = snapshot.value;
  try {
    if (snapshot.selectionStart != null && snapshot.selectionEnd != null) {
      next.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  } catch {}
  next.scrollTop = snapshot.scrollTop || 0;
  next.scrollLeft = snapshot.scrollLeft || 0;
}

function captureNamedScrolls(container) {
  const scrolls = new Map();
  container.querySelectorAll('[data-scroll-id]').forEach((node) => {
    const id = node.dataset.scrollId;
    if (id && (node.scrollLeft || node.scrollTop)) {
      scrolls.set(id, { left: node.scrollLeft, top: node.scrollTop });
    }
  });
  return scrolls;
}

function restoreNamedScrolls(container, scrolls) {
  if (!scrolls?.size) return;
  container.querySelectorAll('[data-scroll-id]').forEach((node) => {
    const pos = scrolls.get(node.dataset.scrollId);
    if (pos) {
      node.scrollLeft = pos.left;
      node.scrollTop = pos.top;
    }
  });
}

function hasFocusedEditorInContent() {
  const active = document.activeElement;
  return !!active?.closest?.('#content') && active.matches?.('input, textarea, select');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function formatUptime(startMs) {
  if (!startMs) return '—';
  const s = Math.max(0, Math.round((Date.now() - startMs) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function formatHMS(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function actionTypeOf(item = {}) {
  if (item.actionType) return item.actionType;
  const m = String(item.method || '');
  return m || 'unknown';
}

/* ----- JSON highlighter (CSP-safe: no innerHTML) ----- */
function jsonHL(text) {
  const out = document.createDocumentFragment();
  const re = /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?\b)|([{}\[\],])|(true|false|null)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.append(document.createTextNode(text.slice(last, m.index)));
    if (m[1]) {
      out.append(el('span', { class: 'tok-key', text: m[1] }));
      out.append(document.createTextNode(':'));
    } else if (m[2]) {
      out.append(el('span', { class: 'tok-str', text: m[2] }));
    } else if (m[3]) {
      out.append(el('span', { class: 'tok-num', text: m[3] }));
    } else if (m[4]) {
      out.append(el('span', { class: 'tok-pun', text: m[4] }));
    } else if (m[5]) {
      out.append(el('span', { class: 'tok-num', text: m[5] }));
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.append(document.createTextNode(text.slice(last)));
  return out;
}

/* ----- chart builders (SVG via DOM) ----- */
function sparkline(data, color = 'var(--accent)') {
  const w = 110, h = 30, pad = 2;
  if (!data || data.length < 2) {
    return el('div', { class: 'spark' });
  }
  const max = Math.max(...data), min = Math.min(...data);
  const span = Math.max(1, max - min);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const a = `M${pts[0][0]} ${h} L` + pts.map(p => p.join(' ')).join(' L') + ` L${pts[pts.length-1][0]} ${h} Z`;

  const root = document.createElementNS(SVGNS, 'svg');
  root.setAttribute('class', 'spark');
  root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  root.setAttribute('preserveAspectRatio', 'none');
  const gradId = `sparkA_${Math.random().toString(36).slice(2,8)}`;
  const defs = document.createElementNS(SVGNS, 'defs');
  const grad = document.createElementNS(SVGNS, 'linearGradient');
  grad.setAttribute('id', gradId);
  grad.setAttribute('x1', '0'); grad.setAttribute('x2', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('y2', '1');
  const s0 = document.createElementNS(SVGNS, 'stop');
  s0.setAttribute('offset', '0%'); s0.setAttribute('stop-color', color); s0.setAttribute('stop-opacity', '0.45');
  const s1 = document.createElementNS(SVGNS, 'stop');
  s1.setAttribute('offset', '100%'); s1.setAttribute('stop-color', color); s1.setAttribute('stop-opacity', '0');
  grad.append(s0, s1); defs.append(grad); root.append(defs);

  const area = document.createElementNS(SVGNS, 'path');
  area.setAttribute('d', a); area.setAttribute('fill', `url(#${gradId})`);
  const line = document.createElementNS(SVGNS, 'path');
  line.setAttribute('d', d); line.setAttribute('fill', 'none'); line.setAttribute('stroke', color); line.setAttribute('stroke-width', '1.2');
  root.append(area, line);
  return root;
}

function barChart(data, labels) {
  const w = 420, h = 120, pad = { l: 24, r: 8, t: 8, b: 18 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const max = Math.max(...data, 1);
  const ticks = [0, Math.round(max / 2), max];
  const bw = innerW / Math.max(1, data.length);

  const root = document.createElementNS(SVGNS, 'svg');
  root.setAttribute('class', 'chart-svg');
  root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  root.setAttribute('preserveAspectRatio', 'none');

  const defs = document.createElementNS(SVGNS, 'defs');
  const grad = document.createElementNS(SVGNS, 'linearGradient');
  grad.setAttribute('id', 'bargrad'); grad.setAttribute('x1','0'); grad.setAttribute('x2','0'); grad.setAttribute('y1','0'); grad.setAttribute('y2','1');
  const g0 = document.createElementNS(SVGNS, 'stop');
  g0.setAttribute('offset','0%'); g0.setAttribute('stop-color','#7c8cff'); g0.setAttribute('stop-opacity','0.95');
  const g1 = document.createElementNS(SVGNS, 'stop');
  g1.setAttribute('offset','100%'); g1.setAttribute('stop-color','#5b6cff'); g1.setAttribute('stop-opacity','0.6');
  grad.append(g0, g1); defs.append(grad); root.append(defs);

  const gridG = document.createElementNS(SVGNS, 'g'); gridG.setAttribute('class', 'chart-grid');
  for (const t of ticks) {
    const y = pad.t + innerH - (t / max) * innerH;
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', pad.l); line.setAttribute('x2', w - pad.r); line.setAttribute('y1', y); line.setAttribute('y2', y);
    gridG.append(line);
  }
  root.append(gridG);

  const axisG = document.createElementNS(SVGNS, 'g'); axisG.setAttribute('class', 'chart-axis');
  for (const t of ticks) {
    const y = pad.t + innerH - (t / max) * innerH;
    const text = document.createElementNS(SVGNS, 'text');
    text.setAttribute('x', pad.l - 4); text.setAttribute('y', y + 3); text.setAttribute('text-anchor', 'end');
    text.textContent = String(t);
    axisG.append(text);
  }
  root.append(axisG);

  const barsG = document.createElementNS(SVGNS, 'g');
  data.forEach((v, i) => {
    const bh = (v / max) * innerH;
    const x = pad.l + i * bw + bw * 0.18;
    const bwd = bw * 0.64;
    const y = pad.t + innerH - bh;
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('class', 'chart-bar');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', bwd); r.setAttribute('height', bh); r.setAttribute('rx', '2');
    barsG.append(r);
  });
  root.append(barsG);

  const labelG = document.createElementNS(SVGNS, 'g'); labelG.setAttribute('class', 'chart-axis');
  labels.forEach((l, i) => {
    if (!l) return;
    if (i % 2 !== 0 && labels.length > 8) return;
    const x = pad.l + i * bw + bw / 2;
    const text = document.createElementNS(SVGNS, 'text');
    text.setAttribute('x', x); text.setAttribute('y', h - 4); text.setAttribute('text-anchor', 'middle');
    text.textContent = l;
    labelG.append(text);
  });
  root.append(labelG);
  return root;
}

// Generic line/area chart. data = number[], xLabels = string[] (optional), yFmt = tick formatter
function lineChart(data, xLabels = [], yFmt = v => `${v}ms`, emptyMsg = 'No data yet') {
  const w = 420, h = 120, pad = { l: 30, r: 8, t: 10, b: xLabels.length ? 22 : 12 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const root = document.createElementNS(SVGNS, 'svg');
  root.setAttribute('class', 'chart-svg');
  root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  root.setAttribute('preserveAspectRatio', 'none');

  if (!data.length || data.every(v => v === 0)) {
    const text = document.createElementNS(SVGNS, 'text');
    text.setAttribute('x', w / 2); text.setAttribute('y', h / 2); text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'chart-axis');
    text.textContent = emptyMsg;
    root.append(text);
    return root;
  }

  const max = Math.max(...data) * 1.1 || 1;
  const pts = data.map((v, i) => {
    const x = pad.l + (i / Math.max(1, data.length - 1)) * innerW;
    const y = pad.t + innerH - (v / max) * innerH;
    return [x, y];
  });
  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const areaPath = `M${pts[0][0]} ${pad.t + innerH} L` + pts.map(p => p.join(' ')).join(' L') + ` L${pts[pts.length-1][0]} ${pad.t + innerH} Z`;
  const ticks = [0, Math.round(max / 2), Math.round(max)];

  const gradId = `lg_${Math.random().toString(36).slice(2, 7)}`;
  const defs = document.createElementNS(SVGNS, 'defs');
  const grad = document.createElementNS(SVGNS, 'linearGradient');
  grad.setAttribute('id', gradId); grad.setAttribute('x1','0'); grad.setAttribute('x2','0'); grad.setAttribute('y1','0'); grad.setAttribute('y2','1');
  const g0 = document.createElementNS(SVGNS, 'stop');
  g0.setAttribute('offset','0%'); g0.setAttribute('stop-color','#7c8cff'); g0.setAttribute('stop-opacity','0.32');
  const g1 = document.createElementNS(SVGNS, 'stop');
  g1.setAttribute('offset','100%'); g1.setAttribute('stop-color','#7c8cff'); g1.setAttribute('stop-opacity','0');
  grad.append(g0, g1); defs.append(grad); root.append(defs);

  const gridG = document.createElementNS(SVGNS, 'g'); gridG.setAttribute('class', 'chart-grid');
  for (const t of ticks) {
    const y = pad.t + innerH - (t / max) * innerH;
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', pad.l); line.setAttribute('x2', w - pad.r); line.setAttribute('y1', y); line.setAttribute('y2', y);
    gridG.append(line);
  }
  root.append(gridG);

  const axisG = document.createElementNS(SVGNS, 'g'); axisG.setAttribute('class', 'chart-axis');
  for (const t of ticks) {
    const y = pad.t + innerH - (t / max) * innerH;
    const text = document.createElementNS(SVGNS, 'text');
    text.setAttribute('x', pad.l - 4); text.setAttribute('y', y + 3); text.setAttribute('text-anchor', 'end');
    text.textContent = yFmt(t);
    axisG.append(text);
  }
  root.append(axisG);

  // X-axis labels (for bucket charts)
  if (xLabels.length) {
    const xlG = document.createElementNS(SVGNS, 'g'); xlG.setAttribute('class', 'chart-axis');
    const step = innerW / Math.max(1, data.length - 1);
    xLabels.forEach((lbl, i) => {
      if (!lbl) return;
      const x = pad.l + i * step;
      const text = document.createElementNS(SVGNS, 'text');
      text.setAttribute('x', x); text.setAttribute('y', h - 4); text.setAttribute('text-anchor', 'middle');
      text.textContent = lbl;
      xlG.append(text);
    });
    root.append(xlG);
  }

  const area = document.createElementNS(SVGNS, 'path');
  area.setAttribute('fill', `url(#${gradId})`); area.setAttribute('d', areaPath); root.append(area);
  const line = document.createElementNS(SVGNS, 'path');
  line.setAttribute('class', 'chart-line'); line.setAttribute('d', linePath); root.append(line);
  return root;
}

/* ----- derived stats ----- */
function callStatsByMethod(requests = []) {
  const map = new Map();
  for (const r of requests) {
    const k = r.method || actionTypeOf(r);
    if (!k) continue;
    const cur = map.get(k) || { calls: 0, ms: 0, errors: 0 };
    cur.calls += 1;
    if (Number.isFinite(r.durationMs)) cur.ms += r.durationMs;
    if (r.ok === false) cur.errors += 1;
    map.set(k, cur);
  }
  for (const [, v] of map) v.avgMs = v.calls ? Math.round(v.ms / v.calls) : 0;
  return map;
}

// Build stats from mcpEvents (direction='in' = calls, direction='out' = results with latency)
function callStatsByEvents(events = []) {
  const map = new Map();
  // Count calls from inbound events
  for (const ev of events) {
    if (ev.direction !== 'in') continue;
    const k = ev.method;
    if (!k) continue;
    const cur = map.get(k) || { calls: 0, ms: 0, errors: 0 };
    cur.calls += 1;
    map.set(k, cur);
  }
  // Add latency + error info from outbound events
  for (const ev of events) {
    if (ev.direction !== 'out') continue;
    const k = ev.method;
    if (!k) continue;
    const cur = map.get(k);
    if (!cur) continue;
    if (Number.isFinite(ev.durationMs)) cur.ms += ev.durationMs;
    if (ev.ok === false) cur.errors += 1;
  }
  for (const [, v] of map) v.avgMs = v.calls ? Math.round(v.ms / v.calls) : 0;
  return map;
}

// 12 × 5-minute buckets = last 1 hour of call volume
function calls5MinBuckets(events = []) {
  const buckets = 12, bucketMs = 5 * 60_000;
  const out = new Array(buckets).fill(0);
  const labels = new Array(buckets).fill('');
  const now = Date.now();
  for (let i = 0; i < buckets; i++) {
    const t = new Date(now - (buckets - 1 - i) * bucketMs);
    labels[i] = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  }
  for (const ev of events) {
    if (ev.direction !== 'in') continue;
    const ts = ev.timestamp || ev.startedAt;
    if (!ts) continue;
    const age = now - new Date(ts).getTime();
    if (age < 0 || age > buckets * bucketMs) continue;
    const idx = buckets - 1 - Math.floor(age / bucketMs);
    if (idx >= 0 && idx < buckets) out[idx] += 1;
  }
  return { data: out, labels };
}

// Pair in/out mcpEvents by requestId to recover per-call latency (up to `limit` most recent)
function latencyFromEvents(events = [], limit = 100) {
  const byId = new Map();
  for (const ev of events) {
    const key = ev.requestId || ev.id;
    if (!key) continue;
    if (!byId.has(key)) byId.set(key, {});
    byId.get(key)[ev.direction] = ev;
  }
  const results = [];
  for (const [, pair] of byId) {
    if (!pair.in || !pair.out) continue;
    let ms = pair.out.durationMs;
    if (!Number.isFinite(ms)) {
      const d = new Date(pair.out.timestamp).getTime() - new Date(pair.in.timestamp).getTime();
      if (d >= 0) ms = d;
    }
    if (!Number.isFinite(ms)) continue;
    results.push({ ms, ts: pair.out.timestamp });
  }
  return results
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    .slice(-limit)
    .map(r => r.ms);
}

/* ----- pill row helper ----- */
function renderPills(items, activeValue, onClick) {
  return el('div', { class: 'pills' }, items.map(({ value, label }) =>
    el('button', {
      class: 'pill' + (activeValue === value ? ' active' : ''),
      onclick: () => onClick(value),
    }, [label])
  ));
}

/* ----- root render ----- */
const shell = document.getElementById('shell');

function render() {
  shell.replaceChildren(
    renderHeader(),
    renderTabs(),
    renderContent(),
  );
}

function renderHeader() {
  const connected = !!state.analytics.bridgeConnected;

  return el('div', { class: 'header' }, [
    el('div', { class: 'product' }, [
      el('div', { class: 'product-mark', text: 'FF' }),
      el('div', { class: 'product-info' }, [
        el('span', { class: 'product-name', text: 'FileForge Agent' }),
        el('span', { class: 'product-sub', text: `v${chrome.runtime.getManifest().version} · ${formatUptime(state.bridgeConnectedSince ?? state.startedAt)}` }),
      ]),
    ]),
    el('div', { class: 'conn-pills' }, [
      el('span', { class: 'conn-pill', title: 'Extension runtime' }, [
        el('span', { class: 'dot green' }),
        'EXT',
      ]),
      el('span', { class: 'conn-pill', title: connected ? 'MCP bridge connected' : 'MCP bridge disconnected' }, [
        el('span', { class: 'dot ' + (connected ? 'green' : 'red') }),
        'MCP',
      ]),
    ]),
    el('button', { class: 'icon-btn', title: 'Refresh', 'aria-label': 'Refresh', onclick: () => refreshStatus() }, [I.refresh()]),
  ]);
}

function renderTabs() {
  const oneHourAgo = Date.now() - 3_600_000;
  const recentEvents = (state.analytics.mcpEvents || []).filter(e => new Date(e.timestamp).getTime() > oneHourAgo);
  const tabs = [
    { id: 'tools',    label: 'Tools',    icon: I.tools,    count: ALL_TOOLS.length },
    { id: 'analytics',label: 'Analytics',icon: I.chart },
    { id: 'activity', label: 'Activity', icon: I.activity, count: recentEvents.filter(e => e.direction === 'in').length },
    { id: 'settings', label: 'Settings', icon: I.settings },
  ];
  return el('div', { class: 'tabs' }, tabs.map(t => el('button', {
    class: 'tab' + (state.tab === t.id ? ' active' : ''),
    onclick: () => {
      state.tab = t.id;
      render();
    },
  }, [
    t.icon(),
    el('span', { text: t.label }),
    t.count != null ? el('span', { class: 'count', text: String(t.count) }) : null,
  ])));
}

function renderContent() {
  const c = el('div', { class: 'content', id: 'content' });
  if (state.tab === 'tools') c.append(renderToolsView());
  else if (state.tab === 'analytics') c.append(renderAnalyticsView());
  else if (state.tab === 'activity') c.append(renderActivityView());
  else if (state.tab === 'settings') c.append(renderSettingsView());
  return c;
}

/* ----- tools view ----- */
function renderToolsView() {
  const wrap = document.createDocumentFragment();

  // Category filter pills
  const catPills = [{ value: 'all', label: 'All' }, ...TOOL_CATEGORIES.map(c => ({ value: c.id, label: c.label }))];
  wrap.append(renderPills(catPills, state.toolsCategoryFilter, (v) => { state.toolsCategoryFilter = v; rerenderContent(); }));

  // Search bar
  const search = el('div', { class: 'search-bar' }, [
    el('input', {
      data: { focusId: 'tools-search' },
      class: 'search-input',
      placeholder: 'Search tools by name or description…',
      value: state.toolsQuery,
      oninput: (e) => { state.toolsQuery = e.target.value; rerenderContent(); },
    }),
  ]);
  wrap.append(search);

  const mcpEvents = state.analytics.mcpEvents || [];
  const stats = callStatsByEvents(mcpEvents);
  const q = state.toolsQuery.toLowerCase();
  const panel = el('div', { class: 'panel' });

  if (state.toolsCategoryFilter === 'all' || state.toolsCategoryFilter === 'sql') {
    panel.append(renderSqlConsole());
  }

  let any = false;
  for (const cat of TOOL_CATEGORIES) {
    // Category filter
    if (state.toolsCategoryFilter !== 'all' && state.toolsCategoryFilter !== cat.id) continue;

    const matches = cat.tools.filter(t => !q || t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q));
    if (!matches.length) continue;
    any = true;

    const catHead = el('div', { class: 'tool-cat' }, [
      el('div', { class: 'tool-cat-head' }, [
        cat.icon(),
        el('span', { text: cat.label }),
        el('span', { class: 'count', text: String(matches.length) }),
        el('span', { class: 'tool-mcp-label', text: cat.mcpTool }),
      ]),
      ...matches.map(t => {
        const s = stats.get(t.name);
        const isExpanded = state.expandedToolId === t.name;

        const card = el('div', {
          class: 'tool-card' + (isExpanded ? ' expanded' : ''),
          onclick: () => {
            state.expandedToolId = isExpanded ? null : t.name;
            rerenderContent();
          },
        }, [
          el('div', { class: 'tool-card-icon' }, [I.zap()]),
          el('div', { class: 'tool-card-body' }, [
            el('div', { class: 'tool-card-name', text: t.name }),
            el('div', { class: 'tool-card-desc', text: t.desc }),
          ]),
          el('div', { class: 'tool-card-stat' }, [
            el('div', {}, [el('b', { text: String(s?.calls ?? 0) }), ' calls']),
            el('div', { text: `${s?.avgMs ?? 0}ms avg` }),
          ]),
          el('div', { class: 'tool-card-chev' }, [isExpanded ? I.arrowUp() : I.arrowDown()]),
        ]);

        if (isExpanded) {
          const detail = el('div', { class: 'tool-expand' }, [
            // MCP tool badge + copy button
            el('div', { class: 'tool-expand-head' }, [
              el('span', { class: 'tool-mcp-badge', text: cat.mcpTool }),
              el('span', { class: 'tool-method-badge', text: t.name }),
              el('button', {
                class: 'mini-btn',
                onclick: (e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(t.name).catch(() => {});
                  const btn = e.currentTarget;
                  btn.lastChild.textContent = ' Copied!';
                  setTimeout(() => { try { btn.lastChild.textContent = ' Copy'; } catch {} }, 1200);
                },
              }, [I.copy(), ' Copy']),
            ]),
            // Parameters
            t.params.length > 0
              ? el('div', { class: 'tool-expand-params' }, [
                  el('div', { class: 'tool-expand-section', text: 'Parameters' }),
                  ...t.params.map(p => el('div', { class: 'param-row' }, [
                    el('span', { class: 'param-name', text: p.name }),
                    el('span', { class: 'param-type', text: p.type }),
                    el('span', { class: 'param-req ' + (p.req ? 'req' : 'opt'), text: p.req ? 'required' : 'optional' }),
                  ])),
                ])
              : el('div', { class: 'tool-expand-params' }, [
                  el('div', { class: 'tool-expand-section', text: 'Parameters' }),
                  el('div', { class: 'param-empty', text: 'No parameters required' }),
                ]),
            // Stats
            s && s.calls > 0 ? el('div', { class: 'tool-expand-stats' }, [
              el('span', { text: `${s.calls} calls` }),
              el('span', { class: 'dot-sep', text: '·' }),
              el('span', { text: `${s.avgMs}ms avg` }),
              el('span', { class: 'dot-sep', text: '·' }),
              el('span', { class: s.errors > 0 ? 'stat-err' : 'stat-ok', text: `${s.errors} errors` }),
            ]) : null,
          ]);
          card.append(detail);
        }

        return card;
      }),
    ]);
    panel.append(catHead);
  }

  if (!any) panel.append(el('div', { class: 'empty', text: `No tools match "${state.toolsQuery}".` }));
  wrap.append(panel);
  return wrap;
}

function renderSqlConsole() {
  const sql = state.sqlConsole;
  const data = sql.result?.data ?? {};
  const rows = Array.isArray(data.rows)
    ? data.rows
    : Array.isArray(data.tables)
      ? data.tables.map((table) => typeof table === 'string' ? { table } : table)
      : [];
  const columns = rows.length
    ? Object.keys(rows.reduce((acc, row) => ({ ...acc, ...(row && typeof row === 'object' ? row : {}) }), {}))
    : [];

  return el('div', { class: 'card', style: { marginBottom: '12px' } }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('div', { class: 'ctitle', text: 'SQL Console' }),
        el('div', { class: 'csub', style: { marginTop: '2px' }, text: 'Runs server-side FileForge SQL against stored results' }),
      ]),
      el('div', { class: 'csub', text: state.analytics.bridgeConnected ? 'bridge online' : 'bridge offline' }),
    ]),
    el('div', { class: 'card-body' }, [
      el('textarea', {
        data: { focusId: 'sql-console-query' },
        value: sql.query,
        oninput: (e) => { state.sqlConsole.query = e.target.value; },
        placeholder: 'SELECT ref, tool, url FROM results LIMIT 20',
        style: {
          width: '100%',
          minHeight: '92px',
          resize: 'vertical',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          padding: '10px 12px',
          fontFamily: 'var(--mono)',
          fontSize: '11px',
          lineHeight: '1.5',
          outline: 'none',
        },
      }),
      el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' } }, [
        el('button', {
          class: 'mini-btn',
          onclick: () => runSqlQuery(),
          disabled: sql.loading ? 'disabled' : null,
        }, [I.database(), sql.loading ? ' Running…' : ' Run query']),
        el('button', {
          class: 'mini-btn',
          onclick: () => runSqlListTables(),
          disabled: sql.loading ? 'disabled' : null,
        }, [I.tools(), ' List tables']),
        el('button', {
          class: 'mini-btn',
          onclick: () => {
            state.sqlConsole.query = 'SELECT ref, tool, url, created_at FROM results ORDER BY created_at DESC LIMIT 20';
            state.sqlConsole.error = '';
            rerenderContent();
          },
        }, [I.refresh(), ' Reset sample']),
      ]),
      sql.error ? el('div', {
        style: {
          marginTop: '10px',
          padding: '9px 10px',
          borderRadius: '8px',
          border: '1px solid rgba(255,107,107,0.25)',
          background: 'var(--danger-soft)',
          color: 'var(--danger)',
          fontSize: '11px',
        },
        text: sql.error,
      }) : null,
      sql.result ? el('div', { style: { marginTop: '12px' } }, [
        el('div', { class: 'csub', style: { marginBottom: '8px' }, text: renderSqlSummary(sql.result) }),
        rows.length
          ? el('div', {
              data: { scrollId: 'sql-result-table' },
              style: {
                overflowX: 'auto',
                border: '1px solid var(--border)',
                borderRadius: '8px',
              },
            }, [renderSqlTable(columns, rows)])
          : el('pre', {
              data: { scrollId: 'sql-result-json' },
              class: 'json-block',
              style: {
                margin: 0,
                maxHeight: '240px',
                overflow: 'auto',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '10px',
                background: 'var(--surface)',
              },
            }, [jsonHL(JSON.stringify(sql.result, null, 2))]),
      ]) : null,
    ]),
  ]);
}

function renderSqlSummary(result) {
  if (!result?.ok) return 'Query failed';
  const data = result.data ?? {};
  if (Array.isArray(data.tables)) return `${data.tables.length} tables`;
  if (Array.isArray(data.rows)) return `${data.rows.length} rows`;
  if (data.filename) return `${data.rows ?? 0} rows exported`;
  return 'Query completed';
}

function renderSqlTable(columns, rows) {
  const table = el('table', {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '11px',
      fontFamily: 'var(--mono)',
      minWidth: '420px',
    },
  });

  table.append(el('thead', {}, [
    el('tr', {}, columns.map((column) => el('th', {
      text: column,
      style: {
        textAlign: 'left',
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
        color: 'var(--text-2)',
        fontWeight: '600',
      },
    }))),
  ]));

  table.append(el('tbody', {}, rows.slice(0, 100).map((row) => el('tr', {}, columns.map((column) => {
    const value = row?.[column];
    const text = value == null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    return el('td', {
      text,
      style: {
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        color: 'var(--text)',
        verticalAlign: 'top',
      },
    });
  })))));

  return table;
}

/* ----- analytics view ----- */
function renderAnalyticsView() {
  const wrap = el('div', { class: 'panel' });
  const a = state.analytics;

  // Derive stats from mcpEvents for accuracy (background recentRequests is limited to 8)
  const mcpEvents = a.mcpEvents || [];
  const outEvents = mcpEvents.filter(e => e.direction === 'out');
  const inEvents  = mcpEvents.filter(e => e.direction === 'in');

  const total       = (a.completedCalls || 0) || outEvents.length;
  const failedCalls = (a.failedCalls || 0)    || outEvents.filter(e => e.ok === false).length;
  const success     = Math.max(0, total - failedCalls);
  const successRate = total ? ((success / total) * 100) : 100;

  const latencies   = outEvents.filter(r => Number.isFinite(r.durationMs)).map(r => r.durationMs);
  const avgDurationMs = (a.avgDurationMs || 0) || (latencies.length ? Math.round(latencies.reduce((s,n)=>s+n,0)/latencies.length) : 0);

  // sparkline from last 10 × 5-min buckets
  const { data: cpmData, labels: cpmLabels } = calls5MinBuckets(mcpEvents);
  const sparkData = cpmData.slice(-10);

  // KPI grid
  wrap.append(el('div', { class: 'kpi-grid' }, [
    kpiCard('Calls today', String(total), '', `${failedCalls} failed · ${a.activeCalls ?? 0} live`, sparkData),
    kpiCard('Avg latency', String(Math.round(avgDurationMs)), 'ms', `${a.activeCalls ?? 0} in flight`, [avgDurationMs], '#3ecf8e'),
    kpiCard('Success rate', successRate.toFixed(successRate === 100 ? 0 : 1), '%', `${failedCalls} errors · ${success} ok`, [Math.max(50, successRate - 5), successRate, successRate], '#3ecf8e'),
    kpiCard('Active session', formatUptime(state.bridgeConnectedSince ?? state.startedAt), '', a.bridgeConnected ? 'bridge connected' : 'bridge offline', [1, 1, 1], '#f5b14b'),
  ]));

  // calls per 5-min line chart (1 hour)
  const cpmTotal = cpmData.reduce((s, n) => s + n, 0);
  wrap.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('div', { class: 'ctitle', text: 'Calls — last 1 hour' }),
        el('div', { class: 'csub', style: { marginTop: '2px' }, text: '5-min buckets · all tools' }),
      ]),
      el('div', { class: 'csub', text: `${cpmTotal} total` }),
    ]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'chart-wrap' }, [
        lineChart(cpmData, cpmLabels, v => String(v), 'No calls in the last hour'),
      ]),
    ]),
  ]));

  // latency line chart — last 100 calls via paired in/out mcpEvents
  const latencyData = latencyFromEvents(mcpEvents, 100);
  wrap.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('div', { class: 'ctitle', text: 'Latency' }),
        el('div', { class: 'csub', style: { marginTop: '2px' }, text: `${latencyData.length} most recent calls` }),
      ]),
      el('div', { class: 'csub', text: latencyData.length ? `${Math.round(latencyData.reduce((s,n)=>s+n,0)/latencyData.length)}ms avg` : '—' }),
    ]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'chart-wrap' }, [
        lineChart(latencyData, [], v => `${v}ms`, 'No latency data yet'),
      ]),
    ]),
  ]));

  // top tools — use mcpEvents for full history
  const stats = callStatsByEvents(mcpEvents);
  const ranked = [...stats.entries()].sort((x, y) => y[1].calls - x[1].calls).slice(0, 5);
  const topMax = ranked[0]?.[1].calls || 1;
  wrap.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', { class: 'ctitle', text: 'Top tools' }),
      el('div', { class: 'csub', text: `${stats.size} unique` }),
    ]),
    el('div', { class: 'card-body', style: { paddingTop: '4px' } }, ranked.length ? ranked.map(([name, s]) => el('div', { class: 'tool-row' }, [
      el('div', { class: 'tool-name', text: name }),
      el('div', { class: 'bar-bg' }, [el('div', { class: 'bar-fill', style: { width: `${(s.calls / topMax) * 100}%` } })]),
      el('div', { class: 'tool-stats' }, [el('b', { text: String(s.calls) }), ` · ${s.avgMs}ms`]),
    ])) : [el('div', { class: 'empty', text: 'No tool calls yet.' })]),
  ]));

  return wrap;
}

function kpiCard(label, value, unit, sub, sparkData, color = 'var(--accent)') {
  return el('div', { class: 'kpi' }, [
    el('div', { class: 'kpi-label', text: label }),
    el('div', { class: 'kpi-value' }, [
      String(value),
      unit ? el('span', { class: 'unit', text: unit }) : null,
    ]),
    el('div', { class: 'kpi-sub', text: sub }),
    sparkline(sparkData, color),
  ]);
}

/* ----- activity view ----- */
function renderActivityView() {
  const wrap = document.createDocumentFragment();

  // Status filter pills
  wrap.append(renderPills([
    { value: 'all',  label: 'All' },
    { value: 'ok',   label: 'OK' },
    { value: 'warn', label: 'Slow' },
    { value: 'err',  label: 'Error' },
    { value: 'info', label: 'Pending' },
  ], state.activityStatusFilter, (v) => { state.activityStatusFilter = v; rerenderContent(); }));

  const bar = el('div', { class: 'search-bar' }, [
    el('input', {
      data: { focusId: 'activity-log-search' },
      class: 'search-input',
      placeholder: 'Filter logs…',
      value: state.activityQuery,
      oninput: (e) => { state.activityQuery = e.target.value; rerenderContent(); },
    }),
    el('button', { class: 'mini-btn', title: 'Export logs', onclick: () => exportMcpJson() }, [I.download(), ' Export']),
    el('button', { class: 'mini-btn', title: 'Clear logs', onclick: () => clearTimeline() }, [I.clear()]),
  ]);
  wrap.append(bar);

  const q = state.activityQuery.toLowerCase();
  const mcpEvents = state.analytics.mcpEvents || [];

  // Build activity rows from mcpEvents (direction='in' = call initiated)
  // Pair with direction='out' events for status/duration
  const outByRequestId = new Map();
  for (const ev of mcpEvents) {
    if (ev.direction !== 'out') continue;
    const key = ev.requestId || ev.id;
    if (key) outByRequestId.set(key, ev);
  }

  // Convert inbound events to log rows
  const fromEvents = mcpEvents
    .filter(ev => ev.direction === 'in')
    .map(ev => {
      const key = ev.requestId || ev.id;
      const paired = key ? outByRequestId.get(key) : null;
      const ok   = paired ? paired.ok : undefined;
      let dur    = paired?.durationMs;
      if (!Number.isFinite(dur) && paired?.timestamp && ev.timestamp) {
        const d = new Date(paired.timestamp).getTime() - new Date(ev.timestamp).getTime();
        if (d >= 0) dur = d;
      }
      const ts   = ev.timestamp;

      let lvl = 'info';
      let note = '';
      if (ok === false)                              { lvl = 'err';  note = paired?.error || 'failed'; }
      else if (ok === true && Number.isFinite(dur) && dur > 200) { lvl = 'warn'; note = 'slow'; }
      else if (ok === true)                          { lvl = 'ok'; }

      return { method: ev.method, ts, lvl, note, dur };
    });

  // Also include recentRequests that aren't already covered (active/failed ones)
  const fromRequests = [...(state.analytics.activeRequests || []), ...(state.analytics.recentRequests || [])]
    .map(r => {
      let lvl = 'ok';
      let note = '';
      if (r.ok === false)                                              { lvl = 'err';  note = r.error || 'failed'; }
      else if (Number.isFinite(r.durationMs) && r.durationMs > 200)   { lvl = 'warn'; note = 'slow'; }
      else if (!r.ok && r.startedAt && !Number.isFinite(r.durationMs)){ lvl = 'info'; }
      return { method: r.method, ts: r.startedAt || r.timestamp, lvl, note, dur: r.durationMs };
    });

  // Merge: prefer fromEvents (larger history), add fromRequests not duplicated
  const eventMethods = new Set(fromEvents.map(r => r.method + '|' + r.ts));
  const extra = fromRequests.filter(r => !eventMethods.has(r.method + '|' + r.ts));
  const all = [...fromEvents, ...extra]
    .filter(r => !q || (r.method || '').toLowerCase().includes(q) || (r.note || '').toLowerCase().includes(q))
    .filter(r => state.activityStatusFilter === 'all' || r.lvl === state.activityStatusFilter)
    .sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime())
    .slice(0, 100);

  const list = el('div', {});
  if (!all.length) {
    list.append(el('div', { class: 'empty', text: state.activityStatusFilter !== 'all' ? 'No entries match this filter.' : 'No activity recorded yet.' }));
  } else {
    for (const r of all) {
      list.append(el('div', { class: 'log-row' }, [
        el('span', { class: 'lvl ' + r.lvl }),
        el('span', { class: 'log-time', text: formatHMS(r.ts) }),
        el('span', { class: 'log-msg' }, [
          el('span', { class: 'nm', text: r.method || '—' }),
          r.note ? el('span', { style: { color: r.lvl === 'err' ? 'var(--danger)' : r.lvl === 'warn' ? 'var(--warn)' : 'var(--text-3)', marginLeft: '6px' }, text: '· ' + r.note }) : null,
        ]),
        el('span', { class: 'log-dur', text: formatDuration(r.dur) }),
      ]));
    }
  }
  wrap.append(list);
  return wrap;
}

/* ----- settings view ----- */
function renderSettingsView() {
  const wrap = el('div', { class: 'panel' });
  const a = state.analytics;

  wrap.append(el('div', { class: 'section-title', text: 'Connection' }));
  wrap.append(el('div', { class: 'card', style: { marginBottom: '14px' } }, [
    el('div', { class: 'card-body' }, [
      el('div', { class: 'field' }, [
        el('div', { class: 'field-label', text: 'Bridge status' }),
        el('input', { class: 'field-input', readonly: 'readonly', value: a.bridgeConnected ? 'connected' : a.pairing === 'required' ? 'waiting for pairing — paste the bridge token below' : 'disconnected — start the MCP server' }),
      ]),
      el('div', { class: 'field' }, [
        el('div', { class: 'field-label', text: 'Bridge' }),
        el('input', { class: 'field-input', readonly: 'readonly', value: 'ws://127.0.0.1:47821' }),
      ]),
      el('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } }, [
        el('button', { class: 'mini-btn', onclick: () => refreshStatus() }, [I.refresh(), ' Reconnect']),
        el('button', { class: 'mini-btn', onclick: () => alert('To rotate the bridge token, delete ~/.fileforge/bridge-token and restart the MCP server, then paste the new token below if pairing is on.') }, [I.shield(), ' Rotate token']),
      ]),
    ]),
  ]));

  wrap.append(el('div', { class: 'section-title', text: 'Pairing' }));
  wrap.append(el('div', { class: 'card', style: { marginBottom: '14px' } }, [
    el('div', { class: 'card-body' }, [
      el('div', { class: 'field' }, [
        el('div', { class: 'field-label', text: 'Status' }),
        el('input', { class: 'field-input', readonly: 'readonly', value: pairingStatusText(a) }),
      ]),
      el('div', { class: 'field' }, [
        el('div', { class: 'field-label', text: 'Bridge token (from fileforge-pair or npm run pair)' }),
        el('input', {
          class: 'field-input',
          type: 'password',
          autocomplete: 'off',
          spellcheck: 'false',
          placeholder: a.hasBridgeToken ? 'saved — paste a new one to replace it' : '64 hex characters',
          data: { focusId: 'bridge-token' },
        }),
      ]),
      el('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' } }, [
        el('button', { class: 'mini-btn', onclick: (event) => saveBridgeToken(event.currentTarget.closest('.card-body')) }, [I.shield(), ' Save']),
        a.hasBridgeToken ? el('button', { class: 'mini-btn', onclick: () => saveBridgeToken(null) }, [I.clear(), ' Forget']) : null,
        el('span', { class: 'row-sub', id: 'pairing-note' }),
      ]),
    ]),
  ]));

  wrap.append(el('div', { class: 'section-title', text: 'Behavior' }));
  wrap.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-body', style: { paddingTop: '0', paddingBottom: '0' } }, [
      settingsToggle('autoReplay', 'Auto-replay failed calls', 'retry 1× with linear backoff'),
      settingsToggle('streamResults', 'Stream tool results', 'render JSON as it arrives'),
      settingsToggle('prettyJson', 'Pretty-print JSON', 'syntax-highlight responses'),
      settingsToggle('notifyErrors', 'Notify on errors', 'desktop notification'),
    ]),
  ]));

  wrap.append(el('div', { class: 'section-title', style: { marginTop: '14px' }, text: 'Data' }));
  wrap.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-body', style: { paddingTop: '0', paddingBottom: '0' } }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'row-text' }, [
          el('div', { class: 'row-title', text: 'Export session' }),
          el('div', { class: 'row-sub', text: `.json · ${(state.analytics.mcpEvents || []).length} entries` }),
        ]),
        el('button', { class: 'mini-btn', onclick: () => exportMcpJson() }, [I.download(), ' Export']),
      ]),
      el('div', { class: 'row' }, [
        el('div', { class: 'row-text' }, [
          el('div', { class: 'row-title', text: 'Clear timeline' }),
          el('div', { class: 'row-sub', text: 'resets local filters and search' }),
        ]),
        el('button', { class: 'mini-btn', style: { color: 'var(--danger)' }, onclick: () => clearTimeline() }, [I.clear(), ' Clear']),
      ]),
    ]),
  ]));

  return wrap;
}

function pairingStatusText(a) {
  if (a.pairing === 'required') return 'required by the server — not paired';
  if (a.pairing === 'paired') return 'paired';
  if (a.pairing === 'off') return a.hasBridgeToken ? 'not required by this server (token saved)' : 'not required by this server';
  return 'unknown until the bridge connects';
}

// body is the pairing card's body, or null to forget the saved token.
async function saveBridgeToken(body) {
  const token = body ? body.querySelector('input[type="password"]').value.trim() : '';
  if (body && !token) return;
  const r = await chrome.runtime.sendMessage({ type: 'fileforge-save-bridge-token', token }).catch((err) => ({ ok: false, error: { message: err.message } }));
  const note = shell.querySelector('#pairing-note');
  if (note) note.textContent = r?.ok ? (token ? 'saved — reconnecting…' : 'forgotten') : (r?.error?.message ?? 'save failed');
  if (r?.ok) setTimeout(() => refreshStatus(), 4000);
}

function settingsToggle(key, title, sub) {
  return el('div', { class: 'row' }, [
    el('div', { class: 'row-text' }, [
      el('div', { class: 'row-title', text: title }),
      el('div', { class: 'row-sub', text: sub }),
    ]),
    el('div', {
      class: 'toggle' + (state.settings[key] ? ' on' : ''),
      onclick: () => {
        state.settings[key] = !state.settings[key];
        chrome.storage?.local.set({ 'fileforge.settings': state.settings }).catch(() => {});
        rerenderContent();
      },
    }),
  ]);
}

/* ----- partial rerender of content only ----- */
function rerenderContent() {
  const existing = shell.querySelector('#content');
  if (!existing) { render(); return; }

  const focusSnapshot = captureContentFocus(existing);

  const namedScrolls = captureNamedScrolls(existing);

  const next = renderContent();
  existing.replaceChildren(...next.childNodes);

  restoreContentFocus(existing, focusSnapshot);
  restoreNamedScrolls(existing, namedScrolls);
}

function clearTimeline() {
  state.activityQuery = '';
  state.activityStatusFilter = 'all';
  rerenderContent();
}

/* ----- messaging ----- */
async function exportMcpJson() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'fileforge-export-mcp-json' });
    if (!r?.ok) throw new Error(r?.error?.message || 'Export failed');
  } catch (err) {
    console.warn('[FileForge] Export failed:', err.message);
  }
}

async function refreshStatus() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'fileforge-status' });
    if (r) applyAnalytics(r);
  } catch {
    applyAnalytics({ bridgeConnected: false });
  }
}

async function callServerTool(tool, params) {
  const response = await chrome.runtime.sendMessage({ type: 'fileforge-run-server-tool', tool, params });
  if (!response?.ok) throw new Error(response?.error?.message || 'Server tool call failed');
  return response;
}

async function runSqlQuery() {
  state.sqlConsole.loading = true;
  state.sqlConsole.error = '';
  rerenderContent();
  try {
    state.sqlConsole.result = await callServerTool('fileforge_sql_action', {
      action: 'query',
      query: state.sqlConsole.query,
    });
  } catch (err) {
    state.sqlConsole.result = null;
    state.sqlConsole.error = err.message;
  } finally {
    state.sqlConsole.loading = false;
    rerenderContent();
  }
}

async function runSqlListTables() {
  state.sqlConsole.loading = true;
  state.sqlConsole.error = '';
  rerenderContent();
  try {
    state.sqlConsole.result = await callServerTool('fileforge_sql_action', {
      action: 'list_tables',
    });
  } catch (err) {
    state.sqlConsole.result = null;
    state.sqlConsole.error = err.message;
  } finally {
    state.sqlConsole.loading = false;
    rerenderContent();
  }
}

function applyAnalytics(analytics = {}) {
  state.analytics = analytics;
  if (analytics.bridgeConnected && !state.bridgeConnectedSince) {
    state.bridgeConnectedSince = Date.now();
  } else if (!analytics.bridgeConnected) {
    state.bridgeConnectedSince = null;
  }
  const oldHeader = shell.querySelector('.header');
  if (oldHeader) oldHeader.replaceWith(renderHeader());
  if (hasFocusedEditorInContent()) return;
  rerenderContent();
}

/* ----- init ----- */
async function init() {
  try {
    const { 'fileforge.settings': stored } = await chrome.storage?.local.get('fileforge.settings');
    if (stored && typeof stored === 'object') state.settings = { ...DEFAULT_SETTINGS, ...stored };
  } catch {}

  // Allow deep-linking to a tab via URL hash, e.g. popup.html#tools
  const hashTab = window.location.hash.slice(1);
  if (['tools', 'analytics', 'activity', 'settings'].includes(hashTab)) {
    state.tab = hashTab;
  }

  render();

  await refreshStatus();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'fileforge-analytics-update') {
      applyAnalytics(msg.analytics || {});
    }
  });

  setInterval(() => {
    if (state.tab === 'analytics') {
      const tb = shell.querySelector('.header');
      if (tb) tb.replaceWith(renderHeader());
    }
  }, 1000);

  setInterval(() => {
    refreshStatus().catch(() => null);
  }, 2000);
}

init();
