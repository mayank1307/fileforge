export const exportModule = {
  async download({ url, filename }) {
    const downloadId = await chrome.downloads.download({ url, filename });
    return { ok: true, data: { downloadId, filename } };
  },
};
