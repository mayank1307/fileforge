import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePerformanceAudit } from './performanceAuditUtils.js';
import { validateIssue } from './issueUtils.js';

test('summarizes Core Web Vitals-style metrics and transfer weight', () => {
  const audit = summarizePerformanceAudit({
    url: 'https://example.com/',
    viewport: 'mobile',
    performance: {
      timing: {
        navigation: [{ domContentLoadedEventEnd: 900, loadEventEnd: 1800 }],
        paint: [{ name: 'first-contentful-paint', startTime: 1200 }],
        largestContentfulPaint: [{ startTime: 4200 }],
        layoutShift: [{ value: 0.2, hadRecentInput: false }, { value: 0.4, hadRecentInput: true }],
        longTasks: [{ duration: 90 }, { duration: 180 }],
      },
    },
    network: {
      requests: [
        { url: 'https://example.com/app.js', type: 'Script', encodedDataLength: 900 * 1024 },
        { url: 'https://cdn.example.net/sdk.js', type: 'Script', encodedDataLength: 200 * 1024 },
        { url: 'https://example.com/hero.jpg', type: 'Image', encodedDataLength: 700 * 1024 },
      ],
    },
  });

  assert.equal(audit.metrics.fcp, 1200);
  assert.equal(audit.metrics.lcp, 4200);
  assert.equal(audit.metrics.cls, 0.2);
  assert.equal(audit.metrics.tbt, 170);
  assert.equal(audit.metricBands.lcp, 'poor');
  assert.equal(audit.metricBands.javascriptBytes, 'poor');
  assert.equal(audit.transfer.thirdPartyScripts, 1);
  assert.equal(audit.issues.length, 3);
  for (const issue of audit.issues) assert.equal(validateIssue(issue).ok, true);
});

test('keeps missing browser-only metrics as unknown instead of failing', () => {
  const audit = summarizePerformanceAudit({
    url: 'https://example.com/',
    performance: {},
    network: { requests: [] },
  });

  assert.equal(audit.metricBands.lcp, 'unknown');
  assert.equal(audit.metricBands.fcp, 'unknown');
  assert.equal(audit.metricBands.totalTransferBytes, 'good');
  assert.equal(audit.issues.length, 0);
});
