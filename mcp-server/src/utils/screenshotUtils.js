import { artifactStore } from '../stores/artifactStore.js';

const SCREENSHOT_METHODS = new Set([
  'visual.captureScreenshot',
  'visual.captureFullPage',
  'visual.captureElement',
  'visual.captureRegion',
  'visual.pickAndCaptureElement',
]);

export function materializeScreenshotResponse(method, params = {}, response) {
  if (!SCREENSHOT_METHODS.has(method) || !response?.ok || params.store === false) return response;
  const raw = response.data ?? response;
  if (!raw?.dataUrl) return response;
  const { dataUrl: _dataUrl, format: rawFormat, ...metadata } = raw;

  return {
    ...response,
    data: {
      screenshot: artifactStore.saveScreenshot({
        dataUrl: raw.dataUrl,
        format: rawFormat,
        project: params.project,
        run: params.run,
        name: params.name,
        url: params.url ?? metadata.url,
        viewport: params.viewport ?? metadata.viewport,
        includeBase64: params.includeBase64,
      }),
      ...metadata,
    },
  };
}
