export const accessibilityInspector = {
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
    // Lightweight contrast check — real audit uses CDP or axe-core
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

  getFindings() {
    const findings = [];
    const selectorFor = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const attr = el.getAttribute('name') || el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24);
      return `${el.tagName.toLowerCase()}${attr ? `[data-fileforge-hint="${attr.replaceAll('"', '')}"]` : ''}`;
    };
    const accessibleName = (el) => el.getAttribute('aria-label')
      || el.getAttribute('title')
      || (el.labels?.[0]?.textContent)
      || el.textContent?.trim()
      || el.getAttribute('alt')
      || '';

    document.querySelectorAll('img').forEach((img) => {
      if (!img.hasAttribute('alt')) {
        findings.push({ type: 'missing-alt', selector: selectorFor(img), tag: 'img', visibleLabel: '', accessibleName: '', suggestedFix: 'Add meaningful alt text, or alt="" for decorative images.' });
      }
    });

    document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [tabindex]').forEach((el) => {
      const name = accessibleName(el).trim();
      if (!name) {
        findings.push({ type: 'unlabeled-control', selector: selectorFor(el), tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || inferRole(el), visibleLabel: '', accessibleName: '', suggestedFix: 'Add visible text, an associated label, aria-label, or aria-labelledby.' });
      }
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24)) {
        findings.push({ type: 'small-touch-target', selector: selectorFor(el), tag: el.tagName.toLowerCase(), visibleLabel: name.slice(0, 80), accessibleName: name.slice(0, 80), size: { width: Math.round(rect.width), height: Math.round(rect.height) }, suggestedFix: 'Increase the interactive target size or add padding around the control.' });
      }
    });

    const headings = this.getHeadingOrder();
    headings.forEach((heading, index) => {
      const previous = headings[index - 1];
      if (previous && heading.level > previous.level + 1) {
        findings.push({ type: 'heading-order', selector: `h${heading.level}`, tag: `h${heading.level}`, visibleLabel: heading.text, accessibleName: heading.text, previousLevel: previous.level, level: heading.level, suggestedFix: 'Avoid skipping heading levels; keep page hierarchy sequential.' });
      }
    });

    document.querySelectorAll('[aria-labelledby]').forEach((el) => {
      const ids = el.getAttribute('aria-labelledby').split(/\s+/).filter(Boolean);
      const missing = ids.filter((id) => !document.getElementById(id));
      if (missing.length) {
        findings.push({ type: 'aria-reference-missing', selector: selectorFor(el), tag: el.tagName.toLowerCase(), accessibleName: accessibleName(el), missing, suggestedFix: 'Point aria-labelledby to existing element IDs or remove the broken reference.' });
      }
    });

    return findings;
  },
};

function inferRole(el) {
  const map = { A: 'link', BUTTON: 'button', INPUT: 'input', SELECT: 'listbox',
    TEXTAREA: 'textbox', FORM: 'form', NAV: 'navigation', MAIN: 'main',
    HEADER: 'banner', FOOTER: 'contentinfo', ASIDE: 'complementary' };
  return map[el.tagName] || undefined;
}
