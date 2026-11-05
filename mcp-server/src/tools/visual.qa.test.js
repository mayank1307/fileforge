import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resultStore } from '../stores/resultStore.js';
import { tools as visualTools } from './visual.js';

const visualActionTool = visualTools.find((tool) => tool.name === 'fileforge_visual_action');

test('export_diff builds a ZIP from stored compare_screenshot artifacts without extension RPC', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'fileforge-visual-export-'));
  const baselinePath = join(tempDir, 'baseline.png');
  const currentPath = join(tempDir, 'current.png');
  const diffHeatmapPath = join(tempDir, 'diff.png');
  const compositePath = join(tempDir, 'composite.png');
  const regionDataPath = join(tempDir, 'regions.json');
  writeFileSync(baselinePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(currentPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(diffHeatmapPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(compositePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(regionDataPath, JSON.stringify([{ x: 1, y: 2, width: 3, height: 4 }], null, 2));

  const ref = `visual_diff_test_${Date.now()}`;
  resultStore.save({
    ref,
    tool: 'fileforge_visual_compare_screenshot',
    url: 'https://example.com/',
    data: {
      name: 'homepage',
      baseline: { fullImagePath: baselinePath },
      current: { fullImagePath: currentPath },
      diff: {
        diffImagePath: diffHeatmapPath,
        compositeImagePath: compositePath,
        regionDataPath,
      },
    },
    summary: { changedPixels: 5 },
  });

  const rpcClient = {
    async send() {
      throw new Error('export_diff should not call extension RPC');
    },
  };

  const result = await visualActionTool.handler({
    action: 'export_diff',
    ref,
    filename: `${ref}.zip`,
  }, { rpcClient });

  assert.equal(result.ok, true);
  assert.equal(result.data.ref, ref);
  const zip = readFileSync(result.data.filename);
  assert.equal(zip.slice(0, 2).toString('utf8'), 'PK');
  const zipText = zip.toString('utf8');
  assert.match(zipText, /metadata\/export\.json/);
  assert.match(zipText, /artifacts\/01-homepage\/baseline\.png/);
  assert.match(zipText, /artifacts\/01-homepage\/current\.png/);
  assert.match(zipText, /artifacts\/01-homepage\/diff-heatmap\.png/);
  assert.match(zipText, /artifacts\/01-homepage\/composite\.png/);
  assert.match(zipText, /artifacts\/01-homepage\/regions\.json/);
});
