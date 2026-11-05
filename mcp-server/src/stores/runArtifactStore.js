import { randomUUID } from 'crypto';
import { db } from './routineStore.js';
import { runtimeStorage } from '../utils/runtimeStorage.js';

function parseArtifact(row) {
  if (!row) return null;
  const out = { ...row };
  if (out.metadata && typeof out.metadata === 'string') {
    try { out.metadata = JSON.parse(out.metadata); } catch { /* keep raw */ }
  }
  return out;
}

export const runArtifactStore = {
  register({ runId, routineId, stepId = null, sourceStepId = null, type, filename, contents, mime = null, metadata = null } = {}) {
    if (!runId || !routineId || !type || !filename) {
      throw new Error('runArtifactStore.register requires runId, routineId, type, filename');
    }
    const path = runtimeStorage.writeAsset(routineId, runId, filename, contents);
    const size = runtimeStorage.fileSize(path);
    const id = `art_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    db().prepare(`
      INSERT INTO run_artifacts (id, run_id, step_id, type, path, size, mime, source_step_id, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, runId, stepId, type, path, size, mime, sourceStepId, now, metadata ? JSON.stringify(metadata) : null);
    return { id, runId, stepId, type, path, size, mime, sourceStepId, createdAt: now, metadata };
  },

  list({ runId, stepId, type } = {}) {
    const conditions = [];
    const params = [];
    if (runId) { conditions.push('run_id = ?'); params.push(runId); }
    if (stepId) { conditions.push('step_id = ?'); params.push(stepId); }
    if (type) { conditions.push('type = ?'); params.push(type); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db().prepare(`SELECT * FROM run_artifacts ${where} ORDER BY created_at`).all(...params);
    return rows.map(parseArtifact);
  },

  get(id) {
    return parseArtifact(db().prepare('SELECT * FROM run_artifacts WHERE id = ?').get(id));
  },

  deleteByRun(runId) {
    db().prepare('DELETE FROM run_artifacts WHERE run_id = ?').run(runId);
  },
};
