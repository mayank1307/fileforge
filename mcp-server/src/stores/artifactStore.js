import { mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { fileforgeUri } from '../utils/fileforgeUri.js';

let artifactDir = join(homedir(), '.fileforge', 'artifacts');
mkdirSync(artifactDir, { recursive: true, mode: 0o700 });

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

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl ?? '');
  if (!match || !match[2]) throw new Error('Expected a base64 data URL.');
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[3], 'base64'),
  };
}

function extensionFor(mimeType, fallback = 'bin') {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/svg+xml') return 'svg';
  return fallback;
}

function pngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
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

function imageDimensions(buffer, mimeType) {
  if (mimeType === 'image/png') return pngDimensions(buffer);
  if (mimeType === 'image/jpeg') return jpegDimensions(buffer);
  return null;
}

function fallbackArtifactDir() {
  const dir = join(tmpdir(), 'fileforge', 'artifacts');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  artifactDir = dir;
  return dir;
}

function imageTagMime(mimeType) {
  return mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
}

function thumbnailSvg({ dataUrl, width, height, mimeType }) {
  const maxWidth = 320;
  const maxHeight = 220;
  const ratio = width && height ? Math.min(maxWidth / width, maxHeight / height, 1) : 1;
  const thumbWidth = Math.max(1, Math.round((width || maxWidth) * ratio));
  const thumbHeight = Math.max(1, Math.round((height || maxHeight) * ratio));
  return [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ` width="${thumbWidth}" height="${thumbHeight}" viewBox="0 0 ${thumbWidth} ${thumbHeight}">`,
    `<image width="${thumbWidth}" height="${thumbHeight}" href="${dataUrl}" type="${imageTagMime(mimeType)}" preserveAspectRatio="xMidYMid meet"/>`,
    '</svg>',
  ].join('');
}

export const artifactStore = {
  saveScreenshot({
    dataUrl,
    format,
    project = 'default',
    run = runId(),
    name = 'screenshot',
    url,
    viewport,
    includeBase64 = false,
  }) {
    const { mimeType, buffer } = parseDataUrl(dataUrl);
    const ext = extensionFor(mimeType, format);
    const safeProject = safeSegment(project, 'default');
    const safeRun = safeSegment(run, 'run');
    const safeName = safeSegment(name, 'screenshot');
    let dir = join(artifactDir, safeProject, safeRun, 'screenshots');
    mkdirSync(dir, { recursive: true, mode: 0o700 });

    let fullPath = join(dir, `${safeName}.${ext}`);
    let thumbnailPath = join(dir, `${safeName}-thumb.svg`);
    try {
      writeFileSync(fullPath, buffer);
    } catch (err) {
      if (!['EACCES', 'EPERM', 'EROFS'].includes(err.code)) throw err;
      dir = join(fallbackArtifactDir(), safeProject, safeRun, 'screenshots');
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      fullPath = join(dir, `${safeName}.${ext}`);
      thumbnailPath = join(dir, `${safeName}-thumb.svg`);
      writeFileSync(fullPath, buffer);
    }

    const dimensions = imageDimensions(buffer, mimeType) ?? {};
    writeFileSync(thumbnailPath, thumbnailSvg({ dataUrl, mimeType, width: dimensions.width, height: dimensions.height }));

    const screenshot = {
      thumbnail: fileforgeUri(thumbnailPath),
      thumbnailPath,
      fullImage: fileforgeUri(fullPath),
      fullImagePath: fullPath,
      filename: basename(fullPath),
      format: ext,
      mimeType,
      sizeBytes: buffer.length,
      size: `${Math.round(buffer.length / 1024)}KB`,
      width: dimensions.width,
      height: dimensions.height,
      viewport,
      url,
      run: safeRun,
      project: safeProject,
      createdAt: new Date().toISOString(),
    };

    if (includeBase64) screenshot.dataUrl = dataUrl;
    return screenshot;
  },
};

export { parseDataUrl, imageDimensions };
