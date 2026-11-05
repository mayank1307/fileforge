import { createHash, randomUUID } from 'crypto';

export function makeIdempotencyKey(parts) {
  const h = createHash('sha256');
  for (const p of parts) h.update(typeof p === 'string' ? p : JSON.stringify(p));
  return h.digest('hex').slice(0, 32);
}

export function newRunId() {
  return `run_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
