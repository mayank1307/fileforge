import { join } from 'path';
import { writeFileSync } from 'fs';
import { runtimeStorage } from '../runtimeStorage.js';

function csvEscape(value) {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildStepCsv(steps) {
  const cols = ['step_id', 'step_index', 'tool', 'action', 'status', 'attempt', 'duration_ms', 'started_at', 'finished_at'];
  const header = cols.join(',');
  const rows = steps.map((s) => cols.map((c) => csvEscape(s[c])).join(','));
  return [header, ...rows].join('\n');
}

export function writeExportJson({ runId, routineId, payload }) {
  const dir = runtimeStorage.exportsDir(routineId, runId);
  const path = join(dir, `${runId}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
  return path;
}

export function writeExportCsv({ runId, routineId, payload }) {
  const dir = runtimeStorage.exportsDir(routineId, runId);
  const path = join(dir, `${runId}-steps.csv`);
  writeFileSync(path, buildStepCsv(payload.steps ?? []), 'utf8');
  return path;
}
