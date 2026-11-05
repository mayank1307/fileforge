export const frameworkInspector = {
  detect() {
    const detected = [];

    if (window.__NEXT_DATA__) detected.push({ name: 'Next.js', data: window.__NEXT_DATA__ });
    if (window.__nuxt__) detected.push({ name: 'Nuxt.js' });
    if (window.angular || document.querySelector('[ng-version]')) detected.push({ name: 'Angular' });
    if (window.Vue || document.querySelector('[data-v-app]')) detected.push({ name: 'Vue' });
    if (document.querySelector('#__remix-error')) detected.push({ name: 'Remix' });
    if (window.__SVELTE__) detected.push({ name: 'Svelte' });

    // React detection via fiber
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
    // Check common feature flag globals
    const candidates = ['__ldClient', '__growthbook', '__statsig', 'LaunchDarkly', 'Optimizely'];
    return candidates
      .filter((k) => window[k])
      .map((k) => ({ name: k, present: true }));
  },
};
