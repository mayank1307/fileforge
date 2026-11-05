import test from 'node:test';
import assert from 'node:assert/strict';
import { fileforgeUri } from './fileforgeUri.js';

test('keeps a POSIX path as it is', () => {
  assert.equal(fileforgeUri('/home/me/.fileforge/a.png'), 'fileforge:///home/me/.fileforge/a.png');
});

test('turns Windows backslashes into forward slashes', () => {
  assert.equal(fileforgeUri('C:\\Users\\me\\.fileforge\\a.png'), 'fileforge://C:/Users/me/.fileforge/a.png');
});
