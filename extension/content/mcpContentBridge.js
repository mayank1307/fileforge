// Exposes window.__fileforge_scrape for background/scrapeModule.js to call via scripting.executeScript

const domInspector = {
  getSnapshot(depth = 5) {
    function walk(node, d) {
      if (d === 0 || !node) return null;
      return {
        tag: node.tagName?.toLowerCase(),
        id: node.id || undefined,
        classes: node.className ? node.className.split(' ').filter(Boolean) : undefined,
        text: node.childNodes.length === 1 && node.firstChild.nodeType === 3
          ? node.firstChild.textContent.trim().slice(0, 100) : undefined,
        children: d > 1
          ? Array.from(node.children).map((c) => walk(c, d - 1)).filter(Boolean)
          : undefined,
      };
    }
    return walk(document.body, depth);
  },

  getInteractiveElements() {
    const selectors = 'a, button, input, select, textarea, [role="button"], [tabindex]';
    return Array.from(document.querySelectorAll(selectors)).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || undefined,
      text: el.textContent.trim().slice(0, 100) || el.value?.slice(0, 100),
      placeholder: el.placeholder || undefined,
      name: el.name || undefined,
      id: el.id || undefined,
      selector: getCssSelector(el),
    }));
  },

  getForms() {
    return Array.from(document.querySelectorAll('form')).map((form) => ({
      id: form.id || undefined,
      action: form.action || undefined,
      method: form.method || undefined,
      fields: Array.from(form.elements).map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || undefined,
        name: el.name || undefined,
        id: el.id || undefined,
        placeholder: el.placeholder || undefined,
        required: el.required || undefined,
        selector: getCssSelector(el),
      })),
    }));
  },

  // === Element Debug Info (Phase 6) ===

  getElementDebugInfo(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      const candidates = _findNearbyCandidates(selector);
      return {
        found: false,
        selector,
        candidates,
        suggestion: candidates.length
          ? `Selector not found. Did you mean: ${candidates[0].selector}`
          : 'Selector not found. No nearby candidates detected.',
      };
    }

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    const box = {
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      top: Math.round(rect.top), left: Math.round(rect.left),
      bottom: Math.round(rect.bottom), right: Math.round(rect.right),
      margin: style.margin, padding: style.padding,
      border: style.border, boxSizing: style.boxSizing,
    };

    const visibility = {
      display: style.display, visibility: style.visibility,
      opacity: parseFloat(style.opacity), overflow: style.overflow,
      clip: style.clip !== 'auto' ? style.clip : undefined,
      clipPath: style.clipPath !== 'none' ? style.clipPath : undefined,
      isHidden: style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0,
      isOffscreen: rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth,
      hasZeroSize: rect.width === 0 || rect.height === 0,
      inViewport: rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0,
    };

    const stacking = { zIndex: style.zIndex, position: style.position, pointerEvents: style.pointerEvents };

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let hitTest;
    if (centerX < 0 || centerY < 0 || centerX > window.innerWidth || centerY > window.innerHeight) {
      hitTest = { testable: false, reason: 'Element center is outside viewport.' };
    } else {
      const hitEl = document.elementFromPoint(centerX, centerY);
      if (!hitEl) { hitTest = { testable: false, reason: 'No element at center point.' }; }
      else {
        const isTarget = hitEl === el || el.contains(hitEl);
        hitTest = {
          testable: true, isTarget,
          hitElement: isTarget ? undefined : { tag: hitEl.tagName.toLowerCase(), id: hitEl.id || undefined, selector: getCssSelector(hitEl), text: (hitEl.textContent || '').trim().slice(0, 80) },
          reason: isTarget ? undefined : 'Another element is on top. Check z-index, position, or overlapping elements.',
        };
      }
    }

    const computedStyles = {
      color: style.color, backgroundColor: style.backgroundColor,
      fontSize: style.fontSize, fontFamily: style.fontFamily,
      fontWeight: style.fontWeight, lineHeight: style.lineHeight,
      textAlign: style.textAlign, cursor: style.cursor,
      transform: style.transform !== 'none' ? style.transform : undefined,
      transition: style.transition !== 'all 0s ease 0s' ? style.transition : undefined,
    };

    const a11y = {
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      ariaLabel: el.getAttribute('aria-label') || undefined,
      ariaLabelledBy: el.getAttribute('aria-labelledby') || undefined,
      ariaDescribedBy: el.getAttribute('aria-describedby') || undefined,
      ariaHidden: el.getAttribute('aria-hidden') || undefined,
      ariaExpanded: el.getAttribute('aria-expanded') || undefined,
      ariaDisabled: el.getAttribute('aria-disabled') || undefined,
      tabIndex: el.tabIndex !== -1 ? el.tabIndex : (el.hasAttribute('tabindex') ? el.tabIndex : undefined),
      accessibleName: _getAccessibleName(el),
    };

    const text = {
      innerText: (el.innerText || '').trim().slice(0, 500),
      textContent: (el.textContent || '').trim().slice(0, 500),
      value: el.value !== undefined ? String(el.value).slice(0, 500) : undefined,
      placeholder: el.placeholder || undefined,
      title: el.title || undefined,
      alt: el.alt || undefined,
    };

    const hints = _getFrameworkHints(el);

    const attrs = {};
    for (const attr of el.attributes) {
      if (['class', 'id', 'style'].includes(attr.name)) continue;
      attrs[attr.name] = attr.value.slice(0, 200);
    }

    return {
      found: true, selector,
      xpath: _getXPath(el), cssSelector: getCssSelector(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: el.className ? String(el.className).split(' ').filter(Boolean) : [],
      attributes: attrs, box, visibility, stacking, hitTest,
      computedStyles, a11y, text, hints,
    };
  },

  // === Article Extraction (Phase 4) ===

  extractArticle({ maxTextLength = 50000 } = {}) {
    const title = _articleGetTitle();
    const byline = _articleGetByline();
    const date = _articleGetDate();
    const siteName = _articleGetSiteName();

    const { contentEl, layer, score } = _articleFindContent();
    const cleaned = _articleClean(contentEl);

    const rawText = (cleaned.innerText || cleaned.textContent || '').trim();
    const text = rawText.slice(0, maxTextLength);
    const wordCount = rawText.split(/\s+/).filter(Boolean).length;
    const readingTimeMin = Math.max(1, Math.round(wordCount / 200));

    const headings = Array.from(cleaned.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
      level: Number(h.tagName.slice(1)),
      text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 240),
    }));

    const links = Array.from(cleaned.querySelectorAll('a[href]')).map((a) => {
      let href = a.getAttribute('href') || '';
      try {
        if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto')) {
          href = new URL(href, window.location.href).href;
        }
      } catch (_) {}
      return {
        href,
        text: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 200),
        isExternal: (() => { try { return new URL(href).origin !== location.origin; } catch { return false; } })(),
      };
    }).filter((l) => l.href && !l.href.startsWith('javascript:'));

    const images = Array.from(cleaned.querySelectorAll('img')).map((img) => ({
      src: img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || undefined,
      alt: img.alt || undefined,
    })).filter((i) => i.src);

    const codeBlocks = Array.from(cleaned.querySelectorAll('pre, pre code')).map((pre) => ({
      language: pre.className?.match(/(?:language-|lang-)(\w+)/)?.[1] || undefined,
      text: pre.textContent.trim().slice(0, 2000),
    }));

    const confidence = score >= 500 ? 'high' : score >= 150 ? 'medium' : score >= 80 ? 'low' : 'fallback';
    const sourceSelector = getCssSelector(contentEl);

    return {
      title, byline, date, siteName,
      url: location.href, text,
      textLength: rawText.length,
      truncated: rawText.length > maxTextLength,
      wordCount, readingTimeMin,
      readingTime: readingTimeMin < 1 ? '< 1 min read' : `${readingTimeMin} min read`,
      headings,
      links: links.slice(0, 200),
      images: images.slice(0, 50),
      codeBlocks: codeBlocks.slice(0, 30),
      extraction: { layer, score: Math.round(score), confidence, sourceSelector, sourceTag: contentEl.tagName?.toLowerCase() },
    };
  },
};

// ── Element debug helpers ──────────────────────────────────────────────────

function _getAccessibleName(el) {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labels = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
    if (labels.length) return labels.join(' ');
  }
  if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent?.trim();
    }
  }
  if (el.tagName === 'IMG') return el.alt || undefined;
  if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
    return (el.textContent || '').trim().slice(0, 200) || undefined;
  }
  return el.title || (el.textContent || '').trim().slice(0, 200) || undefined;
}

function _getFrameworkHints(el) {
  const hints = {};
  const reactKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  if (reactKey) hints.react = true;
  const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (reactPropsKey) {
    const props = el[reactPropsKey];
    if (props) hints.reactProps = Object.keys(props).slice(0, 8);
  }
  if (el.__vue__) hints.vue = true;
  if (el.__vueParentComponent) hints.vue3 = true;
  const ngKey = Object.keys(el).find((k) => k.startsWith('__ng'));
  if (ngKey) hints.angular = true;
  const svelteKey = Object.keys(el).find((k) => k.startsWith('__svelte'));
  if (svelteKey) hints.svelte = true;
  const dataAttrs = {};
  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-')) dataAttrs[attr.name] = attr.value.slice(0, 100);
  }
  if (Object.keys(dataAttrs).length) hints.dataAttributes = dataAttrs;
  return Object.keys(hints).length ? hints : undefined;
}

function _getXPath(el) {
  if (el.id) return `//*[@id="${el.id}"]`;
  const parts = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
    let index = 1;
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
    node = node.parentElement;
  }
  return `/html/${parts.join('/')}`;
}

function _findNearbyCandidates(selector) {
  const candidates = [];
  try {
    const tagMatch = selector.match(/^([a-z]+)/i);
    if (tagMatch) {
      const tag = tagMatch[1];
      for (const el of Array.from(document.querySelectorAll(tag)).slice(0, 5)) {
        candidates.push({ tag: el.tagName.toLowerCase(), selector: getCssSelector(el), text: (el.textContent || '').trim().slice(0, 80) });
      }
    }
    const idMatch = selector.match(/#([a-z0-9_-]+)/i);
    if (idMatch) {
      const partial = idMatch[1].toLowerCase();
      for (const el of document.querySelectorAll('[id]')) {
        if (el.id.toLowerCase().includes(partial)) {
          candidates.push({ tag: el.tagName.toLowerCase(), selector: `#${el.id}`, text: (el.textContent || '').trim().slice(0, 80) });
        }
        if (candidates.length >= 5) break;
      }
    }
    const classMatch = selector.match(/\.([a-z0-9_-]+)/i);
    if (classMatch) {
      const partial = classMatch[1].toLowerCase();
      for (const el of document.querySelectorAll('[class]')) {
        if ([...el.classList].some((c) => c.toLowerCase().includes(partial))) {
          candidates.push({ tag: el.tagName.toLowerCase(), selector: getCssSelector(el), text: (el.textContent || '').trim().slice(0, 80) });
        }
        if (candidates.length >= 5) break;
      }
    }
  } catch (_) {}
  return candidates.slice(0, 5);
}

// ── Article extraction helpers ─────────────────────────────────────────────

const _ARTICLE_STRIP = [
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  '[role="search"]', '[role="form"]',
  '[class*="advert"]', '[class*="-ad-"]', '[class*="__ad"]',
  '[id*="google_ad"]', '[class*="sponsor"]', '[id*="sponsor"]',
  '[data-ad]', '[data-advertisement]',
  '[class*="share-"]', '[class*="sharing"]', '[class*="social-"]',
  '[class*="follow-"]', '[class*="like-button"]',
  '[class*="comments"]', '[id*="comments"]', '#disqus_thread',
  '[class*="discussion"]', '.utterances', '[class*="respond"]',
  '[class*="related"]', '[class*="recommended"]', '[class*="more-like"]',
  '[class*="popular-"]', '[class*="trending"]', '[class*="also-read"]',
  '[class*="more-stories"]', '[class*="read-more"]',
  '[class*="newsletter"]', '[class*="subscribe"]', '[class*="subscription"]',
  '[class*="paywall"]', '[class*="cta-"]', '[class*="-cta"]',
  '[class*="signup"]', '[class*="sign-up"]', '[class*="upsell"]',
  '[class*="cookie"]', '[class*="gdpr"]', '[class*="consent"]',
  '[class*="popup"]', '[class*="modal"]', '[class*="lightbox"]',
  '[class*="overlay"]', '[class*="sticky"]', '[class*="fixed-"]',
  '[class*="breadcrumb"]', '[class*="pagination"]', '[class*="pager"]',
  '[class*="tag-list"]', '[class*="category-list"]',
  '[class*="widget"]', '[class*="toolbar"]', '[class*="toc"]',
  '[aria-hidden="true"]',
  'script', 'style', 'noscript', 'template', 'link',
  'form', 'input', 'button', 'select', 'textarea',
  'iframe:not([src*="youtube.com"]):not([src*="youtu.be"]):not([src*="vimeo.com"])',
];

const _ARTICLE_SEMANTIC = [
  '[itemprop="articleBody"]', '[itemprop="text"]',
  'article', '[role="article"]',
  '.post-content', '.entry-content', '.article-content', '.article-body',
  '.post-body', '.story-body', '.content-body', '.post__content',
  '.article__body', '.article__content', '.entry__content',
  '#article-content', '#post-content', '#entry-content', '#article-body',
  '.available-content', '.section-content', '.markdown-body',
  '.expando .usertext-body .md', 'shreddit-post', '.usertext-body',
  '.js-article-body', '.story__body',
  '[data-testid="article-body"]', '[data-module="ArticleBody"]',
  '.documentation', '.doc-content', '.docs-content',
  '.content-area', '.page-article',
  '.readable', '.reader-content', '.article-wrap',
  'main', '[role="main"]',
  '#main-content', '#main', '#content',
  '.main-content', '.page-content', '.content',
];

function _articleScore(el) {
  const text = el.innerText || el.textContent || '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 50) return -1;
  const paras = el.querySelectorAll('p').length;
  const headings = el.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
  const images = el.querySelectorAll('img').length;
  const lists = el.querySelectorAll('li').length;
  const anchors = el.querySelectorAll('a');
  const linkWords = [...anchors].reduce((n, a) => n + (a.textContent.trim().split(/\s+/).filter(Boolean).length), 0);
  const linkDensity = words > 0 ? linkWords / words : 0;
  if (linkDensity > 0.55) return -1;
  const paraBonus = Math.min(paras * 1.5, 9);
  const headingBonus = Math.min(headings * 0.6, 3);
  const imageBonus = Math.min(images * 0.4, 2);
  const listBonus = Math.min(lists * 0.05, 0.5);
  const linkPenalty = linkDensity * 4;
  return words * (1 + paraBonus + headingBonus + imageBonus + listBonus) / (1 + linkPenalty);
}

function _articleClean(el) {
  const clone = el.cloneNode(true);
  _ARTICLE_STRIP.forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch (_) {}
  });
  clone.querySelectorAll('img').forEach((img) => {
    const lazy = img.dataset.src || img.dataset.lazySrc || img.dataset.original
      || img.getAttribute('data-lazy-src') || img.getAttribute('data-echo');
    if (lazy && (!img.src || /^data:image\/gif/.test(img.src) ||
      img.src.includes('placeholder') || img.src.includes('blank'))) {
      img.src = lazy;
    }
  });
  clone.querySelectorAll('a[href]').forEach((a) => {
    try {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto')) {
        a.href = new URL(href, window.location.href).href;
      }
    } catch (_) {}
  });
  clone.querySelectorAll('p,div,span,li').forEach((el) => {
    if (!el.textContent.trim() && !el.querySelector('img,video,iframe,table,pre,code')) {
      el.remove();
    }
  });
  return clone;
}

function _articleFindContent() {
  for (const sel of _ARTICLE_SEMANTIC) {
    let best = null, bestScore = -1;
    try {
      document.querySelectorAll(sel).forEach((el) => {
        const s = _articleScore(el);
        if (s > bestScore) { bestScore = s; best = el; }
      });
    } catch (_) { continue; }
    if (best && bestScore >= 150) {
      return { contentEl: best, layer: 'semantic', score: bestScore };
    }
  }
  let bestEl = null, bestScore = 0;
  document.querySelectorAll('div, section').forEach((el) => {
    if (el.querySelectorAll('div, section').length > 40) return;
    const s = _articleScore(el);
    if (s > bestScore) { bestScore = s; bestEl = el; }
  });
  if (bestEl && bestScore >= 80) {
    return { contentEl: bestEl, layer: 'density', score: bestScore };
  }
  return { contentEl: document.body, layer: 'fallback', score: _articleScore(document.body) };
}

function _articleGetTitle() {
  const candidates = [
    document.querySelector('meta[property="og:title"]')?.content,
    document.querySelector('meta[name="twitter:title"]')?.content,
    document.querySelector('[itemprop="headline"]')?.textContent,
    document.querySelector('h1')?.textContent,
    document.title,
  ];
  for (const c of candidates) {
    const t = (c || '').trim().replace(/\s+/g, ' ');
    if (t && t.length >= 4 && t.length <= 300) return t;
  }
  return 'Untitled';
}

function _articleGetByline() {
  const sels = [
    '[itemprop="author"] [itemprop="name"]', '[itemprop="author"]',
    '[rel="author"]', '[class*="author-name"]', '[class*="author_name"]',
    '[class*="byline"]', '[class*="by-line"]', 'meta[name="author"]',
  ];
  for (const sel of sels) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.content || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (text && text.length < 120) return text;
      }
    } catch (_) {}
  }
  return '';
}

function _articleGetDate() {
  const sels = [
    'time[datetime]', '[itemprop="datePublished"]',
    'meta[property="article:published_time"]', 'meta[name="publish-date"]',
  ];
  for (const sel of sels) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = el.getAttribute('datetime') || el.content || el.textContent;
      if (raw) {
        try {
          return new Date(raw).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (_) { return raw.trim().slice(0, 30); }
      }
    } catch (_) {}
  }
  return '';
}

function _articleGetSiteName() {
  return document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
    document.querySelector('meta[name="application-name"]')?.content?.trim() ||
    '';
}

const accessibilityInspector = {
  getTree() {
    function walk(node) {
      if (!node) return null;
      const role = node.getAttribute?.('role') || inferRole(node);
      const label = node.getAttribute?.('aria-label')
        || node.getAttribute?.('aria-labelledby')
        || (node.tagName === 'IMG' ? node.alt : null)
        || node.textContent?.trim().slice(0, 80);
      const children = Array.from(node.children || []).map(walk).filter(Boolean);
      return { tag: node.tagName?.toLowerCase(), role, label: label || undefined, children: children.length ? children : undefined };
    }
    return walk(document.body);
  },

  checkContrast() {
    const issues = [];
    document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, a, button, label, span').forEach((el) => {
      const style = getComputedStyle(el);
      if (style.color === style.backgroundColor) {
        issues.push({ selector: el.tagName.toLowerCase(), issue: 'foreground equals background' });
      }
    });
    return issues;
  },

  getHeadingOrder() {
    return Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
      level: parseInt(h.tagName[1]),
      text: h.textContent.trim().slice(0, 100),
    }));
  },
};

const responsiveInspector = {
  // Compares with the viewport, because the body can be narrower than the page when it's a centered column.
  findOverflow() {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    if (root.scrollWidth <= viewportWidth + 1) return [];
    const isClipped = (el) => {
      for (let parent = el.parentElement; parent && parent !== document.body && parent !== root; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible') return true;
      }
      return false;
    };
    const overflow = [];
    document.querySelectorAll('body *').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > viewportWidth + 1 && !isClipped(el)) {
        overflow.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          classes: el.getAttribute('class') || undefined,
          right: rect.right,
          viewportWidth,
        });
      }
    });
    return overflow;
  },

  findOverlaps() {
    // The shapes inside an SVG are meant to overlap, so an SVG counts as one element. Invisible elements, such as a
    // styled checkbox under its label, can't visibly overlap anything.
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const elements = Array.from(document.querySelectorAll('body *'))
      .filter((el) => !el.parentElement.closest('svg') && isVisible(el));
    const overlaps = [];
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        if (elements[i].contains(elements[j]) || elements[j].contains(elements[i])) continue;
        const a = elements[i].getBoundingClientRect();
        const b = elements[j].getBoundingClientRect();
        if (a.width > 0 && b.width > 0 &&
            a.left < b.right && a.right > b.left &&
            a.top < b.bottom && a.bottom > b.top) {
          const overlapW = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapH = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          const overlapArea = overlapW * overlapH;
          const minArea = Math.min(a.width * a.height, b.width * b.height);
          if (minArea > 0 && overlapArea / minArea > 0.1) {
            overlaps.push({
              a: { tag: elements[i].tagName.toLowerCase(), id: elements[i].id },
              b: { tag: elements[j].tagName.toLowerCase(), id: elements[j].id },
            });
            if (overlaps.length >= 20) return overlaps;
          }
        }
      }
    }
    return overlaps;
  },
};

const frameworkInspector = {
  detect() {
    const detected = [];

    if (window.__NEXT_DATA__) detected.push({ name: 'Next.js', data: window.__NEXT_DATA__ });
    if (window.__nuxt__) detected.push({ name: 'Nuxt.js' });
    if (window.angular || document.querySelector('[ng-version]')) detected.push({ name: 'Angular' });
    if (window.Vue || document.querySelector('[data-v-app]')) detected.push({ name: 'Vue' });
    if (document.querySelector('#__remix-error')) detected.push({ name: 'Remix' });
    if (window.__SVELTE__) detected.push({ name: 'Svelte' });

    const root = document.querySelector('#root, #app, [data-reactroot]');
    if (root) {
      const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (fiberKey) detected.push({ name: 'React' });
    }

    return detected.length ? detected : [{ name: 'unknown' }];
  },

  getNextData() {
    return window.__NEXT_DATA__ ?? null;
  },

  getClientStorage() {
    return {
      localStorage: Object.fromEntries(
        Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])
      ),
      sessionStorage: Object.fromEntries(
        Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)])
      ),
    };
  },

  getFeatureFlags() {
    const candidates = ['__ldClient', '__growthbook', '__statsig', 'LaunchDarkly', 'Optimizely'];
    return candidates
      .filter((k) => window[k])
      .map((k) => ({ name: k, present: true }));
  },
};

function getCssSelector(el) {
  if (el.id) return `#${el.id}`;
  const path = [];
  let node = el;
  while (node && node !== document.body) {
    let selector = node.tagName.toLowerCase();
    if (node.classList?.length) selector += '.' + [...node.classList].join('.');
    const siblings = node.parentNode ? Array.from(node.parentNode.children).filter((s) => s.tagName === node.tagName) : [];
    if (siblings.length > 1) selector += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    path.unshift(selector);
    node = node.parentNode;
  }
  return path.join(' > ');
}

function getElementXPath(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
  if (element.id) return `//*[@id="${element.id.replace(/"/g, '\\"')}"]`;
  if (element === document.body) return '/html/body';
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  return `/html/${parts.join('/')}`;
}

function elementRef(element) {
  return {
    selector: getCssSelector(element),
    xpath: getElementXPath(element),
  };
}

function normalizeAssetUrl(value, base = document.baseURI || location.href) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('javascript:')) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('data:')) return null;
  try {
    return new URL(trimmed, base).href;
  } catch {
    return null;
  }
}

function extensionFromUrl(url) {
  if (!url || url.startsWith('data:')) return '';
  try {
    const name = new URL(url).pathname.split('/').pop() || '';
    return (name.split('.').pop() || '').toLowerCase();
  } catch {
    return '';
  }
}

function parseSrcset(srcset) {
  if (!srcset) return [];
  return srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .map((url) => normalizeAssetUrl(url))
    .filter(Boolean);
}

function dedupeByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.url || item.src || item.href || item.selector || item.xpath || '').split('#')[0];
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dataUriMeta(mime) {
  const normalized = String(mime || 'text/plain').toLowerCase();
  const exact = {
    'image/png': ['image', 'png'],
    'image/jpeg': ['image', 'jpg'],
    'image/jpg': ['image', 'jpg'],
    'image/webp': ['image', 'webp'],
    'image/gif': ['image', 'gif'],
    'image/svg+xml': ['image', 'svg'],
    'audio/mpeg': ['audio', 'mp3'],
    'audio/mp3': ['audio', 'mp3'],
    'audio/wav': ['audio', 'wav'],
    'audio/ogg': ['audio', 'ogg'],
    'video/mp4': ['video', 'mp4'],
    'video/webm': ['video', 'webm'],
    'text/csv': ['csv', 'csv'],
    'application/json': ['json', 'json'],
    'text/json': ['json', 'json'],
    'text/html': ['html', 'html'],
    'text/xml': ['xml', 'xml'],
    'application/xml': ['xml', 'xml'],
    'application/pdf': ['pdf', 'pdf'],
    'text/plain': ['text', 'txt'],
    'text/markdown': ['text', 'md'],
    'font/woff': ['font', 'woff'],
    'font/woff2': ['font', 'woff2'],
    'font/ttf': ['font', 'ttf'],
  }[normalized];
  if (exact) return { category: exact[0], extension: exact[1] };
  const prefix = normalized.split('/')[0];
  return { category: ['image', 'audio', 'video', 'text', 'font'].includes(prefix) ? prefix : 'binary', extension: 'bin' };
}

function formatDataUriBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseDataUriSummary(raw, includePreview = false) {
  if (!raw || typeof raw !== 'string' || !raw.startsWith('data:')) return null;
  const trimmed = raw.trim();
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex < 0) return null;
  const headerParts = trimmed.slice(5, commaIndex).split(';').filter(Boolean);
  const mimePart = headerParts[0]?.includes('/') ? headerParts.shift() : '';
  const mime = (mimePart || 'text/plain').trim().toLowerCase() || 'text/plain';
  const isBase64 = headerParts.some((part) => part.toLowerCase() === 'base64');
  const params = headerParts.filter((part) => part.toLowerCase() !== 'base64').join(';') || undefined;
  const encoding = isBase64 ? 'base64' : 'url';
  const payload = trimmed.slice(commaIndex + 1);
  const stripped = encoding === 'base64' ? payload.replace(/\s/g, '') : payload;
  const size = encoding === 'base64'
    ? Math.max(0, Math.floor((stripped.length * 3) / 4) - ((stripped.match(/=+$/) || [''])[0].length))
    : (() => {
        try { return new Blob([decodeURIComponent(stripped)]).size; } catch (_) { return stripped.length; }
      })();
  const meta = dataUriMeta(mime);
  const summary = {
    mime,
    params,
    encoding,
    size,
    sizeText: formatDataUriBytes(size),
    category: meta.category,
    extension: meta.extension,
    isLarge: size > 10 * 1024 * 1024,
    isPreviewSafe: size <= 100 * 1024,
    dataUriPreview: raw.slice(0, 180),
    dataUriLength: raw.length,
  };
  if (includePreview && (mime.startsWith('text/') || ['application/json', 'application/xml'].includes(mime)) && size <= 100 * 1024) {
    try {
      summary.textPreview = decodeURIComponent(stripped).slice(0, 500);
    } catch (_) {
      summary.textPreview = stripped.slice(0, 500);
    }
  }
  if (mime === 'image/svg+xml' && size <= 100 * 1024) {
    try {
      const text = encoding === 'base64' ? atob(stripped) : decodeURIComponent(stripped);
      const width = Number(/<svg[^>]*\bwidth=["']?([0-9.]+)/i.exec(text)?.[1]);
      const height = Number(/<svg[^>]*\bheight=["']?([0-9.]+)/i.exec(text)?.[1]);
      if (width && height) summary.dimensions = { width, height };
    } catch (_) {}
  }
  return summary;
}

function extractDataUrisFromText(text) {
  if (!text || typeof text !== 'string') return [];
  return text.match(/data:[a-zA-Z0-9][^\s"'`<>)\]}{\\]+/g) ?? [];
}

function extractDataUris() {
  const seen = new Set();
  const items = [];

  function add(raw, el, source, attribute) {
    if (!raw || typeof raw !== 'string') return;
    const candidates = raw.startsWith('data:') ? [raw] : extractDataUrisFromText(raw);
    candidates.forEach((candidate) => {
      const cleaned = candidate.replace(/[.,;:!?)]+$/, '');
      if (seen.has(cleaned)) return;
      const summary = parseDataUriSummary(cleaned, true);
      if (!summary) return;
      seen.add(cleaned);
      const rect = el?.getBoundingClientRect?.();
      items.push({
        source,
        attribute,
        tag: el?.tagName?.toLowerCase(),
        textSample: el?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) || undefined,
        renderedWidth: rect ? Math.round(rect.width) || undefined : undefined,
        renderedHeight: rect ? Math.round(rect.height) || undefined : undefined,
        ...summary,
        ...(el ? elementRef(el) : {}),
      });
    });
  }

  const attributes = ['src', 'href', 'poster', 'srcset', 'data-src', 'data-lazy', 'style'];
  Array.from(document.querySelectorAll('*')).slice(0, 5000).forEach((el) => {
    attributes.forEach((attribute) => {
      const value = attribute === 'style' ? el.getAttribute('style') : el.getAttribute(attribute);
      if (value?.includes('data:')) add(value, el, attribute === 'style' ? 'inline-style' : 'attribute', attribute);
    });
  });
  Array.from(document.styleSheets || []).forEach((sheet) => {
    let rules = [];
    try {
      rules = Array.from(sheet.cssRules || []);
    } catch (_) {
      return;
    }
    rules.slice(0, 2000).forEach((rule) => {
      if (rule.cssText?.includes('data:')) add(rule.cssText, null, 'stylesheet', rule.selectorText || rule.type);
    });
  });
  Array.from(document.querySelectorAll('script:not([src])')).slice(0, 200).forEach((script) => {
    if (script.textContent?.includes('data:')) add(script.textContent, script, 'inline-script', 'textContent');
  });

  const byCategory = {};
  const bySource = {};
  items.forEach((item) => {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  });

  return {
    items: items.slice(0, 200),
    summary: {
      total: items.length,
      returned: Math.min(items.length, 200),
      large: items.filter((item) => item.isLarge).length,
      byCategory,
      bySource,
    },
  };
}

function textRefsForValues(values, normalizer = (value) => String(value || '').toLowerCase()) {
  const refs = new Map();
  const pending = values
    .map((value) => ({ value, needle: normalizer(value) }))
    .filter((entry) => entry.needle);
  if (!pending.length) return refs;

  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node?.nodeValue || !node.parentElement) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    }
  );

  let node;
  while (pending.length && (node = walker.nextNode())) {
    const haystack = normalizer(node.nodeValue);
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (!haystack.includes(pending[index].needle)) continue;
      refs.set(pending[index].value, elementRef(node.parentElement));
      pending.splice(index, 1);
    }
  }
  return refs;
}

function extractContacts() {
  const text = document.body?.innerText || '';
  const emailValues = [...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])];
  const phoneValues = [...new Set((text.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) ?? [])
    .map((phone) => phone.trim().replace(/\s+/g, ' '))
    .filter((phone) => phone.replace(/\D+/g, '').length >= 7))];
  const emailRefs = textRefsForValues(emailValues);
  const phoneRefs = textRefsForValues(phoneValues, (value) => String(value || '').replace(/\D+/g, ''));

  const mailtoEmails = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map((a) => {
    const value = a.href.replace(/^mailto:/i, '').split('?')[0];
    return {
      value,
      href: a.href,
      label: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) || undefined,
      source: 'mailto',
      ...elementRef(a),
    };
  });
  const telPhones = Array.from(document.querySelectorAll('a[href^="tel:"]')).map((a) => {
    const value = a.href.replace(/^tel:/i, '').split('?')[0];
    return {
      value,
      href: a.href,
      label: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) || undefined,
      source: 'tel',
      ...elementRef(a),
    };
  });

  const emails = dedupeByUrl([
    ...emailValues.map((value) => ({ value, source: 'text', ...(emailRefs.get(value) || {}) })),
    ...mailtoEmails,
  ].map((item) => ({ ...item, url: item.value }))).map(({ url: _url, ...item }) => item);

  const phones = dedupeByUrl([
    ...phoneValues.map((value) => ({ value, normalized: value.replace(/\D+/g, ''), source: 'text', ...(phoneRefs.get(value) || {}) })),
    ...telPhones,
  ].map((item) => ({ ...item, url: item.normalized || item.value }))).map(({ url: _url, ...item }) => item);

  const addresses = Array.from(document.querySelectorAll('[itemtype*="PostalAddress"], address, [data-address], [class*="address" i]'))
    .map((el) => ({
      value: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 500),
      source: el.tagName.toLowerCase(),
      ...elementRef(el),
    }))
    .filter((item) => item.value);

  const coordinateNodes = Array.from(document.querySelectorAll('[data-lat],[data-lng],[data-lon],[data-coordinates],[data-latitude],[data-longitude]'))
    .map((el) => {
      const lat = el.getAttribute('data-lat') || el.getAttribute('data-latitude');
      const lon = el.getAttribute('data-lng') || el.getAttribute('data-lon') || el.getAttribute('data-longitude');
      const coordinates = el.getAttribute('data-coordinates') || (lat && lon ? `${lat}, ${lon}` : '');
      return coordinates ? { coordinates, source: 'data-attribute', ...elementRef(el) } : null;
    })
    .filter(Boolean);
  const geoMeta = [
    document.querySelector('meta[name="geo.position"]')?.content,
    document.querySelector('meta[name="ICBM"]')?.content,
  ].filter(Boolean).map((coordinates) => ({ coordinates, source: 'meta' }));
  const mapLinks = Array.from(document.querySelectorAll('a[href], iframe[src]'))
    .map((el) => {
      const url = normalizeAssetUrl(el.getAttribute('href') || el.getAttribute('src'));
      if (!url || !/maps|google\.com\/maps|openstreetmap|geo:/i.test(url)) return null;
      return { url, source: el.tagName.toLowerCase(), ...elementRef(el) };
    })
    .filter(Boolean);

  return {
    emails,
    phones,
    addresses: dedupeByUrl(addresses.map((item) => ({ ...item, url: item.value }))).map(({ url: _url, ...item }) => item),
    locations: [...coordinateNodes, ...geoMeta, ...mapLinks],
    summary: {
      emails: emails.length,
      phones: phones.length,
      addresses: addresses.length,
      locations: coordinateNodes.length + geoMeta.length + mapLinks.length,
    },
  };
}

function extractDesignTokens() {
  const colorMap = new Map();
  const fontMap = new Map();
  const cssVariables = new Map();
  const sampleElements = Array.from(document.querySelectorAll('body *')).slice(0, 2000);
  const step = Math.max(1, Math.floor(sampleElements.length / 350));

  function addMapEntry(map, key, entry) {
    if (!key || key === 'transparent' || key === 'rgba(0, 0, 0, 0)' || key === 'currentcolor') return;
    const normalized = String(key).replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    if (!map.has(normalized)) map.set(normalized, { value: normalized, count: 0, samples: [] });
    const item = map.get(normalized);
    item.count += 1;
    if (item.samples.length < 5) item.samples.push(entry);
  }

  for (let i = 0; i < sampleElements.length; i += step) {
    const el = sampleElements[i];
    const styles = getComputedStyle(el);
    const ref = elementRef(el);
    ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'].forEach((prop) => {
      addMapEntry(colorMap, styles[prop], {
        property: prop,
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || undefined,
        ...ref,
      });
    });
    const fontFamily = (styles.fontFamily || '').split(',')[0].replace(/['"]/g, '').trim();
    addMapEntry(fontMap, fontFamily, {
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      lineHeight: styles.lineHeight,
      tag: el.tagName.toLowerCase(),
      ...ref,
    });
  }

  Array.from(document.styleSheets || []).forEach((sheet) => {
    let rules = [];
    try {
      rules = Array.from(sheet.cssRules || []);
    } catch (_) {
      return;
    }
    rules.forEach((rule) => {
      const style = rule.style;
      if (!style) return;
      Array.from(style).forEach((property) => {
        if (!property.startsWith('--')) return;
        if (!cssVariables.has(property)) cssVariables.set(property, { name: property, values: new Set(), selectors: [] });
        const item = cssVariables.get(property);
        item.values.add(style.getPropertyValue(property).trim());
        if (item.selectors.length < 8 && rule.selectorText) item.selectors.push(rule.selectorText);
      });
    });
  });

  const variables = Array.from(cssVariables.values()).map((item) => ({
    name: item.name,
    values: Array.from(item.values).filter(Boolean).slice(0, 10),
    selectors: item.selectors,
  }));
  const colors = Array.from(colorMap.values()).sort((a, b) => b.count - a.count).slice(0, 120);
  const fonts = Array.from(fontMap.values()).sort((a, b) => b.count - a.count).slice(0, 80);

  return {
    colors,
    fonts,
    cssVariables: variables,
    summary: {
      colors: colors.length,
      fonts: fonts.length,
      cssVariables: variables.length,
      sampledElements: sampleElements.length,
    },
  };
}

function inferRole(el) {
  const map = { A: 'link', BUTTON: 'button', INPUT: 'input', SELECT: 'listbox',
    TEXTAREA: 'textbox', FORM: 'form', NAV: 'navigation', MAIN: 'main',
    HEADER: 'banner', FOOTER: 'contentinfo', ASIDE: 'complementary' };
  return map[el.tagName] || undefined;
}

const extractors = {
  metadata: () => {
    const metaTags = Array.from(document.querySelectorAll('meta')).map((meta) => ({
      name: meta.getAttribute('name') || undefined,
      property: meta.getAttribute('property') || undefined,
      httpEquiv: meta.getAttribute('http-equiv') || undefined,
      content: meta.getAttribute('content') || '',
      ...elementRef(meta),
    }));
    const links = Array.from(document.querySelectorAll('link[rel]')).map((link) => ({
      rel: link.rel,
      href: link.href || link.getAttribute('href') || '',
      hreflang: link.hreflang || undefined,
      media: link.media || undefined,
      type: link.type || undefined,
      sizes: link.sizes?.value || undefined,
      ...elementRef(link),
    }));
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent.trim().replace(/\s+/g, ' ').slice(0, 240),
      ...elementRef(heading),
    }));
    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((script, index) => {
      const raw = script.textContent || '';
      try {
        return { index, parsed: JSON.parse(raw), rawLength: raw.length, ...elementRef(script) };
      } catch (err) {
        return { index, error: err.message, raw: raw.slice(0, 1000), rawLength: raw.length, ...elementRef(script) };
      }
    });
    const byName = (name) => metaTags.find((meta) => meta.name?.toLowerCase() === name.toLowerCase())?.content;
    const byProperty = (property) => metaTags.find((meta) => meta.property?.toLowerCase() === property.toLowerCase())?.content;
    const canonical = links.find((link) => /\bcanonical\b/i.test(link.rel))?.href;
    const alternates = links.filter((link) => /\balternate\b/i.test(link.rel));

    return {
      title: document.title,
      description: byName('description'),
      canonical,
      robots: byName('robots'),
      viewport: byName('viewport'),
      language: document.documentElement.lang || undefined,
      url: location.href,
      origin: location.origin,
      path: location.pathname,
      og: {
        title: byProperty('og:title'),
        description: byProperty('og:description'),
        image: byProperty('og:image'),
        type: byProperty('og:type'),
        url: byProperty('og:url'),
        siteName: byProperty('og:site_name'),
      },
      twitter: {
        card: byName('twitter:card'),
        title: byName('twitter:title'),
        description: byName('twitter:description'),
        image: byName('twitter:image'),
      },
      headings,
      metaTags,
      links,
      alternates,
      jsonLd,
      summary: {
        metaTags: metaTags.length,
        links: links.length,
        headings: headings.length,
        h1: headings.filter((heading) => heading.level === 1).length,
        jsonLd: jsonLd.length,
        invalidJsonLd: jsonLd.filter((item) => item.error).length,
        hasCanonical: Boolean(canonical),
        hasDescription: Boolean(byName('description')),
        hasViewport: Boolean(byName('viewport')),
      },
    };
  },

  links: () =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      href: a.href,
      text: a.textContent.trim().slice(0, 200),
      rel: a.rel || undefined,
    })),

  pageLinks: () =>
    Array.from(document.querySelectorAll('a[href]'))
      .filter((a) => {
        try { return new URL(a.href).origin === location.origin; } catch { return false; }
      })
      .map((a) => ({ href: a.href, text: a.textContent.trim().slice(0, 200) })),

  images: () =>
    Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.src || img.currentSrc,
      alt: img.alt || undefined,
      width: img.naturalWidth || undefined,
      height: img.naturalHeight || undefined,
    })),

  tables: () =>
    Array.from(document.querySelectorAll('table')).map((table, index) => {
      const caption = table.querySelector('caption')?.textContent.trim().replace(/\s+/g, ' ') || undefined;
      const allRows = Array.from(table.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th, td')).map((cell) => ({
          text: cell.textContent.trim().replace(/\s+/g, ' '),
          header: cell.tagName === 'TH',
          colspan: Number(cell.getAttribute('colspan') || 1),
          rowspan: Number(cell.getAttribute('rowspan') || 1),
        }))
      ).filter((row) => row.length);
      const headerRow = allRows.find((row) => row.some((cell) => cell.header)) || allRows[0] || [];
      const headers = headerRow.map((cell, cellIndex) => cell.text || `Column ${cellIndex + 1}`);
      const bodyRows = allRows.filter((row) => row !== headerRow || !row.some((cell) => cell.header));
      const rows = bodyRows.map((row) => row.map((cell) => cell.text));
      const objects = rows.map((row) => Object.fromEntries(headers.map((header, cellIndex) => [header, row[cellIndex] ?? ''])));
      const rect = table.getBoundingClientRect();
      return {
        index,
        caption,
        headers,
        rows,
        objects,
        rowCount: rows.length,
        columnCount: headers.length,
        renderedWidth: Math.round(rect.width) || undefined,
        renderedHeight: Math.round(rect.height) || undefined,
        ...elementRef(table),
      };
    }),

  emails: () => extractContacts().emails,

  phones: () => extractContacts().phones,

  structuredData: () =>
    Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => {
      try { return JSON.parse(s.textContent); } catch { return null; }
    }).filter(Boolean),

  fonts: () =>
    extractDesignTokens().fonts,

  colors: () =>
    extractDesignTokens().colors,

  lists: () =>
    Array.from(document.querySelectorAll('ul, ol')).map((list) => ({
      type: list.tagName.toLowerCase(),
      items: Array.from(list.querySelectorAll('li')).map((li) => li.textContent.trim()),
    })),

  videos: () =>
    Array.from(document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]')).map((v) => ({
      src: v.src || v.currentSrc,
      type: v.tagName.toLowerCase(),
    })),

  files: () => {
    const linkFiles = Array.from(document.querySelectorAll('a[href]'))
      .filter((a) => /\.(pdf|doc|docx|xls|xlsx|csv|zip|gz|tar|mp3|mp4|mov|avi)(\?|$)/i.test(a.href))
      .map((a) => ({ href: a.href, text: a.textContent.trim(), ext: a.href.split('.').pop().split('?')[0], source: 'link' }));
    const mediaFiles = Array.from(document.querySelectorAll('audio, video, audio source, video source'))
      .map((el) => {
        const src = el.src || el.currentSrc || el.getAttribute('src');
        if (!src || src.startsWith('blob:') || src.startsWith('data:')) return null;
        const ext = src.split('.').pop().split('?')[0].toLowerCase();
        const label = el.closest('audio,video')?.getAttribute('aria-label') || el.closest('audio,video')?.getAttribute('title') || '';
        return { href: src, text: label, ext, source: el.tagName.toLowerCase() };
      })
      .filter(Boolean);
    return [...linkFiles, ...mediaFiles];
  },

  icons: () =>
    Array.from(document.querySelectorAll('link[rel*="icon"]')).map((l) => ({ href: l.href, rel: l.rel, sizes: l.sizes?.value })),

  network: () => ({ note: 'Network data requires DevTools session (fileforge_devtools_start_session)' }),

  addresses: () => extractContacts().addresses,

  locations: () => {
    return extractContacts().locations;
  },

  qrCodes: () => ({ note: 'QR code detection requires image analysis. Use fileforge_scrape_page then post-process images.' }),

  contacts: () => extractContacts(),

  designTokens: () => extractDesignTokens(),

  dataUris: () => extractDataUris(),

  assets: () => {
    const imageAttrs = ['src', 'currentSrc', 'data-src', 'data-lazy', 'data-original'];
    const images = [];
    Array.from(document.querySelectorAll('img, picture source, [style*="background"]')).forEach((el) => {
      const candidates = [];
      imageAttrs.forEach((attr) => {
        const value = attr === 'currentSrc' ? el.currentSrc : el.getAttribute?.(attr);
        const url = normalizeAssetUrl(value);
        if (url) candidates.push({ url, source: attr });
      });
      parseSrcset(el.getAttribute?.('srcset')).forEach((url) => candidates.push({ url, source: 'srcset' }));
      const background = getComputedStyle(el).backgroundImage;
      Array.from(background.matchAll(/url\(["']?([^"')]+)["']?\)/g)).forEach((match) => {
        const url = normalizeAssetUrl(match[1]);
        if (url) candidates.push({ url, source: 'background-image' });
      });

      candidates.forEach(({ url, source }) => {
        const rect = el.getBoundingClientRect();
        images.push({
          url,
          type: extensionFromUrl(url),
          source,
          alt: el.getAttribute?.('alt') || undefined,
          width: el.naturalWidth || el.width || Math.round(rect.width) || undefined,
          height: el.naturalHeight || el.height || Math.round(rect.height) || undefined,
          renderedWidth: Math.round(rect.width) || undefined,
          renderedHeight: Math.round(rect.height) || undefined,
          ...elementRef(el),
        });
      });
    });

    const videos = [];
    Array.from(document.querySelectorAll('video, video source, iframe')).forEach((el) => {
      const raw = el.getAttribute('src') || el.src || el.currentSrc;
      const url = normalizeAssetUrl(raw);
      if (!url) return;
      const isVideoEmbed = /youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com/i.test(url);
      if (el.tagName !== 'IFRAME' || isVideoEmbed) {
        videos.push({
          url,
          type: el.tagName.toLowerCase() === 'iframe' ? 'embed' : 'video',
          mimeType: el.getAttribute('type') || undefined,
          ...elementRef(el),
        });
      }
    });

    const fileExtensions = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', 'gz', 'tar', 'csv', 'json', 'xml', 'txt', 'mp3', 'mp4', 'mov', 'avi']);
    const files = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => {
        const url = normalizeAssetUrl(a.getAttribute('href'));
        const ext = extensionFromUrl(url);
        if (!url || !fileExtensions.has(ext)) return null;
        return {
          url,
          type: ext,
          label: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) || url.split('/').pop(),
          rel: a.rel || undefined,
          download: a.download || undefined,
          ...elementRef(a),
        };
      })
      .filter(Boolean);

    const icons = [
      ...Array.from(document.querySelectorAll('link[rel*="icon"]')).map((el) => ({
        url: normalizeAssetUrl(el.getAttribute('href')),
        rel: el.rel || undefined,
        sizes: el.sizes?.value || undefined,
        source: 'link',
      })),
      ...Array.from(document.querySelectorAll('svg, img[src*="icon"], [class*="icon"]')).slice(0, 150).map((el) => {
        const src = normalizeAssetUrl(el.getAttribute?.('src'));
        return {
          url: src || undefined,
          source: el.tagName.toLowerCase(),
          label: el.getAttribute?.('aria-label') || el.getAttribute?.('alt') || el.textContent?.trim().slice(0, 80) || undefined,
          ...elementRef(el),
        };
      }),
    ].filter((item) => item.url || item.selector);

    return {
      images: dedupeByUrl(images).slice(0, 500),
      videos: dedupeByUrl(videos).slice(0, 200),
      files: dedupeByUrl(files).slice(0, 300),
      icons: dedupeByUrl(icons).slice(0, 200),
      summary: {
        images: dedupeByUrl(images).length,
        videos: dedupeByUrl(videos).length,
        files: dedupeByUrl(files).length,
        icons: dedupeByUrl(icons).length,
      },
    };
  },
};

window.__fileforge_scrape = function scrape(sections) {
  const all = sections ?? Object.keys(extractors);
  const result = {};
  for (const section of all) {
    const fn = extractors[section];
    if (fn) {
      try {
        result[section] = fn();
      } catch (err) {
        result[section] = { error: err.message };
      }
    }
  }
  return result;
};

// ── QA Inspector ──────────────────────────────────────────────────────────────

const SENSITIVE_FIELD_RE = /password|pass\b|otp|token|secret|api_?key|auth|session|credit|card|cvv|cvc|expir|ssn|pan|aadhaar|billing/i;

const ERROR_PATTERNS = [
  { re: /something went wrong/i, severity: 'high', category: 'application_error' },
  { re: /application error/i, severity: 'high', category: 'application_error' },
  { re: /unexpected error/i, severity: 'high', category: 'application_error' },
  { re: /internal server error/i, severity: 'high', category: 'server_error' },
  { re: /\b500\b.*error|\berror\b.*\b500\b/i, severity: 'high', category: 'server_error' },
  { re: /\b404\b.*not found|page not found/i, severity: 'medium', category: 'not_found' },
  { re: /failed to load/i, severity: 'high', category: 'load_error' },
  { re: /network error/i, severity: 'high', category: 'network_error' },
  { re: /access denied|forbidden|unauthorized/i, severity: 'high', category: 'auth_error' },
  { re: /unhandled (promise|exception|error)/i, severity: 'medium', category: 'js_error' },
  { re: /stack trace/i, severity: 'high', category: 'js_error' },
  { re: /TypeError:|ReferenceError:|ChunkLoadError/i, severity: 'high', category: 'js_error' },
  { re: /this page (isn'?t|is not) working/i, severity: 'high', category: 'page_error' },
  { re: /service unavailable|try again later/i, severity: 'medium', category: 'server_error' },
];

function _quickHash(str) {
  let h = 2166136261;
  for (let i = 0; i < Math.min(str.length, 5000); i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function _isVisible(el) {
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
}

const qaInspector = {

  // ── assert ─────────────────────────────────────────────────────────────────

  runAssertions(assertions) {
    return assertions.map((a) => this._runOne(a));
  },

  _runOne({ type, value, selector, text, count, expected } = {}) {
    const target = text ?? value ?? '';
    try {
      switch (type) {
        case 'url_equals': return this._r(type, location.href === value, `URL equals "${value}"`, `URL is "${location.href}", expected "${value}"`, 'high');
        case 'url_includes': return this._r(type, location.href.includes(value ?? ''), `URL includes "${value}"`, `URL "${location.href}" does not include "${value}"`, 'high');
        case 'url_matches': { const ok = new RegExp(value).test(location.href); return this._r(type, ok, `URL matches /${value}/`, `URL does not match /${value}/`, 'high'); }
        case 'title_equals': return this._r(type, document.title === value, `Title equals "${value}"`, `Title is "${document.title}"`, 'medium');
        case 'title_includes': return this._r(type, document.title.includes(value ?? ''), `Title includes "${value}"`, `Title "${document.title}" does not include "${value}"`, 'medium');
        case 'text_visible': { const body = (document.body?.innerText || '').toLowerCase(); const ok = body.includes(target.toLowerCase()); return this._r(type, ok, `Text "${target}" is visible`, `Text "${target}" not found in visible text`, 'medium'); }
        case 'text_not_visible': { const body = (document.body?.innerText || '').toLowerCase(); const ok = !body.includes(target.toLowerCase()); return this._r(type, ok, `Text "${target}" is not visible`, `Text "${target}" is unexpectedly visible`, 'medium'); }
        case 'selector_exists': { const ok = !!document.querySelector(selector); return { ...this._r(type, ok, `"${selector}" exists`, `"${selector}" not found`, 'high'), selector }; }
        case 'selector_not_exists': { const ok = !document.querySelector(selector); return { ...this._r(type, ok, `"${selector}" does not exist`, `"${selector}" unexpectedly found`, 'medium'), selector }; }
        case 'selector_visible': { const el = document.querySelector(selector); if (!el) return { ...this._r(type, false, '', `"${selector}" not found`, 'high'), selector }; return { ...this._r(type, _isVisible(el), `"${selector}" is visible`, `"${selector}" is not visible`, 'medium'), selector }; }
        case 'selector_hidden': { const el = document.querySelector(selector); if (!el) return { ...this._r(type, true, `"${selector}" not found (treated as hidden)`, '', 'low'), selector }; return { ...this._r(type, !_isVisible(el), `"${selector}" is hidden`, `"${selector}" is unexpectedly visible`, 'medium'), selector }; }
        case 'selector_enabled': { const el = document.querySelector(selector); if (!el) return { ...this._r(type, false, '', `"${selector}" not found`, 'high'), selector }; const ok = !el.disabled && el.getAttribute('aria-disabled') !== 'true'; return { ...this._r(type, ok, `"${selector}" is enabled`, `"${selector}" is disabled`, 'medium'), selector }; }
        case 'selector_disabled': { const el = document.querySelector(selector); if (!el) return { ...this._r(type, false, '', `"${selector}" not found`, 'medium'), selector }; const ok = el.disabled || el.getAttribute('aria-disabled') === 'true'; return { ...this._r(type, ok, `"${selector}" is disabled`, `"${selector}" is enabled`, 'low'), selector }; }
        case 'selector_count': { const actual = document.querySelectorAll(selector).length; const exp = Number(count ?? expected ?? value); const ok = actual === exp; return { ...this._r(type, ok, `Found ${actual} "${selector}"`, `Found ${actual}, expected ${exp}`, 'medium'), selector, actual, expected: exp }; }
        case 'input_value_equals': { const el = document.querySelector(selector); if (!el) return { ...this._r(type, false, '', `"${selector}" not found`, 'high'), selector }; const fieldId = (el.name || el.id || selector).toLowerCase(); const sensitive = SENSITIVE_FIELD_RE.test(fieldId); const ok = !sensitive && el.value === value; return { ...this._r(type, ok, `Input value matches`, sensitive ? 'Input value redacted (sensitive field)' : `Input value does not match`, 'medium'), selector, valueRedacted: sensitive }; }
        case 'checkbox_checked': { const el = document.querySelector(selector); if (!el) return { ...this._r(type, false, '', `"${selector}" not found`, 'high'), selector }; return { ...this._r(type, el.checked === true, `Checkbox is checked`, `Checkbox is not checked`, 'medium'), selector }; }
        case 'checkbox_unchecked': { const el = document.querySelector(selector); if (!el) return { ...this._r(type, false, '', `"${selector}" not found`, 'high'), selector }; return { ...this._r(type, el.checked === false, `Checkbox is unchecked`, `Checkbox is unexpectedly checked`, 'medium'), selector }; }
        case 'page_ready_state': { const exp = value || 'complete'; const ok = document.readyState === exp; return this._r(type, ok, `readyState is "${document.readyState}"`, `readyState is "${document.readyState}", expected "${exp}"`, 'high'); }
        case 'no_visible_errors': { const errs = this.findVisibleErrors({ maxMatches: 5 }); return { ...this._r(type, errs.length === 0, `No visible errors`, `Found ${errs.length} error indicator(s)`, 'high'), errors: errs.slice(0, 5) }; }
        case 'no_broken_images': { const broken = this._brokenImages(false); return { ...this._r(type, broken.length === 0, `No broken images`, `Found ${broken.length} broken image(s)`, 'medium'), brokenCount: broken.length }; }
        case 'no_horizontal_overflow': { const ok = document.documentElement.scrollWidth <= window.innerWidth; return this._r(type, ok, `No horizontal overflow`, `Overflow: scrollWidth ${document.documentElement.scrollWidth}px > viewport ${window.innerWidth}px`, 'medium'); }
        default: return { type, ok: false, message: `Unknown assertion type: "${type}"`, severity: 'medium', code: 'INVALID_ASSERTION' };
      }
    } catch (e) {
      return { type, ok: false, message: `Assertion threw: ${e.message}`, severity: 'high', code: 'INTERNAL_ERROR' };
    }
  },

  _r(type, ok, passMsg, failMsg, severity) {
    return { type, ok, message: ok ? passMsg : failMsg, severity };
  },

  // ── smoke_test ─────────────────────────────────────────────────────────────

  runSmokeTest(checks) {
    const visibleText = (document.body?.innerText || '').trim();
    const results = checks.map((c) => this._smokeCheck(c, visibleText));
    const broken = this._brokenImages(false);
    const summary = {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      visibleTextLength: visibleText.length,
      interactiveElements: document.querySelectorAll('a,button,input,select,textarea,[role="button"]').length,
      brokenImages: broken.length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
    return { results, summary };
  },

  _smokeCheck(check, visibleText) {
    switch (check) {
      case 'page_loaded': return { name: check, ok: document.readyState === 'complete', message: `readyState is "${document.readyState}"` };
      case 'no_blank_screen': { const w = document.body?.offsetWidth ?? 0, h = document.body?.offsetHeight ?? 0; const ok = w > 0 && h > 0; return { name: check, ok, message: ok ? `Body is ${w}x${h}` : `Body appears blank (${w}x${h})` }; }
      case 'has_visible_text': { const ok = visibleText.length > 100; return { name: check, ok, message: ok ? `${visibleText.length} chars of visible text` : `Very little visible text (${visibleText.length} chars)` }; }
      case 'has_interactive_elements': { const n = document.querySelectorAll('a,button,input,select,textarea,[role="button"]').length; return { name: check, ok: n > 0, message: n > 0 ? `${n} interactive elements` : `No interactive elements found` }; }
      case 'no_obvious_error_text': { const errs = this.findVisibleErrors({ maxMatches: 3 }); return { name: check, ok: errs.length === 0, message: errs.length === 0 ? `No error text found` : `Found ${errs.length} error indicator(s)` }; }
      case 'no_broken_images': { const b = this._brokenImages(false); return { name: check, ok: b.length === 0, message: b.length === 0 ? `No broken images` : `${b.length} broken image(s)` }; }
      case 'no_horizontal_overflow': { const over = document.documentElement.scrollWidth > window.innerWidth; return { name: check, ok: !over, message: over ? `Overflow: ${document.documentElement.scrollWidth}px > ${window.innerWidth}px` : `No horizontal overflow` }; }
      case 'no_visible_console_error_banner': { const banners = Array.from(document.querySelectorAll('[role="alert"],.error-banner,.error-message,#error-page')).filter(_isVisible); return { name: check, ok: banners.length === 0, message: banners.length === 0 ? `No error banners` : `${banners.length} visible error banner(s)` }; }
      default: return { name: check, ok: false, message: `Unknown check: "${check}"`, code: 'INVALID_CHECK' };
    }
  },

  // ── find_errors ────────────────────────────────────────────────────────────

  findVisibleErrors({ includeHidden = false, maxMatches = 50 } = {}) {
    const matches = [];
    for (const el of document.querySelectorAll('*')) {
      if (matches.length >= maxMatches) break;
      if (el.children.length > 0) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length > 500) continue;
      if (!includeHidden && !_isVisible(el)) continue;
      for (const { re, severity, category } of ERROR_PATTERNS) {
        if (re.test(text)) {
          matches.push({ text: text.slice(0, 200), selector: getCssSelector(el), severity, category, visible: _isVisible(el) });
          break;
        }
      }
    }
    return matches;
  },

  // ── check_broken_images ────────────────────────────────────────────────────

  _brokenImages(includeHidden = false) {
    return Array.from(document.querySelectorAll('img')).filter((img) => {
      if (!includeHidden && !_isVisible(img)) return false;
      const src = img.currentSrc || img.src || img.getAttribute('src') || '';
      return !src || (img.complete && img.naturalWidth === 0 && img.naturalHeight === 0);
    }).map((img) => {
      const src = img.currentSrc || img.src || img.getAttribute('src') || '';
      return {
        selector: getCssSelector(img),
        src: src ? src.slice(0, 300) : null,
        alt: img.alt || null,
        visible: _isVisible(img),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        reason: !src ? 'Missing src' : 'Zero natural dimensions',
      };
    });
  },

  checkBrokenImages({ includeHidden = false } = {}) {
    const broken = this._brokenImages(includeHidden);
    return { totalImages: document.querySelectorAll('img').length, brokenCount: broken.length, brokenImages: broken };
  },

  // ── check_links ────────────────────────────────────────────────────────────

  checkLinks({ includeExternal = true, includeHidden = false } = {}) {
    const links = [];
    for (const a of document.querySelectorAll('a')) {
      if (!includeHidden && !_isVisible(a)) continue;
      const href = a.getAttribute('href');
      const text = (a.innerText || a.textContent || '').trim().slice(0, 200);
      const hasAccessibleName = !!(text || a.getAttribute('aria-label') || a.getAttribute('title'));
      let absoluteUrl = null;
      let isExternal = false;
      try {
        if (href && !/^(mailto:|tel:|javascript:|#)/.test(href)) {
          absoluteUrl = new URL(href, location.href).href;
          isExternal = new URL(absoluteUrl).origin !== location.origin;
        }
      } catch (_) {}
      if (!includeExternal && isExternal) continue;
      const rect = a.getBoundingClientRect();
      const type = !href ? 'missing_href' : href === '' ? 'empty_href'
        : href.startsWith('javascript:') ? 'javascript' : href.startsWith('#') ? 'hash_only'
        : href.startsWith('mailto:') ? 'mailto' : href.startsWith('tel:') ? 'tel'
        : isExternal ? 'external' : 'internal';
      links.push({ selector: getCssSelector(a), text: text || null, href: href ?? null, absoluteUrl, visible: _isVisible(a), external: isExternal, target: a.target || null, hasAccessibleName, type });
    }
    const hrefMap = new Map();
    for (const l of links) { if (l.absoluteUrl) { const g = hrefMap.get(l.absoluteUrl) ?? []; g.push(l.selector); hrefMap.set(l.absoluteUrl, g); } }
    return {
      links,
      summary: {
        totalLinks: links.length,
        visibleLinks: links.filter((l) => l.visible).length,
        externalLinks: links.filter((l) => l.external).length,
        emptyHref: links.filter((l) => l.type === 'empty_href' || l.type === 'missing_href').length,
        javascriptLinks: links.filter((l) => l.type === 'javascript').length,
        hashOnlyLinks: links.filter((l) => l.type === 'hash_only').length,
        linksWithoutText: links.filter((l) => !l.hasAccessibleName).length,
        duplicateHrefGroups: [...hrefMap.entries()].filter(([, s]) => s.length > 1).map(([href, selectors]) => ({ href, selectors })).slice(0, 20),
      },
    };
  },

  // ── check_layout ───────────────────────────────────────────────────────────

  checkLayout(checks) {
    const issues = [];
    const s = new Set(checks);

    if (s.has('horizontal_overflow')) {
      const vw = window.innerWidth, dw = document.documentElement.scrollWidth;
      if (dw > vw) issues.push({ type: 'horizontal_overflow', severity: 'medium', message: `Document ${dw}px exceeds viewport ${vw}px by ${dw - vw}px`, details: { viewportWidth: vw, documentWidth: dw } });
    }
    if (s.has('zero_size_clickables')) {
      for (const el of document.querySelectorAll('a,button,[role="button"],input[type="submit"],input[type="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0 && getComputedStyle(el).display !== 'none') {
          issues.push({ type: 'zero_size_clickable', severity: 'high', message: `Clickable has zero size`, selector: getCssSelector(el), details: { tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 80) } });
        }
      }
    }
    if (s.has('modal_blockers')) {
      const modals = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal,.dialog,.overlay,.backdrop')).filter(_isVisible);
      if (modals.length) issues.push({ type: 'modal_blocker', severity: 'medium', message: `${modals.length} modal/dialog open`, details: { count: modals.length, selectors: modals.slice(0, 3).map(getCssSelector) } });
    }
    if (s.has('overlapping_clickables')) {
      const overlapping = [];
      for (const el of Array.from(document.querySelectorAll('a,button,[role="button"],input')).slice(0, 100)) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
        const hit = document.elementFromPoint(cx, cy);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && getComputedStyle(hit).pointerEvents !== 'none') {
          overlapping.push({ selector: getCssSelector(el), coveredBy: getCssSelector(hit) });
          if (overlapping.length >= 10) break;
        }
      }
      if (overlapping.length) issues.push({ type: 'overlapping_clickables', severity: 'medium', message: `${overlapping.length} clickable(s) covered`, details: { overlapping: overlapping.slice(0, 5) } });
    }
    if (s.has('offscreen_fixed_elements')) {
      const offscreen = Array.from(document.querySelectorAll('*')).slice(0, 200).filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
        if (cs.display === 'none') return false;
        const r = el.getBoundingClientRect();
        return r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
      });
      if (offscreen.length) issues.push({ type: 'offscreen_fixed_elements', severity: 'low', message: `${offscreen.length} fixed/sticky element(s) outside viewport`, details: { selectors: offscreen.slice(0, 3).map(getCssSelector) } });
    }
    if (s.has('tiny_text')) {
      const tiny = Array.from(document.querySelectorAll('p,span,div,li,td,label')).filter((el) => {
        const cs = getComputedStyle(el);
        return parseFloat(cs.fontSize) < 10 && cs.display !== 'none' && (el.textContent || '').trim().length > 0;
      });
      if (tiny.length) issues.push({ type: 'tiny_text', severity: 'low', message: `${tiny.length} element(s) with text < 10px`, details: { count: tiny.length } });
    }
    if (s.has('hidden_focusable_elements')) {
      const hiddenFocusable = Array.from(document.querySelectorAll('[tabindex],a,button,input,select,textarea')).filter((el) => {
        const cs = getComputedStyle(el);
        return cs.visibility === 'hidden' && el.tabIndex >= 0;
      });
      if (hiddenFocusable.length) issues.push({ type: 'hidden_focusable_elements', severity: 'low', message: `${hiddenFocusable.length} focusable but hidden element(s)`, details: { count: hiddenFocusable.length } });
    }

    return {
      issues,
      summary: {
        totalIssues: issues.length,
        highestSeverity: issues.length === 0 ? 'none' : issues.some((i) => i.severity === 'high') ? 'high' : issues.some((i) => i.severity === 'medium') ? 'medium' : 'low',
        horizontalOverflow: issues.some((i) => i.type === 'horizontal_overflow'),
        possibleModalOpen: issues.some((i) => i.type === 'modal_blocker'),
      },
    };
  },

  // ── debug_selector ─────────────────────────────────────────────────────────

  debugSelector(selector) {
    let all;
    try { all = Array.from(document.querySelectorAll(selector)); }
    catch (e) { return { ok: false, error: { code: 'INVALID_SELECTOR', message: `Invalid selector: ${e.message}`, path: 'selector' } }; }

    const visible = all.filter(_isVisible);
    const enabled = all.filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
    const first = all[0] ?? null;
    let firstMatch = null;

    if (first) {
      const r = first.getBoundingClientRect(), cs = getComputedStyle(first);
      firstMatch = {
        selector: getCssSelector(first), tag: first.tagName.toLowerCase(),
        role: first.getAttribute('role') || first.tagName.toLowerCase(),
        name: (_getAccessibleName(first) || '').slice(0, 200),
        text: (first.innerText || '').trim().slice(0, 200),
        visible: _isVisible(first),
        enabled: !first.disabled && first.getAttribute('aria-disabled') !== 'true',
        inViewport: r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0,
        bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        computedStyle: { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, pointerEvents: cs.pointerEvents },
      };
    }

    const alts = [];
    if (first) {
      if (first.id) alts.push({ selector: `#${CSS.escape(first.id)}`, confidence: 0.95, reason: 'ID selector' });
      const lbl = first.getAttribute('aria-label');
      if (lbl) alts.push({ selector: `[aria-label="${lbl.replace(/"/g, '\\"')}"]`, confidence: 0.85, reason: 'aria-label' });
      const tid = first.getAttribute('data-testid') || first.getAttribute('data-test-id') || first.getAttribute('data-cy');
      if (tid) alts.push({ selector: `[data-testid="${CSS.escape(tid)}"]`, confidence: 0.9, reason: 'test-id attribute' });
    }

    const warnings = [];
    if (all.length === 0) warnings.push('Selector matches no elements');
    if (all.length > 1) warnings.push(`Selector matches ${all.length} elements (ambiguous)`);
    if (visible.length === 0 && all.length > 0) warnings.push('No matches are visible');
    if (enabled.length === 0 && all.length > 0) warnings.push('All matches are disabled');

    return {
      ok: true, selector,
      exists: all.length > 0, matchCount: all.length,
      visibleCount: visible.length, enabledCount: enabled.length,
      ambiguous: all.length > 1, firstMatch,
      allMatchSummary: all.slice(1, 5).map((el) => ({ selector: getCssSelector(el), text: (el.innerText || '').trim().slice(0, 80), visible: _isVisible(el) })),
      alternativeSelectors: alts.slice(0, 3), warnings,
    };
  },

  // ── debug_clickability ─────────────────────────────────────────────────────

  debugClickability(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      return {
        ok: true, selector, clickable: false, reason: 'Element not found', target: null,
        suggestions: [{ action: 'debug_selector', selector, reason: 'Inspect selector matches' }, { action: 'get_interactive_elements', reason: 'List all interactive elements' }],
      };
    }

    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const isVis = _isVisible(el);
    const isEnabled = !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    const hasSize = r.width > 0 && r.height > 0;
    const inVp = r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
    const hasPtr = cs.pointerEvents !== 'none';
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let blockedBy = null, isTop = false;

    if (inVp && hasSize) {
      const hit = document.elementFromPoint(cx, cy);
      isTop = !hit || hit === el || el.contains(hit);
      if (!isTop && hit) {
        const hr = hit.getBoundingClientRect();
        blockedBy = { selector: getCssSelector(hit), tag: hit.tagName.toLowerCase(), text: (hit.innerText || '').trim().slice(0, 100), bounds: { x: Math.round(hr.x), y: Math.round(hr.y), width: Math.round(hr.width), height: Math.round(hr.height) } };
      }
    }

    const text = (el.innerText || el.textContent || el.value || '').toLowerCase();
    const HIGH_RISK = /\b(pay|purchase|delete|remove|confirm|send|transfer|destroy|reset|wipe)\b/i;
    const MED_RISK = /\b(submit|login|sign.?in|sign.?up|register|upload|save|update|create|buy|add.?to.?cart)\b/i;
    const riskLevel = HIGH_RISK.test(text) ? 'high' : MED_RISK.test(text) || el.type === 'submit' ? 'medium' : 'low';

    const clickable = isVis && isEnabled && hasSize && inVp && hasPtr && isTop;
    let reason = 'Element is clickable';
    if (!isVis) reason = `Not visible (display:${cs.display} visibility:${cs.visibility} opacity:${cs.opacity})`;
    else if (!isEnabled) reason = 'Element is disabled';
    else if (!hasSize) reason = `Zero size (${Math.round(r.width)}x${Math.round(r.height)})`;
    else if (!inVp) reason = 'Outside viewport';
    else if (!hasPtr) reason = 'pointer-events: none';
    else if (!isTop) reason = 'Covered by another element';

    const suggestions = [];
    if (!inVp) suggestions.push({ action: 'reveal', selector, reason: 'Scroll into view' });
    if (blockedBy) suggestions.push({ action: 'debug_clickability', selector: blockedBy.selector, reason: 'Inspect covering element' }, { action: 'reveal', selector, reason: 'Scroll into view' });
    if (!isVis || !isEnabled) suggestions.push({ action: 'debug_selector', selector, reason: 'Inspect visibility details' });
    if (!clickable && suggestions.length === 0) suggestions.push({ action: 'capture_debug_bundle', reason: 'Capture full debug state' });

    return {
      ok: true, selector, clickable, reason,
      target: { selector: getCssSelector(el), tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim().slice(0, 100), role: el.getAttribute('role') || el.tagName.toLowerCase(), visible: isVis, enabled: isEnabled, inViewport: inVp, bounds: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } },
      blockedBy,
      risk: { level: riskLevel, reason: riskLevel === 'high' ? 'Potentially irreversible' : riskLevel === 'medium' ? 'Data-modifying action' : 'Low-risk UI action' },
      suggestions,
    };
  },

  // ── page snapshot (for state tracking) ────────────────────────────────────

  getPageSnapshot() {
    const visibleText = (document.body?.innerText || '').trim();
    const elements = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role="button"]')).slice(0, 50).map((el) => ({ tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || '').trim().slice(0, 60), selector: getCssSelector(el) }));
    const errors = this.findVisibleErrors({ maxMatches: 5 });
    const textHash = _quickHash(visibleText);
    const elemHash = _quickHash(elements.map((e) => e.selector + e.text).join('|'));
    return {
      url: location.href, title: document.title, readyState: document.readyState,
      hashes: { url: _quickHash(location.href), title: _quickHash(document.title), visibleText: textHash, interactiveElements: elemHash },
      visibleTextLength: visibleText.length, interactiveCount: elements.length,
      formCount: document.querySelectorAll('form').length,
      hasModal: !!document.querySelector('[role="dialog"],[aria-modal="true"]'),
      errors: errors.slice(0, 3), elements,
    };
  },

  // ── capture_bundle (single-call debug bundle) ──────────────────────────────

  captureBundle({ include, maxTextChars = 6000, maxElements = 100 } = {}) {
    const inc = new Set(include ?? ['pageInfo', 'viewport', 'visibleText', 'interactiveElements', 'forms', 'errors', 'layoutIssues', 'brokenImages', 'links']);
    const result = {};

    if (inc.has('pageInfo')) result.pageInfo = { url: location.href, title: document.title, readyState: document.readyState };
    if (inc.has('viewport')) result.viewport = { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY, devicePixelRatio: window.devicePixelRatio };
    if (inc.has('visibleText')) { const t = (document.body?.innerText || '').trim(); result.visibleText = { text: t.slice(0, maxTextChars), length: t.length, truncated: t.length > maxTextChars }; }
    if (inc.has('interactiveElements')) {
      const els = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role="button"]')).slice(0, maxElements).map((el) => ({ tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || '').trim().slice(0, 80), selector: getCssSelector(el), visible: _isVisible(el) }));
      result.interactiveElements = { elements: els, count: els.length };
    }
    if (inc.has('forms')) {
      const forms = Array.from(document.querySelectorAll('form')).map((f) => ({ id: f.id || null, action: f.action || null, method: f.method || null, fieldCount: f.elements.length }));
      result.forms = forms;
    }
    if (inc.has('errors')) { result.errors = this.findVisibleErrors({ maxMatches: 20 }); }
    if (inc.has('layoutIssues')) { result.layoutIssues = this.checkLayout(['horizontal_overflow', 'zero_size_clickables', 'modal_blockers', 'overlapping_clickables']).issues; }
    if (inc.has('brokenImages')) { const b = this.checkBrokenImages({}); result.brokenImages = { count: b.brokenCount, images: b.brokenImages.slice(0, 10) }; }
    if (inc.has('links')) { const l = this.checkLinks({}); result.links = { summary: l.summary }; }

    // State snapshot for stateId generation
    result._snapshot = this.getPageSnapshot();

    return result;
  },
};

window.__fileforge_inspect = {
  dom: domInspector,
  accessibility: accessibilityInspector,
  responsive: responsiveInspector,
  framework: frameworkInspector,
  qa: qaInspector,
};
