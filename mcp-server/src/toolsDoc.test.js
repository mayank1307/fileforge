import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { renderToolsDoc, TOOLS_DOC_URL } from './toolsDoc.js';

test('docs/tools.md matches the tool registry', () => {
  // Windows checkouts may turn LF into CRLF; the content is what matters.
  const onDisk = readFileSync(TOOLS_DOC_URL, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const expected = renderToolsDoc().split('\n');
  const line = expected.findIndex((text, i) => text !== onDisk[i]);
  const firstDiff = line === -1 && onDisk.length !== expected.length ? expected.length : line;
  assert.equal(
    firstDiff,
    -1,
    `docs/tools.md is out of date (first difference at line ${firstDiff + 1}). Run: cd mcp-server && npm run docs:tools`
  );
});
