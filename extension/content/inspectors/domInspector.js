export const domInspector = {
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

  getElementDebugInfo(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      // Return nearby candidates when selector not found
      const candidates = findNearbyCandidates(selector);
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

    // Box model
    const box = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      bottom: Math.round(rect.bottom),
      right: Math.round(rect.right),
      margin: style.margin,
      padding: style.padding,
      border: style.border,
      boxSizing: style.boxSizing,
    };

    // Visibility analysis
    const visibility = {
      display: style.display,
      visibility: style.visibility,
      opacity: parseFloat(style.opacity),
      overflow: style.overflow,
      clip: style.clip !== 'auto' ? style.clip : undefined,
      clipPath: style.clipPath !== 'none' ? style.clipPath : undefined,
      isHidden: style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0,
      isOffscreen: rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth,
      hasZeroSize: rect.width === 0 || rect.height === 0,
      inViewport: rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0,
    };

    // Z-index and stacking
    const stacking = {
      zIndex: style.zIndex,
      position: style.position,
      pointerEvents: style.pointerEvents,
    };

    // Hit-test: check what element is at the center of this element
    const hitTest = getHitTestData(el, rect);

    // Computed styles subset useful for debugging
    const computedStyles = {
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      textAlign: style.textAlign,
      cursor: style.cursor,
      transform: style.transform !== 'none' ? style.transform : undefined,
      transition: style.transition !== 'all 0s ease 0s' ? style.transition : undefined,
    };

    // Accessibility
    const a11y = {
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      ariaLabel: el.getAttribute('aria-label') || undefined,
      ariaLabelledBy: el.getAttribute('aria-labelledby') || undefined,
      ariaDescribedBy: el.getAttribute('aria-describedby') || undefined,
      ariaHidden: el.getAttribute('aria-hidden') || undefined,
      ariaExpanded: el.getAttribute('aria-expanded') || undefined,
      ariaDisabled: el.getAttribute('aria-disabled') || undefined,
      tabIndex: el.tabIndex !== -1 ? el.tabIndex : (el.hasAttribute('tabindex') ? el.tabIndex : undefined),
      accessibleName: getAccessibleName(el),
    };

    // Text content
    const text = {
      innerText: (el.innerText || '').trim().slice(0, 500),
      textContent: (el.textContent || '').trim().slice(0, 500),
      value: el.value !== undefined ? String(el.value).slice(0, 500) : undefined,
      placeholder: el.placeholder || undefined,
      title: el.title || undefined,
      alt: el.alt || undefined,
    };

    // Framework/component hints
    const hints = getFrameworkHints(el);

    return {
      found: true,
      selector,
      xpath: getXPath(el),
      cssSelector: getCssSelector(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: el.className ? String(el.className).split(' ').filter(Boolean) : [],
      attributes: getAttributes(el),
      box,
      visibility,
      stacking,
      hitTest,
      computedStyles,
      a11y,
      text,
      hints,
    };
  },

  /**
   * Multi-layer article extraction (ported from FileForge Reader content-parser.js).
   * Layer 1: Semantic selectors (article, main, known CMS classes)
   * Layer 2: Density scoring (paragraph density, link density, word count)
   * Layer 3: Body fallback (whole page, cleaned)
   * Returns structured data — no DOM nodes.
   */
  extractArticle({ maxTextLength = 50000 } = {}) {
    const title = articleGetTitle();
    const byline = articleGetByline();
    const date = articleGetDate();
    const siteName = articleGetSiteName();

    // Extract main content element
    const { contentEl, layer, score } = articleFindContent();
    const cleaned = articleClean(contentEl);

    // Extract text
    const rawText = (cleaned.innerText || cleaned.textContent || '').trim();
    const text = rawText.slice(0, maxTextLength);
    const wordCount = rawText.split(/\s+/).filter(Boolean).length;
    const readingTimeMin = Math.max(1, Math.round(wordCount / 200));

    // Heading outline
    const headings = Array.from(cleaned.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
      level: Number(h.tagName.slice(1)),
      text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 240),
    }));

    // Links within article
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

    // Images within article
    const images = Array.from(cleaned.querySelectorAll('img')).map((img) => ({
      src: img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || undefined,
      alt: img.alt || undefined,
    })).filter((i) => i.src);

    // Code blocks
    const codeBlocks = Array.from(cleaned.querySelectorAll('pre, pre code')).map((pre) => ({
      language: pre.className?.match(/(?:language-|lang-)(\w+)/)?.[1] || undefined,
      text: pre.textContent.trim().slice(0, 2000),
    }));

    // Content confidence
    const confidence = score >= 500 ? 'high' : score >= 150 ? 'medium' : score >= 80 ? 'low' : 'fallback';

    // Source node metadata
    const sourceSelector = getCssSelector(contentEl);

    return {
      title,
      byline,
      date,
      siteName,
      url: location.href,
      text,
      textLength: rawText.length,
      truncated: rawText.length > maxTextLength,
      wordCount,
      readingTimeMin,
      readingTime: readingTimeMin < 1 ? '< 1 min read' : `${readingTimeMin} min read`,
      headings,
      links: links.slice(0, 200),
      images: images.slice(0, 50),
      codeBlocks: codeBlocks.slice(0, 30),
      extraction: {
        layer,
        score: Math.round(score),
        confidence,
        sourceSelector,
        sourceTag: contentEl.tagName?.toLowerCase(),
      },
    };
  },
};

// ── Article extraction helpers (ported from reader/content-parser.js) ──────

const ARTICLE_STRIP = [
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

const ARTICLE_SEMANTIC = [
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

function articleScore(el) {
  const text = el.innerText || el.textContent || '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 50) return -1;

  const paras = el.querySelectorAll('p').length;
  const headings = el.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
  const images = el.querySelectorAll('img').length;
  const lists = el.querySelectorAll('li').length;
  const anchors = el.querySelectorAll('a');

  const linkWords = [...anchors].reduce((n, a) =>
    n + (a.textContent.trim().split(/\s+/).filter(Boolean).length), 0);
  const linkDensity = words > 0 ? linkWords / words : 0;
  if (linkDensity > 0.55) return -1;

  const paraBonus = Math.min(paras * 1.5, 9);
  const headingBonus = Math.min(headings * 0.6, 3);
  const imageBonus = Math.min(images * 0.4, 2);
  const listBonus = Math.min(lists * 0.05, 0.5);
  const linkPenalty = linkDensity * 4;

  return words * (1 + paraBonus + headingBonus + imageBonus + listBonus) / (1 + linkPenalty);
}

function articleClean(el) {
  const clone = el.cloneNode(true);
  ARTICLE_STRIP.forEach((sel) => {
    try { clone.querySelectorAll(sel).forEach((n) => n.remove()); } catch (_) {}
  });
  // Fix lazy-loaded images
  clone.querySelectorAll('img').forEach((img) => {
    const lazy = img.dataset.src || img.dataset.lazySrc || img.dataset.original
      || img.getAttribute('data-lazy-src') || img.getAttribute('data-echo');
    if (lazy && (!img.src || /^data:image\/gif/.test(img.src) ||
      img.src.includes('placeholder') || img.src.includes('blank'))) {
      img.src = lazy;
    }
  });
  // Make relative links absolute
  clone.querySelectorAll('a[href]').forEach((a) => {
    try {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto')) {
        a.href = new URL(href, window.location.href).href;
      }
    } catch (_) {}
  });
  // Remove empty block elements
  clone.querySelectorAll('p,div,span,li').forEach((el) => {
    if (!el.textContent.trim() && !el.querySelector('img,video,iframe,table,pre,code')) {
      el.remove();
    }
  });
  return clone;
}

function articleFindContent() {
  // Layer 1: Semantic selectors
  for (const sel of ARTICLE_SEMANTIC) {
    let best = null, bestScore = -1;
    try {
      document.querySelectorAll(sel).forEach((el) => {
        const s = articleScore(el);
        if (s > bestScore) { bestScore = s; best = el; }
      });
    } catch (_) { continue; }
    if (best && bestScore >= 150) {
      return { contentEl: best, layer: 'semantic', score: bestScore };
    }
  }

  // Layer 2: Density scoring
  let bestEl = null, bestScore = 0;
  document.querySelectorAll('div, section').forEach((el) => {
    if (el.querySelectorAll('div, section').length > 40) return;
    const s = articleScore(el);
    if (s > bestScore) { bestScore = s; bestEl = el; }
  });
  if (bestEl && bestScore >= 80) {
    return { contentEl: bestEl, layer: 'density', score: bestScore };
  }

  // Layer 3: Body fallback
  return { contentEl: document.body, layer: 'fallback', score: articleScore(document.body) };
}

function articleGetTitle() {
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

function articleGetByline() {
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

function articleGetDate() {
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
          return new Date(raw).toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
          });
        } catch (_) { return raw.trim().slice(0, 30); }
      }
    } catch (_) {}
  }
  return '';
}

function articleGetSiteName() {
  return document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
    document.querySelector('meta[name="application-name"]')?.content?.trim() ||
    '';
}

function getHitTestData(el, rect) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  if (centerX < 0 || centerY < 0 || centerX > window.innerWidth || centerY > window.innerHeight) {
    return { testable: false, reason: 'Element center is outside viewport.' };
  }
  const hitEl = document.elementFromPoint(centerX, centerY);
  if (!hitEl) return { testable: false, reason: 'No element at center point.' };
  const isTarget = hitEl === el || el.contains(hitEl);
  return {
    testable: true,
    isTarget,
    hitElement: isTarget ? undefined : {
      tag: hitEl.tagName.toLowerCase(),
      id: hitEl.id || undefined,
      selector: getCssSelector(hitEl),
      text: (hitEl.textContent || '').trim().slice(0, 80),
    },
    reason: isTarget ? undefined : 'Another element is on top. Check z-index, position, or overlapping elements.',
  };
}

function getAccessibleName(el) {
  // Simplified accessible name computation
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

function getAttributes(el) {
  const attrs = {};
  for (const attr of el.attributes) {
    if (['class', 'id', 'style'].includes(attr.name)) continue;
    const val = attr.value.slice(0, 200);
    attrs[attr.name] = val;
  }
  return attrs;
}

function getFrameworkHints(el) {
  const hints = {};
  // React
  const reactKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  if (reactKey) hints.react = true;
  const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (reactPropsKey) {
    const props = el[reactPropsKey];
    if (props) hints.reactProps = Object.keys(props).slice(0, 8);
  }
  // Vue
  if (el.__vue__) hints.vue = true;
  if (el.__vueParentComponent) hints.vue3 = true;
  // Angular
  const ngKey = Object.keys(el).find((k) => k.startsWith('__ng'));
  if (ngKey) hints.angular = true;
  // Svelte
  const svelteKey = Object.keys(el).find((k) => k.startsWith('__svelte'));
  if (svelteKey) hints.svelte = true;
  // Data attributes
  const dataAttrs = {};
  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-')) dataAttrs[attr.name] = attr.value.slice(0, 100);
  }
  if (Object.keys(dataAttrs).length) hints.dataAttributes = dataAttrs;
  return Object.keys(hints).length ? hints : undefined;
}

function findNearbyCandidates(selector) {
  const candidates = [];
  try {
    // Try partial tag match
    const tagMatch = selector.match(/^([a-z]+)/i);
    if (tagMatch) {
      const tag = tagMatch[1];
      const els = document.querySelectorAll(tag);
      for (const el of Array.from(els).slice(0, 5)) {
        candidates.push({
          tag: el.tagName.toLowerCase(),
          selector: getCssSelector(el),
          text: (el.textContent || '').trim().slice(0, 80),
        });
      }
    }
    // Try ID partial match
    const idMatch = selector.match(/#([a-z0-9_-]+)/i);
    if (idMatch) {
      const partial = idMatch[1].toLowerCase();
      const allWithId = document.querySelectorAll('[id]');
      for (const el of allWithId) {
        if (el.id.toLowerCase().includes(partial)) {
          candidates.push({
            tag: el.tagName.toLowerCase(),
            selector: `#${el.id}`,
            text: (el.textContent || '').trim().slice(0, 80),
          });
        }
        if (candidates.length >= 5) break;
      }
    }
    // Try class partial match
    const classMatch = selector.match(/\.([a-z0-9_-]+)/i);
    if (classMatch) {
      const partial = classMatch[1].toLowerCase();
      const allWithClass = document.querySelectorAll('[class]');
      for (const el of allWithClass) {
        if ([...el.classList].some((c) => c.toLowerCase().includes(partial))) {
          candidates.push({
            tag: el.tagName.toLowerCase(),
            selector: getCssSelector(el),
            text: (el.textContent || '').trim().slice(0, 80),
          });
        }
        if (candidates.length >= 5) break;
      }
    }
  } catch (_) {
    // Ignore selector parse errors
  }
  return candidates.slice(0, 5);
}

function getXPath(el) {
  if (el.id) return `//*[@id="${el.id}"]`;
  const parts = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = node.previousSibling;
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === node.tagName) index++;
      sibling = sibling.previousSibling;
    }
    parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
    node = node.parentNode;
  }
  return '/' + parts.join('/');
}

function getCssSelector(el) {
  if (el.id) return `#${el.id}`;
  const path = [];
  let node = el;
  while (node && node !== document.body) {
    let selector = node.tagName.toLowerCase();
    if (node.className) selector += '.' + [...node.classList].join('.');
    const siblings = node.parentNode ? Array.from(node.parentNode.children).filter((s) => s.tagName === node.tagName) : [];
    if (siblings.length > 1) selector += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    path.unshift(selector);
    node = node.parentNode;
  }
  return path.join(' > ');
}
