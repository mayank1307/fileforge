import { resolveTabId, runInTab } from './contentBridge.js';

const FULL_PAGE_SCROLL_STEP_RATIO = 0.95;
const PAGE_CHROME_STATE_KEY = '__fileforgeFullpageChromeState';
const CAPTURE_VISIBLE_TAB_MAX_ATTEMPTS = 6;
const CAPTURE_VISIBLE_TAB_BASE_DELAY_MS = 220;
const CAPTURE_VISIBLE_TAB_MAX_DELAY_MS = 2200;

// captureVisibleTab captures whatever tab is showing in a window, so a tab that isn't
// the active one in its window would silently return another page.
function notVisibleError(tab) {
  if (tab.active) return null;
  return {
    ok: false,
    error: {
      code: 'TAB_NOT_VISIBLE',
      message: `Tab ${tab.id} is not the visible tab in its window, so it cannot be captured. Activate it first with fileforge_browser_action → activate_tab.`,
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCaptureQuotaError(error) {
  const message = String(error?.message ?? error ?? '');
  return (
    message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')
    || /capturevisibletab/i.test(message) && /quota|rate|too many requests/i.test(message)
  );
}

async function captureVisibleTabWithBackoff(windowId, options = {}, retryOptions = {}) {
  const maxAttempts = Math.max(1, Number(retryOptions.maxAttempts ?? CAPTURE_VISIBLE_TAB_MAX_ATTEMPTS));
  const baseDelayMs = Math.max(1, Number(retryOptions.baseDelayMs ?? CAPTURE_VISIBLE_TAB_BASE_DELAY_MS));
  const maxDelayMs = Math.max(baseDelayMs, Number(retryOptions.maxDelayMs ?? CAPTURE_VISIBLE_TAB_MAX_DELAY_MS));

  let quotaRetries = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId ?? null, options);
      return { dataUrl, quotaRetries };
    } catch (error) {
      if (!isCaptureQuotaError(error)) throw error;
      quotaRetries += 1;
      if (attempt >= maxAttempts) {
        const wrapped = new Error(`captureVisibleTab quota exhausted after ${maxAttempts} attempts.`);
        wrapped.code = 'CAPTURE_QUOTA_EXHAUSTED';
        wrapped.details = {
          maxAttempts,
          quotaRetries,
          lastError: String(error?.message ?? error ?? 'Unknown captureVisibleTab quota error'),
        };
        throw wrapped;
      }
      const backoffMs = Math.min(maxDelayMs, Math.round(baseDelayMs * (2 ** (attempt - 1))));
      await delay(backoffMs);
    }
  }

  const fallback = new Error('captureVisibleTab retry loop ended unexpectedly.');
  fallback.code = 'CAPTURE_FAILED';
  throw fallback;
}

function dataUrlToBitmap(dataUrl) {
  return fetch(dataUrl).then((response) => response.blob()).then((blob) => createImageBitmap(blob));
}

async function blobToDataUrl(blob) {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('FileReader failed while encoding screenshot.'));
      reader.readAsDataURL(blob);
    });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

async function stitchViewportCaptures(images, options = {}) {
  if (!images.length) throw new Error('No viewport captures to stitch.');

  const dpr = options.devicePixelRatio || 1;
  const firstBitmap = await dataUrlToBitmap(images[0].dataUrl);
  const outWidth = Math.round((options.viewportWidth || firstBitmap.width / dpr) * dpr);
  const outHeight = Math.max(1, Math.round(options.pageHeight * dpr));
  const canvas = new OffscreenCanvas(outWidth, outHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    firstBitmap.close();
    throw new Error('Could not create screenshot stitch canvas.');
  }

  drawCapture(ctx, firstBitmap, images[0], null, { outWidth, outHeight, dpr, viewportHeight: options.viewportHeight });
  firstBitmap.close();

  for (let i = 1; i < images.length; i++) {
    const bitmap = await dataUrlToBitmap(images[i].dataUrl);
    drawCapture(ctx, bitmap, images[i], images[i - 1], {
      outWidth,
      outHeight,
      dpr,
      viewportHeight: options.viewportHeight,
    });
    bitmap.close();
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return {
    dataUrl: await blobToDataUrl(blob),
    width: outWidth,
    height: outHeight,
  };
}

async function cropDataUrl(dataUrl, rect) {
  const bitmap = await dataUrlToBitmap(dataUrl);
  const cropWidth = Math.max(1, Math.round(rect.width));
  const cropHeight = Math.max(1, Math.round(rect.height));
  const sourceX = Math.max(0, Math.round(rect.x));
  const sourceY = Math.max(0, Math.round(rect.y));
  const sourceWidth = Math.min(cropWidth, bitmap.width - sourceX);
  const sourceHeight = Math.min(cropHeight, bitmap.height - sourceY);
  const canvas = new OffscreenCanvas(Math.max(1, sourceWidth), Math.max(1, sourceHeight));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not create element crop canvas.');
  }
  ctx.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return {
    dataUrl: await blobToDataUrl(blob),
    width: sourceWidth,
    height: sourceHeight,
  };
}

function drawCapture(ctx, bitmap, image, previousImage, { outWidth, outHeight, dpr, viewportHeight }) {
  const previousBottom = previousImage
    ? previousImage.y + (previousImage.viewportHeight || viewportHeight || 0)
    : image.y;
  const overlapCss = previousImage ? Math.max(0, Math.round(previousBottom - image.y)) : 0;
  const sourceTop = Math.min(bitmap.height, Math.max(0, Math.round(overlapCss * dpr)));
  const drawY = Math.round((image.y + overlapCss) * dpr);
  const sourceHeight = Math.max(0, bitmap.height - sourceTop);
  const drawHeight = Math.min(sourceHeight, Math.max(0, outHeight - drawY));
  if (drawHeight > 0) {
    ctx.drawImage(bitmap, 0, sourceTop, bitmap.width, drawHeight, 0, drawY, outWidth, drawHeight);
  }
}

async function getPageDimensions(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const doc = document.documentElement;
      const body = document.body;
      return {
        scrollHeight: Math.max(doc.scrollHeight, doc.clientHeight, doc.offsetHeight, body?.scrollHeight || 0),
        clientHeight: doc.clientHeight,
        clientWidth: doc.clientWidth,
        devicePixelRatio: window.devicePixelRatio || 1,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
        url: location.href,
      };
    },
  });
  return result?.result;
}

async function scrollTo(tabId, y) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollTop) => {
      window.scrollTo({ left: 0, top: scrollTop, behavior: 'instant' });
      return {
        scrollY: window.scrollY || 0,
        viewportHeight: window.innerHeight || document.documentElement.clientHeight || 0,
      };
    },
    args: [y],
  });
  return result?.result ?? {};
}

async function restoreScroll(tabId, left, top) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (x, y) => window.scrollTo({ left: x, top: y, behavior: 'instant' }),
    args: [left, top],
  }).catch(() => null);
}

async function setPageChromeHidden(tabId, hidden) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (shouldHide, stateKey) => {
      const existing = window[stateKey];

      if (!shouldHide) {
        if (!Array.isArray(existing)) return;
        existing.forEach((entry) => {
          if (!entry?.element?.isConnected) return;
          restoreStyle(entry.element, 'opacity', entry.opacity, entry.opacityPriority);
          restoreStyle(entry.element, 'visibility', entry.visibility, entry.visibilityPriority);
          restoreStyle(entry.element, 'pointer-events', entry.pointerEvents, entry.pointerEventsPriority);
          restoreStyle(entry.element, 'transition', entry.transition, entry.transitionPriority);
          restoreStyle(entry.element, 'animation', entry.animation, entry.animationPriority);
          entry.element.removeAttribute('data-fileforge-fullpage-hidden');
        });
        delete window[stateKey];
        return;
      }

      if (Array.isArray(existing) && existing.length) return;

      const hoveredElements = new Set(Array.from(document.querySelectorAll(':hover')));
      const candidates = [];
      document.querySelectorAll('body *').forEach((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) return;
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) return;

        const zIndex = Number.parseInt(style.zIndex, 10);
        const hasHighZIndex = Number.isFinite(zIndex) && zIndex >= 10;
        const floating = style.position === 'fixed' || style.position === 'sticky';
        const popupLike = element.matches('dialog,[role="dialog"],[aria-modal="true"],[popover],[data-toast],[aria-live="polite"]');
        const hoveredOverlay = hoveredElements.has(element) && (floating || hasHighZIndex);
        if (!floating && !popupLike && !hoveredOverlay) return;
        candidates.push(element);
      });

      window[stateKey] = candidates.map((element) => {
        element.setAttribute('data-fileforge-fullpage-hidden', 'true');
        const entry = {
          element,
          opacity: element.style.getPropertyValue('opacity'),
          opacityPriority: element.style.getPropertyPriority('opacity'),
          visibility: element.style.getPropertyValue('visibility'),
          visibilityPriority: element.style.getPropertyPriority('visibility'),
          pointerEvents: element.style.getPropertyValue('pointer-events'),
          pointerEventsPriority: element.style.getPropertyPriority('pointer-events'),
          transition: element.style.getPropertyValue('transition'),
          transitionPriority: element.style.getPropertyPriority('transition'),
          animation: element.style.getPropertyValue('animation'),
          animationPriority: element.style.getPropertyPriority('animation'),
        };
        element.style.setProperty('opacity', '0', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
        element.style.setProperty('transition', 'none', 'important');
        element.style.setProperty('animation', 'none', 'important');
        return entry;
      });

      function restoreStyle(element, property, value, priority) {
        if (value) element.style.setProperty(property, value, priority || '');
        else element.style.removeProperty(property);
      }
    },
    args: [hidden, PAGE_CHROME_STATE_KEY],
  });
}

async function getElementCaptureRect(tabId, selector, padding = 0) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (targetSelector, pad) => {
      const element = document.querySelector(targetSelector);
      if (!element) return { ok: false, message: `Selector not found: ${targetSelector}` };

      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const padded = {
        left: rect.left - pad,
        top: rect.top - pad,
        right: rect.right + pad,
        bottom: rect.bottom + pad,
      };
      const crop = {
        left: Math.max(0, padded.left),
        top: Math.max(0, padded.top),
        right: Math.min(viewportWidth, padded.right),
        bottom: Math.min(viewportHeight, padded.bottom),
      };
      const clipped = padded.left < 0 || padded.top < 0 || padded.right > viewportWidth || padded.bottom > viewportHeight;
      const styles = getComputedStyle(element);

      return {
        ok: true,
        rect: {
          x: crop.left,
          y: crop.top,
          width: Math.max(1, crop.right - crop.left),
          height: Math.max(1, crop.bottom - crop.top),
        },
        element: {
          selector: targetSelector,
          tag: element.tagName.toLowerCase(),
          id: element.id || undefined,
          classes: element.className ? String(element.className).split(/\s+/).filter(Boolean).slice(0, 20) : undefined,
          text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 200) || undefined,
          role: element.getAttribute('role') || undefined,
          ariaLabel: element.getAttribute('aria-label') || undefined,
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          clipped,
        },
        viewport: {
          width: viewportWidth,
          height: viewportHeight,
          scrollX: window.scrollX || 0,
          scrollY: window.scrollY || 0,
          devicePixelRatio: window.devicePixelRatio || 1,
          url: location.href,
        },
      };
    },
    args: [selector, Math.max(0, Number(padding) || 0)],
  });
  return result?.result;
}

async function getRegionCaptureRect(tabId, region) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (input) => {
      const coordinateSpace = input.coordinateSpace === 'page' ? 'page' : 'viewport';
      const pageX = Number(input.x) || 0;
      const pageY = Number(input.y) || 0;
      const width = Math.max(1, Number(input.width) || 0);
      const height = Math.max(1, Number(input.height) || 0);

      if (coordinateSpace === 'page') {
        window.scrollTo({ left: Math.max(0, pageX), top: Math.max(0, pageY), behavior: 'instant' });
      }

      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const scrollX = window.scrollX || 0;
      const scrollY = window.scrollY || 0;
      const viewportX = coordinateSpace === 'page' ? pageX - scrollX : pageX;
      const viewportY = coordinateSpace === 'page' ? pageY - scrollY : pageY;
      const right = viewportX + width;
      const bottom = viewportY + height;
      const crop = {
        left: Math.max(0, viewportX),
        top: Math.max(0, viewportY),
        right: Math.min(viewportWidth, right),
        bottom: Math.min(viewportHeight, bottom),
      };
      const clipped = viewportX < 0 || viewportY < 0 || right > viewportWidth || bottom > viewportHeight;
      if (crop.right <= crop.left || crop.bottom <= crop.top) {
        return {
          ok: false,
          message: 'Requested region does not intersect the visible viewport.',
          requested: { x: pageX, y: pageY, width, height, coordinateSpace },
          viewport: { width: viewportWidth, height: viewportHeight, scrollX, scrollY, url: location.href },
        };
      }

      return {
        ok: true,
        rect: {
          x: crop.left,
          y: crop.top,
          width: Math.max(1, crop.right - crop.left),
          height: Math.max(1, crop.bottom - crop.top),
        },
        requested: { x: pageX, y: pageY, width, height, coordinateSpace },
        viewport: {
          width: viewportWidth,
          height: viewportHeight,
          scrollX,
          scrollY,
          devicePixelRatio: window.devicePixelRatio || 1,
          url: location.href,
        },
        clipped,
      };
    },
    args: [region],
  });
  return result?.result;
}

async function pickElement(tabId, timeoutMs = 30000) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (pickerTimeoutMs) => new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = [
        'position: fixed',
        'z-index: 2147483647',
        'pointer-events: none',
        'border: 2px solid #6366f1',
        'background: rgba(99, 102, 241, 0.12)',
        'box-shadow: 0 0 0 99999px rgba(15, 23, 42, 0.08)',
        'border-radius: 4px',
        'display: none',
      ].join(';');
      overlay.setAttribute('data-fileforge-picker-overlay', 'true');
      document.documentElement.appendChild(overlay);

      const label = document.createElement('div');
      label.style.cssText = [
        'position: fixed',
        'z-index: 2147483647',
        'pointer-events: none',
        'background: #111827',
        'color: white',
        'font: 12px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        'padding: 4px 6px',
        'border-radius: 4px',
        'display: none',
        'max-width: 360px',
        'white-space: nowrap',
        'overflow: hidden',
        'text-overflow: ellipsis',
      ].join(';');
      document.documentElement.appendChild(label);

      let current = null;
      const timer = setTimeout(() => finish({ ok: false, code: 'PICKER_TIMEOUT', message: 'Element picker timed out.' }), pickerTimeoutMs);

      function esc(value) {
        if (window.CSS?.escape) return CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      }

      function selectorFor(element) {
        if (element.id) return `#${esc(element.id)}`;
        const path = [];
        let node = element;
        while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body && node !== document.documentElement) {
          let part = node.tagName.toLowerCase();
          const usefulClasses = Array.from(node.classList || []).filter(Boolean).slice(0, 3);
          if (usefulClasses.length) part += `.${usefulClasses.map(esc).join('.')}`;
          const parent = node.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
            if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
          }
          path.unshift(part);
          const candidate = path.join(' > ');
          try {
            if (document.querySelectorAll(candidate).length === 1) return candidate;
          } catch (_) {}
          node = parent;
        }
        return path.join(' > ') || element.tagName.toLowerCase();
      }

      function describe(element) {
        const rect = element.getBoundingClientRect();
        return {
          selector: selectorFor(element),
          tag: element.tagName.toLowerCase(),
          id: element.id || undefined,
          classes: element.className ? String(element.className).split(/\s+/).filter(Boolean).slice(0, 20) : undefined,
          text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 200) || undefined,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        };
      }

      function updateOverlay(element) {
        const rect = element.getBoundingClientRect();
        overlay.style.display = 'block';
        overlay.style.left = `${Math.max(0, rect.left)}px`;
        overlay.style.top = `${Math.max(0, rect.top)}px`;
        overlay.style.width = `${Math.max(0, rect.width)}px`;
        overlay.style.height = `${Math.max(0, rect.height)}px`;
        label.style.display = 'block';
        label.style.left = `${Math.max(8, Math.min(window.innerWidth - 40, rect.left))}px`;
        label.style.top = `${Math.max(8, rect.top - 30)}px`;
        label.textContent = selectorFor(element);
      }

      function onMove(event) {
        const element = event.target;
        if (!(element instanceof Element) || element === overlay || element === label) return;
        current = element;
        updateOverlay(element);
      }

      function onClick(event) {
        event.preventDefault();
        event.stopPropagation();
        if (!current) return;
        finish({ ok: true, selection: describe(current) });
      }

      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish({ ok: false, code: 'PICKER_CANCELLED', message: 'Element picker was cancelled.' });
        }
      }

      function finish(payload) {
        clearTimeout(timer);
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        label.remove();
        resolve(payload);
      }

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
    }),
    args: [Math.max(1000, Number(timeoutMs) || 30000)],
  });
  return result?.result;
}

export const screenshotModule = {
  async captureScreenshot({ tabId = 'active', format = 'png' } = {}) {
    const id = await resolveTabId(tabId);
    if (!id) return { ok: false, error: { code: 'NO_TAB', message: 'No tab available for screenshot.' } };
    const tab = await chrome.tabs.get(id);
    const hidden = notVisibleError(tab);
    if (hidden) return hidden;
    const capture = await captureVisibleTabWithBackoff(tab.windowId, { format });
    return {
      ok: true,
      data: { dataUrl: capture.dataUrl, format },
      warnings: capture.quotaRetries > 0
        ? [`captureVisibleTab quota reached; retried ${capture.quotaRetries} time(s).`]
        : undefined,
    };
  },

  async captureFullPage({
    tabId = 'active',
    maxHeight = 100000,
    scrollWaitMs = 120,
    hideFixedElements = true,
  } = {}) {
    const id = await resolveTabId(tabId);
    if (!id) return { ok: false, error: { code: 'NO_TAB', message: 'No tab available for full-page screenshot.' } };

    const tab = await chrome.tabs.get(id);
    const hidden = notVisibleError(tab);
    if (hidden) return hidden;
    const dims = await getPageDimensions(id);
    if (!dims?.scrollHeight || !dims?.clientHeight || !dims?.clientWidth) {
      return { ok: false, error: { code: 'INVALID_PAGE_DIMENSIONS', message: 'Could not read page dimensions.' } };
    }
    if (dims.scrollHeight > maxHeight) {
      return {
        ok: false,
        error: {
          code: 'PAGE_TOO_TALL',
          message: `Page height ${dims.scrollHeight}px exceeds maxHeight ${maxHeight}px.`,
          details: { scrollHeight: dims.scrollHeight, maxHeight },
        },
      };
    }

    const step = Math.max(1, Math.floor(dims.clientHeight * FULL_PAGE_SCROLL_STEP_RATIO));
    const maxScrollTop = Math.max(0, dims.scrollHeight - dims.clientHeight);
    const images = [];
    let y = 0;
    let lastCapturedScrollY = -1;
    let fixedHidden = false;
    let quotaRetries = 0;
    const warnings = [];

    try {
      while (y < dims.scrollHeight) {
        const scrollState = await scrollTo(id, y);
        await delay(scrollWaitMs);
        const actualScrollY = Math.max(0, Math.round(scrollState.scrollY ?? y));
        const actualViewportHeight = Math.max(1, Math.round(scrollState.viewportHeight ?? dims.clientHeight));
        let capture;
        try {
          capture = await captureVisibleTabWithBackoff(tab.windowId, { format: 'png' });
        } catch (error) {
          if (error?.code === 'CAPTURE_QUOTA_EXHAUSTED') {
            return {
              ok: false,
              error: {
                code: 'CAPTURE_QUOTA_EXHAUSTED',
                message: error.message,
                details: {
                  ...error.details,
                  tabId: id,
                  capturedFrames: images.length,
                  requestedPageHeight: dims.scrollHeight,
                },
              },
              warnings: warnings.length ? warnings : undefined,
            };
          }
          throw error;
        }
        quotaRetries += capture.quotaRetries;

        if (capture.dataUrl && actualScrollY !== lastCapturedScrollY) {
          images.push({ dataUrl: capture.dataUrl, y: actualScrollY, viewportHeight: actualViewportHeight });
          lastCapturedScrollY = actualScrollY;
        }
        if (actualScrollY >= maxScrollTop) break;

        y = Math.min(dims.scrollHeight, actualScrollY + step);
        if (hideFixedElements && !fixedHidden && images.length === 1 && y < dims.scrollHeight) {
          await setPageChromeHidden(id, true);
          fixedHidden = true;
          await delay(scrollWaitMs);
        }
      }
    } finally {
      if (fixedHidden) await setPageChromeHidden(id, false).catch(() => null);
      await restoreScroll(id, dims.scrollX, dims.scrollY);
    }

    if (!images.length) {
      return { ok: false, error: { code: 'CAPTURE_FAILED', message: 'Full-page capture produced no viewport images.' } };
    }
    if (quotaRetries > 0) warnings.push(`captureVisibleTab quota reached; retried ${quotaRetries} time(s) during full-page capture.`);

    const stitched = await stitchViewportCaptures(images, {
      devicePixelRatio: dims.devicePixelRatio || 1,
      pageHeight: dims.scrollHeight,
      viewportHeight: dims.clientHeight,
      viewportWidth: dims.clientWidth,
    });

    return {
      ok: true,
      data: {
        dataUrl: stitched.dataUrl,
        format: 'png',
        width: stitched.width,
        height: stitched.height,
        pageHeight: dims.scrollHeight,
        viewportWidth: dims.clientWidth,
        viewportHeight: dims.clientHeight,
        devicePixelRatio: dims.devicePixelRatio || 1,
        captureCount: images.length,
        url: dims.url || tab.url,
      },
      warnings: warnings.length ? warnings : undefined,
    };
  },

  async captureElement({ tabId = 'active', selector, padding = 0 } = {}) {
    const id = await resolveTabId(tabId);
    if (!id) return { ok: false, error: { code: 'NO_TAB', message: 'No tab available for element screenshot.' } };
    if (!selector) return { ok: false, error: { code: 'MISSING_SELECTOR', message: 'A selector is required.' } };

    const tab = await chrome.tabs.get(id);
    const hidden = notVisibleError(tab);
    if (hidden) return hidden;
    const captureInfo = await getElementCaptureRect(id, selector, padding);
    if (!captureInfo?.ok) {
      return {
        ok: false,
        error: {
          code: 'SELECTOR_NOT_FOUND',
          message: captureInfo?.message || `Selector not found: ${selector}`,
        },
      };
    }

    await delay(80);
    const capture = await captureVisibleTabWithBackoff(tab.windowId, { format: 'png' });
    const visibleDataUrl = capture.dataUrl;
    const dpr = captureInfo.viewport.devicePixelRatio || 1;
    const crop = await cropDataUrl(visibleDataUrl, {
      x: captureInfo.rect.x * dpr,
      y: captureInfo.rect.y * dpr,
      width: captureInfo.rect.width * dpr,
      height: captureInfo.rect.height * dpr,
    });
    const warnings = [];
    if (captureInfo.element.clipped) warnings.push('Element was clipped to the visible viewport.');
    if (capture.quotaRetries > 0) warnings.push(`captureVisibleTab quota reached; retried ${capture.quotaRetries} time(s).`);

    return {
      ok: true,
      data: {
        dataUrl: crop.dataUrl,
        format: 'png',
        width: crop.width,
        height: crop.height,
        selector,
        element: captureInfo.element,
        viewport: `${captureInfo.viewport.width}x${captureInfo.viewport.height}`,
        viewportWidth: captureInfo.viewport.width,
        viewportHeight: captureInfo.viewport.height,
        devicePixelRatio: dpr,
        clipped: captureInfo.element.clipped,
        url: captureInfo.viewport.url || tab.url,
      },
      warnings: warnings.length ? warnings : undefined,
    };
  },

  async captureRegion({
    tabId = 'active',
    x,
    y,
    width,
    height,
    coordinateSpace = 'viewport',
  } = {}) {
    const id = await resolveTabId(tabId);
    if (!id) return { ok: false, error: { code: 'NO_TAB', message: 'No tab available for region screenshot.' } };
    if (![x, y, width, height].every((value) => Number.isFinite(Number(value)))) {
      return { ok: false, error: { code: 'INVALID_REGION', message: 'Region requires numeric x, y, width, and height.' } };
    }

    const tab = await chrome.tabs.get(id);
    const hidden = notVisibleError(tab);
    if (hidden) return hidden;
    const original = await getPageDimensions(id);
    const captureInfo = await getRegionCaptureRect(id, { x, y, width, height, coordinateSpace });
    if (!captureInfo?.ok) {
      if (coordinateSpace === 'page' && original) await restoreScroll(id, original.scrollX, original.scrollY);
      return {
        ok: false,
        error: {
          code: 'REGION_OUTSIDE_VIEWPORT',
          message: captureInfo?.message || 'Requested region does not intersect the visible viewport.',
          details: { requested: captureInfo?.requested, viewport: captureInfo?.viewport },
        },
      };
    }

    try {
      await delay(80);
      const capture = await captureVisibleTabWithBackoff(tab.windowId, { format: 'png' });
      const visibleDataUrl = capture.dataUrl;
      const dpr = captureInfo.viewport.devicePixelRatio || 1;
      const crop = await cropDataUrl(visibleDataUrl, {
        x: captureInfo.rect.x * dpr,
        y: captureInfo.rect.y * dpr,
        width: captureInfo.rect.width * dpr,
        height: captureInfo.rect.height * dpr,
      });
      const warnings = [];
      if (captureInfo.clipped) warnings.push('Region was clipped to the visible viewport.');
      if (capture.quotaRetries > 0) warnings.push(`captureVisibleTab quota reached; retried ${capture.quotaRetries} time(s).`);

      return {
        ok: true,
        data: {
          dataUrl: crop.dataUrl,
          format: 'png',
          width: crop.width,
          height: crop.height,
          requested: captureInfo.requested,
          viewport: `${captureInfo.viewport.width}x${captureInfo.viewport.height}`,
          viewportWidth: captureInfo.viewport.width,
          viewportHeight: captureInfo.viewport.height,
          devicePixelRatio: dpr,
          clipped: captureInfo.clipped,
          url: captureInfo.viewport.url || tab.url,
        },
        warnings: warnings.length ? warnings : undefined,
      };
    } finally {
      if (coordinateSpace === 'page' && original) await restoreScroll(id, original.scrollX, original.scrollY);
    }
  },

  async pickAndCaptureElement({ tabId = 'active', padding = 0, timeoutMs = 30000 } = {}) {
    const id = await resolveTabId(tabId);
    if (!id) return { ok: false, error: { code: 'NO_TAB', message: 'No tab available for element picker.' } };

    const picked = await pickElement(id, timeoutMs);
    if (!picked?.ok) {
      return {
        ok: false,
        error: {
          code: picked?.code || 'PICKER_FAILED',
          message: picked?.message || 'Element picker failed.',
        },
      };
    }

    const response = await screenshotModule.captureElement({ tabId: String(id), selector: picked.selection.selector, padding });
    if (!response?.ok) return response;
    return {
      ...response,
      data: {
        ...response.data,
        picked: picked.selection,
      },
    };
  },

  async extractCss({ tabId = 'active', selector } = {}) {
    const id = await resolveTabId(tabId);
    const result = await runInTab(
      id,
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, message: `Selector not found: ${selector}` };
        const style = getComputedStyle(el);
        return {
          ok: true,
          css: Object.fromEntries(Array.from(style).map((prop) => [prop, style.getPropertyValue(prop)])),
        };
      },
      [selector]
    );
    if (!result?.ok) return { ok: false, error: { code: 'SELECTOR_NOT_FOUND', message: result?.message } };
    return { ok: true, data: { tabId: id, selector, css: result.css } };
  },

  async extractColors({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const colors = await runInTab(id, () => window.__fileforge_scrape(['colors']).colors);
    return { ok: true, data: { tabId: id, colors } };
  },

  async detectFonts({ tabId = 'active' } = {}) {
    const id = await resolveTabId(tabId);
    const fonts = await runInTab(id, () => window.__fileforge_scrape(['fonts']).fonts);
    return { ok: true, data: { tabId: id, fonts } };
  },

  async measureElement({ tabId = 'active', selector } = {}) {
    const id = await resolveTabId(tabId);
    const result = await runInTab(
      id,
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, message: `Selector not found: ${selector}` };
        const rect = el.getBoundingClientRect();
        return {
          ok: true,
          rect: {
            x: rect.x,
            y: rect.y,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
        };
      },
      [selector]
    );
    if (!result?.ok) return { ok: false, error: { code: 'SELECTOR_NOT_FOUND', message: result?.message } };
    return { ok: true, data: { tabId: id, selector, rect: result.rect } };
  },
};
