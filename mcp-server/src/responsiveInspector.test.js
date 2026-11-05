import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The inspector runs in a content script with no exports, so this evaluates its source against a small fake DOM.
const source = readFileSync(new URL('../../extension/content/mcpContentBridge.js', import.meta.url), 'utf8');
const inspector = source.slice(source.indexOf('const responsiveInspector = {'), source.indexOf('const frameworkInspector'));

function fakeElement(tag, rect, { parent = null, style = {}, inSvg = false } = {}) {
  const box = { left: rect.left ?? 0, right: rect.right, top: rect.top ?? 0, bottom: rect.bottom ?? 10, width: rect.right - (rect.left ?? 0), height: (rect.bottom ?? 10) - (rect.top ?? 0) };
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    parentElement: parent,
    style: { visibility: 'visible', opacity: '1', overflowX: 'visible', ...style },
    getBoundingClientRect: () => box,
    getAttribute: () => null,
    contains: (other) => {
      for (let node = other; node; node = node.parentElement) if (node === el) return true;
      return false;
    },
    closest: (selector) => (selector === 'svg' && (inSvg || tag === 'svg') ? el : parent?.closest(selector) ?? null),
  };
  return el;
}

function run(method, { clientWidth = 1440, scrollWidth = 1440, build }) {
  const body = fakeElement('body', { right: clientWidth });
  const root = { clientWidth, scrollWidth };
  const elements = build(body);
  const context = {
    document: { documentElement: root, body, querySelectorAll: () => elements },
    getComputedStyle: (el) => el.style,
  };
  return JSON.parse(vm.runInNewContext(`${inspector}; JSON.stringify(responsiveInspector.${method}())`, context));
}

test('a centered body narrower than the page is not overflow', () => {
  const overflow = run('findOverflow', { build: (body) => [fakeElement('div', { left: 480, right: 960 }, { parent: body })] });
  assert.deepEqual(overflow, []);
});

test('an element past the viewport on a page that scrolls sideways is overflow', () => {
  const overflow = run('findOverflow', { scrollWidth: 2000, build: (body) => [fakeElement('div', { right: 2000 }, { parent: body }), fakeElement('p', { right: 400 }, { parent: body })] });
  assert.equal(overflow.length, 1);
  assert.equal(overflow[0].tag, 'div');
  assert.equal(overflow[0].viewportWidth, 1440);
});

test('content clipped by a parent is not overflow', () => {
  const overflow = run('findOverflow', {
    scrollWidth: 2000,
    build: (body) => {
      const carousel = fakeElement('div', { right: 800 }, { parent: body, style: { overflowX: 'hidden' } });
      return [carousel, fakeElement('img', { right: 3000 }, { parent: carousel })];
    },
  });
  assert.deepEqual(overflow, []);
});

test('two visible elements on top of each other overlap', () => {
  const overlaps = run('findOverlaps', { build: (body) => [fakeElement('div', { right: 100 }, { parent: body }), fakeElement('span', { right: 100 }, { parent: body })] });
  assert.equal(overlaps.length, 1);
});

test('parents and children do not overlap, and neither do separate elements', () => {
  const overlaps = run('findOverlaps', {
    build: (body) => {
      const parent = fakeElement('div', { right: 100 }, { parent: body });
      return [parent, fakeElement('span', { right: 100 }, { parent }), fakeElement('p', { left: 200, right: 300 }, { parent: body })];
    },
  });
  assert.deepEqual(overlaps, []);
});

test('invisible elements and the shapes inside an SVG do not overlap', () => {
  const overlaps = run('findOverlaps', {
    build: (body) => {
      const svg = fakeElement('svg', { right: 100 }, { parent: body });
      return [
        svg,
        fakeElement('path', { right: 100 }, { parent: svg, inSvg: true }),
        fakeElement('path', { right: 100 }, { parent: svg, inSvg: true }),
        fakeElement('input', { left: 200, right: 300 }, { parent: body, style: { opacity: '0' } }),
        fakeElement('label', { left: 200, right: 300 }, { parent: body }),
      ];
    },
  });
  assert.deepEqual(overlaps, []);
});
