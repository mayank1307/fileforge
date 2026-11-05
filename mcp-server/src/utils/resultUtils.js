import { resultStore } from '../stores/resultStore.js';

export function makeRef(prefix) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${rand}`;
}

export function summarizeData(data) {
  if (Array.isArray(data)) return { type: 'array', count: data.length };
  if (!data || typeof data !== 'object') return { type: typeof data };

  const summary = { type: 'object', keys: Object.keys(data).slice(0, 30) };
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) summary[key] = { type: 'array', count: value.length };
    else if (value && typeof value === 'object') summary[key] = { type: 'object', keys: Object.keys(value).slice(0, 10) };
    else summary[key] = value;
  }
  return summary;
}

export function saveResult({ prefix, tool, url, project = 'default', data, summary = summarizeData(data) }) {
  const ref = makeRef(prefix);
  resultStore.save({ ref, tool, url, project, data, summary });
  return { ref, summary };
}

export function maybeStoreResult({ store, prefix, tool, url, project, data, summary }) {
  if (!store) return { data };
  return saveResult({ prefix, tool, url, project, data, summary });
}

export function sliceData(data, offset = 0, limit = 100) {
  if (Array.isArray(data)) return { items: data.slice(offset, offset + limit), total: data.length };
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) return { key, items: value.slice(offset, offset + limit), total: value.length };
    }
  }
  return { data };
}

export function compactText(text, maxLength = 1200) {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}
