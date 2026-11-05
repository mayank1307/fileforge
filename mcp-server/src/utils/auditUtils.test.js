import test from 'node:test';
import assert from 'node:assert/strict';
import { auditClientSecurity, auditContentConsistency, auditPolicyRisk, compareAuditRuns, rankRecommendations, revealClientSecurityValue } from './auditUtils.js';

test('detects content consistency conflicts', () => {
  const audit = auditContentConsistency([
    { url: 'https://example.com/pricing', text: 'Pro is a one-time payment. 30+ free tools.' },
    { url: 'https://example.com/features', text: 'Pro is a yearly subscription with 50+ tools.' },
  ]);

  assert.equal(audit.issues.some((issue) => issue.type === 'content.pricing-model-conflict'), true);
  assert.equal(audit.issues.some((issue) => issue.type === 'content.feature-count-clarity'), true);
});

test('detects policy risk copy', () => {
  const audit = auditPolicyRisk([{ url: 'https://example.com/', text: 'Download YouTube videos and works everywhere.' }]);

  assert.equal(audit.issues.length >= 1, true);
  assert.equal(audit.issues[0].dimension, 'policy');
});

test('redacts client storage security evidence', () => {
  const audit = auditClientSecurity({
    localStorage: { proLicense: 'enabled', apiKey: 'sk_test_1234567890' },
    sessionStorage: { debugMode: 'true' },
  }, { url: 'https://example.com/app' });

  assert.equal(audit.issues.length, 3);
  assert.equal(audit.entries.some((entry) => entry.value.includes('[REDACTED')), true);
  assert.equal(audit.sensitiveFindings.some((entry) => entry.location === 'localStorage.apiKey'), true);
});

test('reveals scoped client storage values only by exact request', () => {
  const storage = { localStorage: { apiKey: 'sk_test_1234567890' }, sessionStorage: {} };
  const revealed = revealClientSecurityValue(storage, { location: 'localStorage.apiKey' });
  assert.equal(revealed.ok, true);
  assert.equal(revealed.data.value, 'sk_test_1234567890');
});

test('ranks recommendations by severity and project type', () => {
  const recommendations = rankRecommendations([
    { id: '1', type: 'policy.x', severity: 'high', dimension: 'policy', confidence: 0.9, title: 'Policy risk', impact: 'Risk', suggestedFix: 'Fix', evidence: [{ url: 'a' }] },
    { id: '2', type: 'visual.x', severity: 'medium', dimension: 'visual', confidence: 0.9, title: 'Visual issue', impact: 'Risk', suggestedFix: 'Fix', evidence: [{ url: 'b' }] },
  ], { projectType: 'chrome-extension' });

  assert.equal(recommendations[0].dimension, 'policy');
});

test('compares audit runs by issue id', () => {
  const diff = compareAuditRuns(
    { ref: 'before', data: { issues: [{ id: 'old' }] } },
    { ref: 'after', data: { issues: [{ id: 'new' }] } },
  );

  assert.equal(diff.summary.addedIssues, 1);
  assert.equal(diff.summary.resolvedIssues, 1);
});
