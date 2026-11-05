import { CronExpressionParser } from 'cron-parser';

export function validateCronExpression(expr) {
  if (!expr || typeof expr !== 'string') return { ok: false, message: 'cronExpression must be a non-empty string.' };
  try {
    CronExpressionParser.parse(expr);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

export function nextRunAt(expr, after = new Date()) {
  const it = CronExpressionParser.parse(expr, { currentDate: after });
  return it.next().toDate();
}

export function nextFew(expr, count = 3, after = new Date()) {
  const it = CronExpressionParser.parse(expr, { currentDate: after });
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(it.next().toDate());
  return out;
}
