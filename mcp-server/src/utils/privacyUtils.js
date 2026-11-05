const DATA_URL_RE = /^data:([^;,]+)(;base64)?,/i;
const SECRET_KEY_RE = /(?:authorization|cookie|set-cookie|api[_-]?key|apikey|secret|token|jwt|bearer|private[_-]?key|privatekey|password|passwd|session|csrf|xsrf)/i;
const SECRET_VALUE_RE = /\b(?:bearer\s+[a-z0-9._~+/=-]{12,}|sk-[a-z0-9_-]{12,}|eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,})\b/i;

export function isDataUrl(value) {
  return typeof value === 'string' && DATA_URL_RE.test(value);
}

export function compactValue(value, maxLength = 180) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function redactValue(value, { preview = true } = {}) {
  if (value == null) return value;
  const text = String(value);
  if (!text) return '';
  if (!preview || text.length <= 8) return '[REDACTED]';
  return `${text.slice(0, 4)}...[REDACTED:${text.length}]`;
}

export function looksSensitive(key, value) {
  return SECRET_KEY_RE.test(String(key ?? '')) || SECRET_VALUE_RE.test(String(value ?? ''));
}

export function redactedFinding({ namespace, key, value, url, risk = 'high', reason = 'Sensitive value detected' }) {
  const location = namespace ? `${namespace}.${key}` : String(key);
  return {
    location,
    namespace,
    key,
    risk,
    reason,
    value: '[REDACTED]',
    preview: redactValue(value),
    canReveal: true,
    revealRequiresExplicitRequest: true,
    url,
  };
}

export function revealScopedValue(entries = [], { namespace, key, location }) {
  const wantedLocation = location ?? (namespace && key ? `${namespace}.${key}` : undefined);
  const match = entries.find((entry) => {
    const entryLocation = entry.location ?? `${entry.namespace}.${entry.key}`;
    return wantedLocation ? entryLocation === wantedLocation : entry.namespace === namespace && entry.key === key;
  });
  if (!match) {
    return { ok: false, error: { code: 'VALUE_NOT_FOUND', message: `No sensitive value found for ${wantedLocation ?? `${namespace}.${key}`}.` } };
  }
  return {
    ok: true,
    data: {
      location: match.location ?? `${match.namespace}.${match.key}`,
      namespace: match.namespace,
      key: match.key,
      value: match.value,
      revealedAt: new Date().toISOString(),
      revealPolicy: 'explicit-agent-request',
    },
  };
}

// Tools that return raw secret values are off unless the user opts in for the process.
export const SECRET_REVEAL_ENV = 'FILEFORGE_ALLOW_SECRET_REVEAL';

export function secretRevealBlocked(tool, env = process.env) {
  if (env[SECRET_REVEAL_ENV] === '1') return null;
  return {
    ok: false,
    error: {
      code: 'SECRET_REVEAL_DISABLED',
      message: `Revealing raw secret values is disabled. Set ${SECRET_REVEAL_ENV}=1 in the MCP server environment to enable it.`,
    },
    meta: { tool },
  };
}

export function sanitizeForLog(value, depth = 0) {
  if (value == null || typeof value !== 'object') {
    if (isDataUrl(value)) {
      const mime = DATA_URL_RE.exec(value)?.[1] ?? 'unknown';
      return `[DATA_URL:${mime}:${String(value).length} chars]`;
    }
    if (typeof value === 'string' && SECRET_VALUE_RE.test(value)) return redactValue(value);
    return compactValue(value);
  }
  if (depth > 4) return '[MaxDepth]';
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeForLog(item, depth + 1));
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (looksSensitive(key, child)) {
      result[key] = redactValue(child);
    } else {
      result[key] = sanitizeForLog(child, depth + 1);
    }
  }
  return result;
}

export function sanitizeHar(har = {}) {
  const clone = JSON.parse(JSON.stringify(har ?? {}));
  const entries = clone.log?.entries ?? [];
  for (const entry of entries) {
    for (const side of ['request', 'response']) {
      const item = entry[side];
      if (!item) continue;
      item.headers = (item.headers ?? []).map((header) => ({
        ...header,
        value: looksSensitive(header.name, header.value) ? redactValue(header.value) : header.value,
      }));
      if (item.postData?.text) item.postData.text = looksSensitive('postData', item.postData.text) ? redactValue(item.postData.text) : compactValue(item.postData.text, 2000);
      if (item.content?.text) item.content.text = looksSensitive('content', item.content.text) ? redactValue(item.content.text) : compactValue(item.content.text, 2000);
    }
  }
  return clone;
}

export function summarizeHar(har = {}) {
  const entries = har.log?.entries ?? [];
  const byDomain = {};
  let failed = 0;
  let blockedOrAborted = 0;
  let transferBytes = 0;
  for (const entry of entries) {
    let domain = 'unknown';
    try {
      domain = new URL(entry.request?.url).hostname;
    } catch {}
    byDomain[domain] = (byDomain[domain] ?? 0) + 1;
    const status = entry.response?.status ?? 0;
    if (status >= 400) failed += 1;
    if (!status) blockedOrAborted += 1;
    const size = entry.response?.content?.size ?? entry.response?.bodySize ?? 0;
    if (Number.isFinite(size) && size > 0) transferBytes += size;
  }
  return {
    entries: entries.length,
    failed,
    blockedOrAborted,
    transferBytes,
    domains: Object.entries(byDomain).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([domain, requests]) => ({ domain, requests })),
    redacted: true,
  };
}
