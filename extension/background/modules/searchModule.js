function flattenBookmarks(nodes, query, results = []) {
  const needle = query.toLowerCase();
  for (const node of nodes) {
    if (node.url && (`${node.title} ${node.url}`).toLowerCase().includes(needle)) {
      results.push({ id: node.id, title: node.title, url: node.url, dateAdded: node.dateAdded });
    }
    if (node.children) flattenBookmarks(node.children, query, results);
  }
  return results;
}

export const searchModule = {
  async history({ query, limit = 20 } = {}) {
    const results = await chrome.history.search({ text: query, maxResults: limit, startTime: 0 });
    return {
      ok: true,
      data: {
        results: results.map((item) => ({
          id: item.id,
          title: item.title,
          url: item.url,
          visitCount: item.visitCount,
          lastVisitTime: item.lastVisitTime,
        })),
      },
    };
  },

  async bookmarks({ query, limit = 20 } = {}) {
    const tree = await chrome.bookmarks.getTree();
    return { ok: true, data: { results: flattenBookmarks(tree, query).slice(0, limit) } };
  },
};
