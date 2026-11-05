import { registry } from '../registry.js';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { maybeStoreResult } from '../utils/resultUtils.js';
import { dataUriSummary, parseDataUri } from '../utils/dataUriUtils.js';
import { makeActionTool } from '../utils/actionToolUtils.js';
import { fileforgeUri } from '../utils/fileforgeUri.js';

const RESOURCE_DIR = join(homedir(), '.fileforge', 'resources');
const ARTIFACT_DIR = join(homedir(), '.fileforge', 'artifacts');
mkdirSync(RESOURCE_DIR, { recursive: true, mode: 0o700 });
mkdirSync(ARTIFACT_DIR, { recursive: true, mode: 0o700 });

function parseCsv(text, delimiter = ',') {
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(delimiter).map((v) => v.trim()));
  const [headers, ...body] = rows;
  if (!headers) return [];
  return body.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function pathFromUrl(url) {
  if (url.startsWith('file://')) return fileURLToPath(url);
  return url;
}

async function loadResource(url) {
  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      buffer,
      meta: {
        url: response.url,
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type') ?? undefined,
      },
    };
  }
  const filePath = pathFromUrl(url);
  return { buffer: readFileSync(filePath), meta: { url: filePath, contentType: undefined } };
}

function inferFormat(url, contentType, explicit) {
  if (explicit) return explicit.toLowerCase();
  if (contentType?.includes('json')) return 'json';
  if (contentType?.includes('csv')) return 'csv';
  if (contentType?.includes('html')) return 'html';
  if (contentType?.includes('xml')) return 'xml';
  if (contentType?.startsWith('text/')) return 'text';
  const ext = extname(new URL(url, 'file:///').pathname).slice(1).toLowerCase();
  return ext || 'binary';
}

function parseBuffer(buffer, format) {
  const text = buffer.toString('utf8');
  if (format === 'json') return { text, parsed: JSON.parse(text) };
  if (format === 'csv') return { text, rows: parseCsv(text) };
  if (format === 'tsv') return { text, rows: parseCsv(text, '\t') };
  if (['txt', 'text', 'html', 'xml', 'md', 'markdown'].includes(format)) return { text };
  return { note: `No parser available for ${format}; resource saved/fetched as binary.`, size: buffer.length };
}

function stringifyConversion(parsed, to) {
  if (to === 'json') return JSON.stringify(parsed.rows ?? parsed.parsed ?? parsed.text, null, 2);
  if (to === 'csv' && Array.isArray(parsed.rows)) {
    const headers = Object.keys(parsed.rows[0] ?? {});
    return [headers.join(','), ...parsed.rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(','))].join('\n');
  }
  if (to === 'tsv' && Array.isArray(parsed.rows)) {
    const headers = Object.keys(parsed.rows[0] ?? {});
    return [headers.join('\t'), ...parsed.rows.map((row) => headers.map((h) => String(row[h] ?? '')).join('\t'))].join('\n');
  }
  if (['txt', 'text'].includes(to)) return parsed.text ?? JSON.stringify(parsed.parsed ?? parsed.rows ?? parsed, null, 2);
  throw new Error(`Conversion to ${to} is not supported for this resource.`);
}

function safeSegment(value, fallback) {
  const segment = String(value || fallback)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return segment || fallback;
}

function runId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `run_${stamp}_${rand}`;
}

function saveDataUriArtifact({ buffer, extension, mime, project = 'default', run = runId(), name = 'data-uri' }) {
  const safeProject = safeSegment(project, 'default');
  const safeRun = safeSegment(run, 'run');
  const safeName = safeSegment(name, 'data-uri');
  const safeExt = safeSegment(extension, 'bin');
  const dir = join(ARTIFACT_DIR, safeProject, safeRun, 'data-uris');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fullPath = join(dir, `${safeName}.${safeExt}`);
  writeFileSync(fullPath, buffer);
  return {
    artifact: fileforgeUri(fullPath),
    artifactPath: fullPath,
    filename: basename(fullPath),
    mime,
    extension: safeExt,
    sizeBytes: buffer.length,
    size: `${Math.round(buffer.length / 1024)}KB`,
    project: safeProject,
    run: safeRun,
    createdAt: new Date().toISOString(),
  };
}

const actionDefs = [
  {
    name: 'fileforge_file_convert',
    description: 'Convert a file to another format.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL or local path of the file' },
        from: { type: 'string', description: 'Source format' },
        to: { type: 'string', description: 'Target format' },
      },
      required: ['url', 'to'],
    },
    handler: async (p) => {
      const { buffer, meta } = await loadResource(p.url);
      const from = inferFormat(p.url, meta.contentType, p.from);
      const parsed = parseBuffer(buffer, from);
      const contents = stringifyConversion(parsed, p.to.toLowerCase());
      const filename = join(RESOURCE_DIR, `${basename(p.url).replace(/\W+/g, '_') || 'resource'}.${p.to}`);
      writeFileSync(filename, contents);
      return { ok: true, data: { filename, from, to: p.to, bytes: contents.length }, meta: { tool: 'fileforge_file_convert' } };
    },
  },
  {
    name: 'fileforge_file_extract_text',
    description: 'Extract plain text from a file (PDF, DOCX, etc.).',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
    handler: async (p) => {
      const { buffer, meta } = await loadResource(p.url);
      const format = inferFormat(p.url, meta.contentType);
      const parsed = parseBuffer(buffer, format);
      if (!parsed.text) return { ok: false, error: { code: 'UNSUPPORTED_FILE', message: `Text extraction is not available for ${format}` } };
      return { ok: true, data: { url: meta.url, format, text: parsed.text }, meta: { tool: 'fileforge_file_extract_text' } };
    },
  },
  {
    name: 'fileforge_file_parse_data_uri',
    description: 'Parse and decode a Data URI.',
    inputSchema: {
      type: 'object',
      properties: {
        dataUri: { type: 'string' },
        textPreviewLimit: { type: 'number', default: 1200 },
      },
      required: ['dataUri'],
    },
    handler: async (p) => {
      const { buffer, ...data } = parseDataUri(p.dataUri, { textPreviewLimit: p.textPreviewLimit ?? 1200 });
      return { ok: true, data, meta: { tool: 'fileforge_file_parse_data_uri', size: buffer.length } };
    },
  },
  {
    name: 'fileforge_file_inspect_data_uri',
    description: 'Inspect a Data URI: MIME, encoding, decoded size, preview-safe text, image dimensions, and warnings.',
    inputSchema: {
      type: 'object',
      properties: {
        dataUri: { type: 'string' },
        includeTextPreview: { type: 'boolean', default: true },
        textPreviewLimit: { type: 'number', default: 1200 },
      },
      required: ['dataUri'],
    },
    handler: async (p) => {
      const data = p.includeTextPreview === false
        ? dataUriSummary(p.dataUri, { decode: false })
        : dataUriSummary(p.dataUri, { textPreviewLimit: p.textPreviewLimit ?? 1200 });
      return { ok: true, data, meta: { tool: 'fileforge_file_inspect_data_uri' } };
    },
  },
  {
    name: 'fileforge_file_decode_data_uri',
    description: 'Decode a Data URI into a local artifact and return compact metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        dataUri: { type: 'string' },
        project: { type: 'string', default: 'default' },
        run: { type: 'string' },
        name: { type: 'string', default: 'data-uri' },
        includeTextPreview: { type: 'boolean', default: true },
      },
      required: ['dataUri'],
    },
    handler: async (p) => {
      const parsed = parseDataUri(p.dataUri);
      const artifact = saveDataUriArtifact({
        buffer: parsed.buffer,
        extension: parsed.extension,
        mime: parsed.mime,
        project: p.project,
        run: p.run,
        name: p.name,
      });
      const { buffer: _buffer, textPreview, jsonPreview, ...summary } = parsed;
      if (p.includeTextPreview !== false && textPreview) summary.textPreview = textPreview;
      if (p.includeTextPreview !== false && jsonPreview) summary.jsonPreview = jsonPreview;
      return { ok: true, data: { ...summary, ...artifact }, meta: { tool: 'fileforge_file_decode_data_uri' } };
    },
  },
  {
    name: 'fileforge_file_extract_data_uris_from_page',
    description: 'Find Data URIs embedded in the active page DOM, styles, links, images, media, and scripts.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', default: 'active' },
        store: { type: 'boolean', default: true },
        project: { type: 'string', default: 'default' },
        limit: { type: 'number', default: 200 },
      },
    },
    handler: async (p, { rpcClient }) => {
      const response = await rpcClient.send('scrape.page', { ...p, sections: ['dataUris'] });
      if (!response?.ok) return response;
      const data = response.data ?? response;
      const dataUris = data?.dataUris ?? {};
      const summary = {
        url: data?.url,
        total: dataUris.summary?.total ?? dataUris.items?.length ?? 0,
        byCategory: dataUris.summary?.byCategory ?? {},
        bySource: dataUris.summary?.bySource ?? {},
        large: dataUris.summary?.large ?? 0,
        previews: (dataUris.items ?? []).slice(0, 12).map((item) => ({
          source: item.source,
          selector: item.selector,
          mime: item.mime,
          category: item.category,
          size: item.size,
          dimensions: item.dimensions,
        })),
      };
      const stored = maybeStoreResult({
        store: p.store ?? true,
        prefix: 'file_data_uris',
        tool: 'fileforge_file_extract_data_uris_from_page',
        url: data?.url,
        project: p.project ?? 'default',
        data,
        summary,
      });
      return { ok: true, ...stored, meta: { tool: 'fileforge_file_extract_data_uris_from_page', url: data?.url } };
    },
  },
  {
    name: 'fileforge_file_convert_data_uri_image',
    description: 'Convert an image Data URI to PNG, JPEG, or WebP using the browser canvas and store it as an artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        dataUri: { type: 'string' },
        format: { type: 'string', enum: ['png', 'jpeg', 'jpg', 'webp'], default: 'png' },
        quality: { type: 'number', default: 0.92 },
        tabId: { type: 'string', default: 'active' },
        project: { type: 'string', default: 'default' },
        run: { type: 'string' },
        name: { type: 'string', default: 'converted-data-uri' },
      },
      required: ['dataUri'],
    },
    handler: async (p, { rpcClient }) => {
      const inspected = dataUriSummary(p.dataUri, { decode: false });
      if (inspected.category !== 'image') {
        return { ok: false, error: { code: 'UNSUPPORTED_DATA_URI', message: `Expected an image Data URI, got ${inspected.mime}.` }, meta: { tool: 'fileforge_file_convert_data_uri_image' } };
      }
      const targetFormat = (p.format ?? 'png').toLowerCase() === 'jpg' ? 'jpeg' : (p.format ?? 'png').toLowerCase();
      const response = await rpcClient.send('scrape.convertDataUriImage', {
        tabId: p.tabId ?? 'active',
        dataUri: p.dataUri,
        format: targetFormat,
        quality: p.quality ?? 0.92,
      });
      if (!response?.ok) return response;
      const converted = parseDataUri(response.data.dataUri);
      const artifact = saveDataUriArtifact({
        buffer: converted.buffer,
        extension: targetFormat === 'jpeg' ? 'jpg' : targetFormat,
        mime: converted.mime,
        project: p.project,
        run: p.run,
        name: p.name,
      });
      const { buffer: _buffer, ...summary } = converted;
      return {
        ok: true,
        data: {
          source: inspected,
          converted: summary,
          ...artifact,
        },
        meta: { tool: 'fileforge_file_convert_data_uri_image' },
      };
    },
  },
  {
    name: 'fileforge_file_fetch_resource',
    description: 'Fetch a resource URL and save it locally.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, store: { type: 'boolean', default: true } },
      required: ['url'],
    },
    handler: async (p) => {
      const { buffer, meta } = await loadResource(p.url);
      const name = basename(new URL(meta.url, 'file:///').pathname) || `resource-${Date.now()}`;
      const filename = join(RESOURCE_DIR, name);
      writeFileSync(filename, buffer);
      const data = { ...meta, filename, size: buffer.length };
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'file_resource', tool: 'fileforge_file_fetch_resource', url: p.url, data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_file_fetch_resource' } };
    },
  },
  {
    name: 'fileforge_file_parse_resource',
    description: 'Fetch and parse a resource (JSON, CSV, XML, etc.).',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, format: { type: 'string' }, store: { type: 'boolean', default: true } },
      required: ['url'],
    },
    handler: async (p) => {
      const { buffer, meta } = await loadResource(p.url);
      const format = inferFormat(p.url, meta.contentType, p.format);
      const data = { meta, format, ...parseBuffer(buffer, format) };
      const stored = maybeStoreResult({ store: p.store ?? true, prefix: 'file_parse', tool: 'fileforge_file_parse_resource', url: p.url, data });
      return { ok: true, ...stored, meta: { tool: 'fileforge_file_parse_resource' } };
    },
  },
];

const tools = [
  makeActionTool({
    name: 'fileforge_file_action',
    description: 'Fetch, parse, convert, inspect, and decode files and Data URIs.',
    prefix: 'fileforge_file_',
    actions: actionDefs,
  }),
];

registry.registerMany(tools);
export { tools };
