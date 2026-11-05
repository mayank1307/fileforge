import { wsServer } from './wsServer.js';
import { materializeScreenshotResponse } from './utils/screenshotUtils.js';
import { normalizeRpcUrlParams } from './utils/urlUtils.js';

export const rpcClient = {
  async send(method, params = {}) {
    const requestId = Math.random().toString(36).slice(2);
    const normalizedParams = normalizeRpcUrlParams(method, params);
    const response = await wsServer.send({ type: 'fileforge-mcp-rpc', requestId, method, params: normalizedParams });
    return materializeScreenshotResponse(method, normalizedParams, response);
  },
};
