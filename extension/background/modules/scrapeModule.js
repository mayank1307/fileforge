import { resolveTabId, runInTab } from './contentBridge.js';

const DEFAULT_SECTIONS = ['files', 'images', 'links', 'pageLinks', 'emails', 'phones', 'tables',
  'videos', 'colors', 'addresses', 'locations', 'fonts', 'lists', 'icons',
  'qrCodes', 'structuredData', 'network', 'metadata', 'assets', 'contacts', 'designTokens', 'dataUris'];

async function waitForLoad(tabId, timeoutMs = 15000) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;

  await new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    function listener(updatedId, info) {
      if (updatedId === tabId && info.status === 'complete') done();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function openScrapeTab(url, active = false) {
  const tab = await chrome.tabs.create({ url, active });
  await waitForLoad(tab.id);
  return tab.id;
}

async function injectAndScrape(tabId, sections) {
  return runInTab(
    tabId,
    (sections) => {
      // mcpContentBridge exposes window.__fileforge_scrape
      if (typeof window.__fileforge_scrape === 'function') {
        return window.__fileforge_scrape(sections);
      }
      return { error: 'Content bridge not loaded' };
    },
    [sections]
  );
}

async function scrapeTab(tabId, sections) {
  const tab = await chrome.tabs.get(tabId);
  const restricted = ['chrome://', 'chrome-extension://', 'about:', 'devtools://'];
  if (restricted.some((prefix) => tab.url?.startsWith(prefix))) {
    throw new Error(`Cannot scrape restricted URL: ${tab.url}`);
  }
  const data = await injectAndScrape(tabId, sections ?? DEFAULT_SECTIONS);
  return { tabId, url: tab.url, title: tab.title, ...data };
}

function sameOriginLinks(page, origin) {
  const links = Array.isArray(page?.pageLinks) ? page.pageLinks : [];
  return links
    .map((link) => link.href)
    .filter(Boolean)
    .map((href) => {
      try {
        const url = new URL(href);
        url.hash = '';
        return url.origin === origin ? url.toString() : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((v) => v.trim()));
  const [headers, ...body] = rows;
  if (!headers) return [];
  return body.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

async function fetchResource(url, format) {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') ?? '';
  const finalFormat = format
    || (contentType.includes('json') ? 'json'
      : contentType.includes('csv') ? 'csv'
        : contentType.includes('html') ? 'html'
          : contentType.includes('text') ? 'text'
            : 'binary');
  const meta = {
    url: response.url,
    status: response.status,
    ok: response.ok,
    contentType,
    size: Number(response.headers.get('content-length') ?? 0) || undefined,
  };

  if (finalFormat === 'json') return { meta, format: finalFormat, parsed: await response.json() };
  if (finalFormat === 'csv') {
    const text = await response.text();
    return { meta: { ...meta, size: text.length }, format: finalFormat, text, rows: parseCsv(text) };
  }
  if (finalFormat === 'text' || finalFormat === 'html' || finalFormat === 'xml') {
    const text = await response.text();
    return { meta: { ...meta, size: text.length }, format: finalFormat, text };
  }

  const blob = await response.blob();
  return { meta: { ...meta, size: blob.size }, format: finalFormat, note: 'Binary resource fetched; parsing is not available in the extension worker.' };
}

export const scrapeModule = {
  async page({ tabId = 'active', sections } = {}) {
    const id = await resolveTabId(tabId);
    return { ok: true, data: await scrapeTab(id, sections) };
  },

  async tabs({ tabIds, sections } = {}) {
    const all = tabIds
      ? tabIds.map(Number)
      : (await chrome.tabs.query({})).map((t) => t.id);
    const results = await Promise.allSettled(all.map((id) => scrapeTab(id, sections)));
    return { ok: true, data: { results: results.map((r, i) => (r.status === 'fulfilled' ? r.value : { tabId: all[i], error: r.reason?.message })) } };
  },

  async urls({ urls, sections, active = false, closeTabs = true } = {}) {
    const results = [];
    for (const url of urls ?? []) {
      let tabId = null;
      try {
        tabId = await openScrapeTab(url, active);
        results.push(await scrapeTab(tabId, sections));
      } catch (err) {
        results.push({ url, error: err.message });
      } finally {
        if (closeTabs && tabId) await chrome.tabs.remove(tabId).catch(() => {});
      }
    }
    return { ok: true, data: { results } };
  },

  async crawlSite({ url, maxPages = 50, sections, active = false } = {}) {
    const origin = new URL(url).origin;
    const queue = [url];
    const seen = new Set();
    const pages = [];
    let tabId = null;

    try {
      tabId = await openScrapeTab(url, active);
      while (queue.length && pages.length < maxPages) {
        const next = queue.shift();
        if (!next || seen.has(next)) continue;
        seen.add(next);

        await chrome.tabs.update(tabId, { url: next, active });
        await waitForLoad(tabId);
        const page = await scrapeTab(tabId, sections ?? DEFAULT_SECTIONS);
        pages.push(page);

        for (const link of sameOriginLinks(page, origin)) {
          if (!seen.has(link) && !queue.includes(link) && pages.length + queue.length < maxPages) queue.push(link);
        }
      }
    } finally {
      if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
    }

    return { ok: true, data: { url, origin, pages, crawled: pages.length, discovered: seen.size + queue.length } };
  },

  async analyzeSite({ url } = {}) {
    const crawl = await scrapeModule.crawlSite({ url, maxPages: 10, sections: ['metadata', 'links', 'pageLinks'] });
    if (!crawl.ok) return crawl;
    const pages = crawl.data.pages;
    const routes = pages.map((page) => page.url);
    const navLinks = pages.flatMap((page) => page.pageLinks ?? []);
    return {
      ok: true,
      data: {
        url,
        routes,
        routeCount: routes.length,
        navLinks,
        metadata: pages.map((page) => ({ url: page.url, metadata: page.metadata })),
      },
    };
  },

  async extractResource({ url, format } = {}) {
    try {
      return { ok: true, data: await fetchResource(url, format) };
    } catch (err) {
      return { ok: false, error: { code: 'RESOURCE_FETCH_FAILED', message: err.message } };
    }
  },

  async convertDataUriImage({ tabId = 'active', dataUri, format = 'png', quality = 0.92 } = {}) {
    const id = await resolveTabId(tabId);
    const data = await runInTab(
      id,
      async ({ dataUri, format, quality }) => {
        const mime = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : `image/${format}`;
        if (!/^data:image\//i.test(dataUri || '')) {
          return { ok: false, error: { code: 'UNSUPPORTED_DATA_URI', message: 'Expected an image Data URI.' } };
        }
        const img = new Image();
        const loaded = new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image Data URI could not be loaded.'));
        });
        img.src = dataUri;
        await loaded;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 1;
        canvas.height = img.naturalHeight || img.height || 1;
        const ctx = canvas.getContext('2d');
        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        return {
          ok: true,
          data: {
            dataUri: canvas.toDataURL(mime, quality),
            width: canvas.width,
            height: canvas.height,
            mime,
          },
        };
      },
      [{ dataUri, format, quality }]
    );
    return data?.ok === false ? data : data;
  },
};
