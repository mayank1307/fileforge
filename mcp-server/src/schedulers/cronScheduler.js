import { routineStore } from '../stores/routineStore.js';
import { runQueue } from '../queue/runQueue.js';
import { nextRunAt } from '../utils/cronExpr.js';

let _timer = null;

async function tick() {
  const now = new Date();
  let due;
  try {
    due = routineStore.findDue(now);
  } catch (err) {
    console.error('[fileforge cron] findDue failed:', err.message);
    return;
  }
  for (const routine of due) {
    try {
      const result = await runQueue.enqueue({ routineId: routine.id, trigger: 'cron' });
      const next = nextRunAt(routine.cron_expression, now);
      routineStore.setNextRunAt(routine.id, next.toISOString());
      if (!result.ok) {
        console.error(`[fileforge cron] enqueue failed for ${routine.id}:`, result.error?.message ?? 'unknown');
      }
    } catch (err) {
      console.error(`[fileforge cron] tick for ${routine.id} failed:`, err.message);
    }
  }
}

export const cronScheduler = {
  start({ intervalMs = 60_000 } = {}) {
    if (_timer) return;
    _timer = setInterval(() => { tick().catch((e) => console.error('[fileforge cron] tick threw:', e.message)); }, intervalMs);
    setImmediate(() => tick().catch((e) => console.error('[fileforge cron] boot tick threw:', e.message)));
    return this;
  },
  stop() {
    if (_timer) clearInterval(_timer);
    _timer = null;
  },
  tickNow: tick,
};
