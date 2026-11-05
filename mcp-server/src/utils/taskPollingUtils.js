import { formatDDMMYYYY } from './dateUtils.js';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollTaskStatus({
  registry,
  rpcClient,
  taskId,
  intervalMs = 15000,
  timeoutMs = 180000,
  onStatus = () => {},
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const response = await registry.call('fileforge_task_action', { action: 'status', taskId }, { rpcClient });
    const task = response?.data?.task;
    const status = task?.status ?? 'unknown';
    onStatus({
      date: formatDDMMYYYY(),
      taskId,
      status,
      task,
    });
    if (TERMINAL_STATUSES.has(status)) return response;
    await sleep(intervalMs);
  }

  return {
    ok: false,
    error: {
      code: 'TASK_POLL_TIMEOUT',
      message: `Task did not finish within ${timeoutMs}ms`,
    },
    data: {
      date: formatDDMMYYYY(),
      taskId,
      status: 'timeout',
    },
  };
}
