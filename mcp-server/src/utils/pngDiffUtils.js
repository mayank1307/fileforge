import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { deflateSync, inflateSync } from 'zlib';
import { fileforgeUri } from './fileforgeUri.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paethPredictor(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upperLeft;
}

function parsePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG image.');

  let offset = 8;
  let ihdr = null;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
      };
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!ihdr) throw new Error('PNG is missing IHDR.');
  if (ihdr.bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${ihdr.bitDepth}.`);

  const channels = {
    0: 1,
    2: 3,
    4: 2,
    6: 4,
  }[ihdr.colorType];
  if (!channels) throw new Error(`Unsupported PNG color type: ${ihdr.colorType}.`);

  return { ...ihdr, channels, inflated: inflateSync(Buffer.concat(idatChunks)) };
}

function unfilterPng({ width, height, channels, inflated }) {
  const stride = width * channels;
  const raw = Buffer.alloc(stride * height);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowStart = y * stride;
    const previousRowStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const value = inflated[inputOffset + x];
      const left = x >= channels ? raw[rowStart + x - channels] : 0;
      const up = y > 0 ? raw[previousRowStart + x] : 0;
      const upperLeft = y > 0 && x >= channels ? raw[previousRowStart + x - channels] : 0;

      if (filter === 0) raw[rowStart + x] = value;
      else if (filter === 1) raw[rowStart + x] = (value + left) & 0xff;
      else if (filter === 2) raw[rowStart + x] = (value + up) & 0xff;
      else if (filter === 3) raw[rowStart + x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) raw[rowStart + x] = (value + paethPredictor(left, up, upperLeft)) & 0xff;
      else throw new Error(`Unsupported PNG filter: ${filter}.`);
    }

    inputOffset += stride;
  }

  return raw;
}

function rgbaAt(raw, index, channels, colorType) {
  if (colorType === 0) {
    const gray = raw[index];
    return [gray, gray, gray, 255];
  }
  if (colorType === 2) return [raw[index], raw[index + 1], raw[index + 2], 255];
  if (colorType === 4) {
    const gray = raw[index];
    return [gray, gray, gray, raw[index + 1]];
  }
  return [raw[index], raw[index + 1], raw[index + 2], raw[index + 3]];
}

// ── PNG encoder (minimal, for diff/composite artifact generation) ──────────

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}

function encodePng(width, height, rgbaBuffer) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA color type
  // compression, filter, interlace default to 0

  // Create filtered scanlines (filter type 0 = None for each row)
  const stride = width * 4;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    filtered[y * (stride + 1)] = 0; // filter type: None
    rgbaBuffer.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const compressed = deflateSync(filtered);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Region clustering ──────────────────────────────────────────────────────

/**
 * Clusters changed pixels into bounding-box regions using a grid-based approach.
 * Returns an array of { x, y, width, height, changedPixels } regions.
 */
function clusterChangedRegions(changedMask, imageWidth, imageHeight, { gridSize = 16 } = {}) {
  // Create a grid of cells, each tracking whether it has any changed pixels
  const gridCols = Math.ceil(imageWidth / gridSize);
  const gridRows = Math.ceil(imageHeight / gridSize);
  const grid = new Uint16Array(gridCols * gridRows); // count per cell

  for (let y = 0; y < imageHeight; y += 1) {
    for (let x = 0; x < imageWidth; x += 1) {
      if (changedMask[y * imageWidth + x]) {
        const gx = Math.floor(x / gridSize);
        const gy = Math.floor(y / gridSize);
        grid[gy * gridCols + gx] += 1;
      }
    }
  }

  // Flood-fill connected grid cells into regions
  const visited = new Uint8Array(gridCols * gridRows);
  const regions = [];

  for (let gy = 0; gy < gridRows; gy += 1) {
    for (let gx = 0; gx < gridCols; gx += 1) {
      const idx = gy * gridCols + gx;
      if (visited[idx] || !grid[idx]) continue;

      // BFS flood fill
      let minGx = gx, maxGx = gx, minGy = gy, maxGy = gy;
      let regionPixels = 0;
      const queue = [idx];
      visited[idx] = 1;

      while (queue.length) {
        const ci = queue.pop();
        const cx = ci % gridCols;
        const cy = Math.floor(ci / gridCols);
        regionPixels += grid[ci];
        minGx = Math.min(minGx, cx);
        maxGx = Math.max(maxGx, cx);
        minGy = Math.min(minGy, cy);
        maxGy = Math.max(maxGy, cy);

        // Check 4-connected neighbors
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= gridCols || ny < 0 || ny >= gridRows) continue;
          const ni = ny * gridCols + nx;
          if (visited[ni] || !grid[ni]) continue;
          visited[ni] = 1;
          queue.push(ni);
        }
      }

      regions.push({
        x: minGx * gridSize,
        y: minGy * gridSize,
        width: Math.min((maxGx + 1) * gridSize, imageWidth) - minGx * gridSize,
        height: Math.min((maxGy + 1) * gridSize, imageHeight) - minGy * gridSize,
        changedPixels: regionPixels,
      });
    }
  }

  // Sort by size descending
  regions.sort((a, b) => b.changedPixels - a.changedPixels);
  return regions.slice(0, 50); // Cap at 50 regions
}

// ── Diff image generation ──────────────────────────────────────────────────

/**
 * Generate a diff heatmap image: unchanged pixels are dimmed grayscale,
 * changed pixels are colored red (intensity proportional to delta).
 */
function generateDiffImage(beforeRaw, afterRaw, before, after, changedMask, overlapWidth, overlapHeight, threshold) {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outIdx = (y * width + x) * 4;

      if (x >= overlapWidth || y >= overlapHeight) {
        // Dimension delta area — highlight in magenta
        rgba[outIdx] = 255;
        rgba[outIdx + 1] = 0;
        rgba[outIdx + 2] = 255;
        rgba[outIdx + 3] = 180;
        continue;
      }

      if (changedMask[y * overlapWidth + x]) {
        // Changed pixel — red heatmap
        const beforeIdx = (y * before.width + x) * before.channels;
        const afterIdx = (y * after.width + x) * after.channels;
        const a = rgbaAt(beforeRaw, beforeIdx, before.channels, before.colorType);
        const b = rgbaAt(afterRaw, afterIdx, after.channels, after.colorType);
        const delta = Math.max(
          Math.abs(a[0] - b[0]),
          Math.abs(a[1] - b[1]),
          Math.abs(a[2] - b[2]),
          Math.abs(a[3] - b[3])
        );
        const intensity = Math.min(255, Math.round((delta / 255) * 200) + 55);
        rgba[outIdx] = intensity;       // R
        rgba[outIdx + 1] = 30;          // G
        rgba[outIdx + 2] = 30;          // B
        rgba[outIdx + 3] = 255;         // A
      } else {
        // Unchanged pixel — dimmed grayscale from the "after" image
        const afterIdx = (y * after.width + x) * after.channels;
        const px = rgbaAt(afterRaw, afterIdx, after.channels, after.colorType);
        const gray = Math.round(px[0] * 0.299 + px[1] * 0.587 + px[2] * 0.114);
        const dimmed = Math.round(gray * 0.35) + 20;
        rgba[outIdx] = dimmed;
        rgba[outIdx + 1] = dimmed;
        rgba[outIdx + 2] = dimmed;
        rgba[outIdx + 3] = 255;
      }
    }
  }

  return encodePng(width, height, rgba);
}

/**
 * Generate a side-by-side composite: [before | diff | after].
 * Each panel is separated by a 2px gray divider line.
 */
function generateComposite(beforeRaw, afterRaw, before, after, diffPngBuffer, overlapWidth, overlapHeight) {
  const panelWidth = Math.max(before.width, after.width);
  const panelHeight = Math.max(before.height, after.height);
  const dividerWidth = 2;
  const totalWidth = panelWidth * 3 + dividerWidth * 2;
  const rgba = Buffer.alloc(totalWidth * panelHeight * 4);

  // Parse the diff PNG back to get its pixels
  const diffParsed = parsePng(diffPngBuffer);
  const diffRaw = unfilterPng(diffParsed);

  for (let y = 0; y < panelHeight; y += 1) {
    for (let x = 0; x < totalWidth; x += 1) {
      const outIdx = (y * totalWidth + x) * 4;

      // Divider columns
      if (x === panelWidth || x === panelWidth + 1 || x === panelWidth * 2 + dividerWidth || x === panelWidth * 2 + dividerWidth + 1) {
        rgba[outIdx] = 80;
        rgba[outIdx + 1] = 80;
        rgba[outIdx + 2] = 80;
        rgba[outIdx + 3] = 255;
        continue;
      }

      let px;
      if (x < panelWidth) {
        // Before panel
        if (x < before.width && y < before.height) {
          const idx = (y * before.width + x) * before.channels;
          px = rgbaAt(beforeRaw, idx, before.channels, before.colorType);
        } else {
          px = [30, 30, 30, 255];
        }
      } else if (x < panelWidth * 2 + dividerWidth) {
        // Diff panel
        const dx = x - panelWidth - dividerWidth;
        if (dx >= 0 && dx < diffParsed.width && y < diffParsed.height) {
          const idx = (y * diffParsed.width + dx) * diffParsed.channels;
          px = rgbaAt(diffRaw, idx, diffParsed.channels, diffParsed.colorType);
        } else {
          px = [30, 30, 30, 255];
        }
      } else {
        // After panel
        const ax = x - panelWidth * 2 - dividerWidth * 2;
        if (ax >= 0 && ax < after.width && y < after.height) {
          const idx = (y * after.width + ax) * after.channels;
          px = rgbaAt(afterRaw, idx, after.channels, after.colorType);
        } else {
          px = [30, 30, 30, 255];
        }
      }

      rgba[outIdx] = px[0];
      rgba[outIdx + 1] = px[1];
      rgba[outIdx + 2] = px[2];
      rgba[outIdx + 3] = px[3];
    }
  }

  return encodePng(totalWidth, panelHeight, rgba);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Compare two PNG files pixel-by-pixel.
 *
 * @param {string} beforePath - Path to baseline PNG.
 * @param {string} afterPath - Path to current PNG.
 * @param {object} options
 * @param {number} options.threshold - Per-channel delta threshold (default 0).
 * @param {string} options.outputDir - If provided, writes diff heatmap, composite, and region data as artifacts.
 * @param {string} options.outputPrefix - Filename prefix for diff artifacts (default 'diff').
 * @returns {object} Diff result with stats, regions, and optional artifact paths.
 */
export function comparePngFiles(beforePath, afterPath, { threshold = 0, outputDir, outputPrefix = 'diff' } = {}) {
  const before = parsePng(readFileSync(beforePath));
  const after = parsePng(readFileSync(afterPath));
  const beforeRaw = unfilterPng(before);
  const afterRaw = unfilterPng(after);
  const overlapWidth = Math.min(before.width, after.width);
  const overlapHeight = Math.min(before.height, after.height);
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let totalDelta = 0;

  // Build changed-pixel mask for region clustering and heatmap
  const changedMask = new Uint8Array(overlapWidth * overlapHeight);

  for (let y = 0; y < overlapHeight; y += 1) {
    for (let x = 0; x < overlapWidth; x += 1) {
      const beforeIndex = (y * before.width + x) * before.channels;
      const afterIndex = (y * after.width + x) * after.channels;
      const a = rgbaAt(beforeRaw, beforeIndex, before.channels, before.colorType);
      const b = rgbaAt(afterRaw, afterIndex, after.channels, after.colorType);
      const delta = Math.max(
        Math.abs(a[0] - b[0]),
        Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]),
        Math.abs(a[3] - b[3])
      );
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta > threshold) {
        changedPixels += 1;
        changedMask[y * overlapWidth + x] = 1;
        totalDelta += delta;
      }
    }
  }

  const beforePixels = before.width * before.height;
  const afterPixels = after.width * after.height;
  const totalPixels = Math.max(beforePixels, afterPixels);
  const dimensionDeltaPixels = totalPixels - overlapWidth * overlapHeight;
  const totalChangedPixels = changedPixels + dimensionDeltaPixels;

  // Cluster changed pixels into bounding-box regions
  const regions = changedPixels > 0 ? clusterChangedRegions(changedMask, overlapWidth, overlapHeight) : [];

  const result = {
    supported: true,
    before: { width: before.width, height: before.height },
    after: { width: after.width, height: after.height },
    dimensionsChanged: before.width !== after.width || before.height !== after.height,
    overlapPixels: overlapWidth * overlapHeight,
    changedPixels: totalChangedPixels,
    changedRatio: totalPixels ? totalChangedPixels / totalPixels : 0,
    changedPercent: totalPixels ? Number(((totalChangedPixels / totalPixels) * 100).toFixed(4)) : 0,
    maxChannelDelta,
    averageDelta: changedPixels > 0 ? Math.round(totalDelta / changedPixels) : 0,
    threshold,
    regions,
    regionCount: regions.length,
  };

  // Generate diff artifacts if an output directory is provided
  if (outputDir && totalChangedPixels > 0) {
    try {
      mkdirSync(outputDir, { recursive: true, mode: 0o700 });

      // Diff heatmap
      const diffPng = generateDiffImage(beforeRaw, afterRaw, before, after, changedMask, overlapWidth, overlapHeight, threshold);
      const diffPath = join(outputDir, `${outputPrefix}-heatmap.png`);
      writeFileSync(diffPath, diffPng);
      result.diffImagePath = diffPath;
      result.diffImage = fileforgeUri(diffPath);

      // Side-by-side composite
      const compositePng = generateComposite(beforeRaw, afterRaw, before, after, diffPng, overlapWidth, overlapHeight);
      const compositePath = join(outputDir, `${outputPrefix}-composite.png`);
      writeFileSync(compositePath, compositePng);
      result.compositeImagePath = compositePath;
      result.compositeImage = fileforgeUri(compositePath);

      // Region data JSON
      if (regions.length) {
        const regionPath = join(outputDir, `${outputPrefix}-regions.json`);
        writeFileSync(regionPath, JSON.stringify({
          regions,
          summary: {
            regionCount: regions.length,
            largestRegion: regions[0],
            totalChangedPixels: totalChangedPixels,
            changedPercent: result.changedPercent,
          },
        }, null, 2));
        result.regionDataPath = regionPath;
      }
    } catch (err) {
      result.artifactError = err.message;
    }
  }

  return result;
}

