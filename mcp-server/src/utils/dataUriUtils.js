const LARGE_THRESHOLD = 10 * 1024 * 1024;
const PREVIEW_LIMIT = 100 * 1024;

const MIME_META = {
  'image/png': { category: 'image', ext: 'png', label: 'PNG Image' },
  'image/jpeg': { category: 'image', ext: 'jpg', label: 'JPEG Image' },
  'image/jpg': { category: 'image', ext: 'jpg', label: 'JPEG Image' },
  'image/webp': { category: 'image', ext: 'webp', label: 'WebP Image' },
  'image/gif': { category: 'image', ext: 'gif', label: 'GIF Image' },
  'image/svg+xml': { category: 'image', ext: 'svg', label: 'SVG Image' },
  'image/bmp': { category: 'image', ext: 'bmp', label: 'BMP Image' },
  'image/x-icon': { category: 'image', ext: 'ico', label: 'ICO Image' },
  'audio/mpeg': { category: 'audio', ext: 'mp3', label: 'MP3 Audio' },
  'audio/mp3': { category: 'audio', ext: 'mp3', label: 'MP3 Audio' },
  'audio/wav': { category: 'audio', ext: 'wav', label: 'WAV Audio' },
  'audio/ogg': { category: 'audio', ext: 'ogg', label: 'OGG Audio' },
  'audio/aac': { category: 'audio', ext: 'aac', label: 'AAC Audio' },
  'audio/flac': { category: 'audio', ext: 'flac', label: 'FLAC Audio' },
  'audio/webm': { category: 'audio', ext: 'weba', label: 'WebM Audio' },
  'video/mp4': { category: 'video', ext: 'mp4', label: 'MP4 Video' },
  'video/webm': { category: 'video', ext: 'webm', label: 'WebM Video' },
  'video/ogg': { category: 'video', ext: 'ogv', label: 'OGV Video' },
  'video/quicktime': { category: 'video', ext: 'mov', label: 'MOV Video' },
  'text/csv': { category: 'csv', ext: 'csv', label: 'CSV Data' },
  'text/tsv': { category: 'csv', ext: 'tsv', label: 'TSV Data' },
  'text/tab-separated-values': { category: 'csv', ext: 'tsv', label: 'TSV Data' },
  'application/json': { category: 'json', ext: 'json', label: 'JSON Data' },
  'text/json': { category: 'json', ext: 'json', label: 'JSON Data' },
  'text/html': { category: 'html', ext: 'html', label: 'HTML Document' },
  'text/xml': { category: 'xml', ext: 'xml', label: 'XML Document' },
  'application/xml': { category: 'xml', ext: 'xml', label: 'XML Document' },
  'application/pdf': { category: 'pdf', ext: 'pdf', label: 'PDF Document' },
  'text/plain': { category: 'text', ext: 'txt', label: 'Plain Text' },
  'text/markdown': { category: 'text', ext: 'md', label: 'Markdown' },
  'font/woff': { category: 'font', ext: 'woff', label: 'WOFF Font' },
  'font/woff2': { category: 'font', ext: 'woff2', label: 'WOFF2 Font' },
  'font/ttf': { category: 'font', ext: 'ttf', label: 'TrueType Font' },
  'application/font-woff': { category: 'font', ext: 'woff', label: 'WOFF Font' },
  'application/zip': { category: 'archive', ext: 'zip', label: 'ZIP Archive' },
  'application/octet-stream': { category: 'binary', ext: 'bin', label: 'Binary Data' },
};

const TYPE_DEFAULTS = {
  image: { category: 'image', ext: 'bin', label: 'Image' },
  audio: { category: 'audio', ext: 'bin', label: 'Audio' },
  video: { category: 'video', ext: 'bin', label: 'Video' },
  text: { category: 'text', ext: 'txt', label: 'Text' },
  application: { category: 'application', ext: 'bin', label: 'Application Data' },
  font: { category: 'font', ext: 'bin', label: 'Font' },
};

export function getDataUriMeta(mime) {
  const normalized = String(mime || '').toLowerCase();
  return MIME_META[normalized] ?? TYPE_DEFAULTS[normalized.split('/')[0]] ?? { category: 'unknown', ext: 'bin', label: normalized || 'Data URI' };
}

export function formatBytes(bytes) {
  if (bytes == null || bytes < 0) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function parseDataUri(dataUri, { decode = true, textPreviewLimit = 1200 } = {}) {
  if (!dataUri || typeof dataUri !== 'string') {
    const err = new Error('Expected a Data URI string.');
    err.code = 'INVALID_DATA_URI';
    throw err;
  }
  const trimmed = dataUri.trim();
  if (!trimmed.startsWith('data:')) {
    const err = new Error('Invalid Data URI.');
    err.code = 'INVALID_DATA_URI';
    throw err;
  }
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex < 0) {
    const err = new Error('Invalid Data URI.');
    err.code = 'INVALID_DATA_URI';
    throw err;
  }

  const header = trimmed.slice(5, commaIndex);
  const raw = trimmed.slice(commaIndex + 1);
  const headerParts = header.split(';').filter(Boolean);
  const mimePart = headerParts[0]?.includes('/') ? headerParts.shift() : '';
  const mime = (mimePart || 'text/plain').trim().toLowerCase() || 'text/plain';
  const isBase64 = headerParts.some((part) => part.toLowerCase() === 'base64');
  const params = headerParts.filter((part) => part.toLowerCase() !== 'base64').join(';');
  const encoding = isBase64 ? 'base64' : 'url';
  const stripped = encoding === 'base64' ? raw.replace(/\s/g, '') : raw;
  const size = estimateDecodedSize(stripped, encoding);
  const meta = getDataUriMeta(mime);

  const parsed = {
    mime,
    params: params || undefined,
    encoding,
    size,
    sizeText: formatBytes(size),
    category: meta.category,
    extension: meta.ext,
    label: meta.label,
    isLarge: size > LARGE_THRESHOLD,
    isPreviewSafe: size <= PREVIEW_LIMIT,
    warnings: size > LARGE_THRESHOLD ? [`Large Data URI payload (${formatBytes(size)}) should be stored as an artifact.`] : [],
  };

  if (!decode) return parsed;

  const buffer = decodeDataUriPayload(stripped, encoding);
  parsed.buffer = buffer;
  const dimensions = imageDimensions(buffer, mime);
  if (dimensions) parsed.dimensions = dimensions;
  if (isTextMime(mime) || meta.category === 'json' || meta.category === 'csv' || meta.category === 'xml') {
    const text = buffer.toString('utf8');
    parsed.textPreview = text.slice(0, textPreviewLimit);
    parsed.textTruncated = text.length > textPreviewLimit;
    if (meta.category === 'json') {
      try {
        parsed.jsonPreview = JSON.parse(text);
      } catch (err) {
        parsed.parseError = err.message;
      }
    }
  }

  return parsed;
}

export function dataUriSummary(dataUri, options = {}) {
  const { buffer, ...summary } = parseDataUri(dataUri, options);
  return summary;
}

export function detectDataUrisInText(text, limit = 100) {
  if (!text || typeof text !== 'string') return [];
  const matches = String(text).match(/data:[a-zA-Z0-9][^\s"'`<>)\]}{\\]+/g) ?? [];
  const seen = new Set();
  const results = [];
  for (const match of matches) {
    const cleaned = match.replace(/[.,;:!?)]+$/, '');
    if (seen.has(cleaned)) continue;
    try {
      const summary = dataUriSummary(cleaned, { decode: false });
      seen.add(cleaned);
      results.push({ dataUri: cleaned, ...summary });
      if (results.length >= limit) break;
    } catch (_) {
      // Ignore false positives in arbitrary text.
    }
  }
  return results;
}

function estimateDecodedSize(raw, encoding) {
  if (encoding === 'base64') {
    const padLen = (raw.match(/=+$/) || [''])[0].length;
    return Math.max(0, Math.floor((raw.length * 3) / 4) - padLen);
  }
  try {
    return Buffer.byteLength(decodeURIComponent(raw));
  } catch (_) {
    return Buffer.byteLength(raw);
  }
}

function decodeDataUriPayload(raw, encoding) {
  if (encoding === 'base64') return Buffer.from(raw, 'base64');
  try {
    return Buffer.from(decodeURIComponent(raw), 'utf8');
  } catch (_) {
    return Buffer.from(raw, 'utf8');
  }
}

function isTextMime(mime) {
  return mime.startsWith('text/') || ['application/json', 'application/xml', 'application/javascript', 'application/x-javascript'].includes(mime);
}

function imageDimensions(buffer, mime) {
  if (mime === 'image/png') return pngDimensions(buffer);
  if (mime === 'image/jpeg' || mime === 'image/jpg') return jpegDimensions(buffer);
  if (mime === 'image/gif') return gifDimensions(buffer);
  if (mime === 'image/webp') return webpDimensions(buffer);
  if (mime === 'image/svg+xml') return svgDimensions(buffer.toString('utf8'));
  return null;
}

function pngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function gifDimensions(buffer) {
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

function svgDimensions(text) {
  const width = Number(/<svg[^>]*\bwidth=["']?([0-9.]+)/i.exec(text)?.[1]);
  const height = Number(/<svg[^>]*\bheight=["']?([0-9.]+)/i.exec(text)?.[1]);
  if (width && height) return { width, height };
  const viewBox = /<svg[^>]*\bviewBox=["']?([0-9.\s-]+)/i.exec(text)?.[1];
  if (!viewBox) return null;
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) return { width: parts[2], height: parts[3] };
  return null;
}

export { LARGE_THRESHOLD, PREVIEW_LIMIT, imageDimensions };
