// SQL queries are executed in the MCP server (Node.js) where better-sqlite3 runs.
// This module is a placeholder for any extension-side SQL operations (e.g. chrome.storage).
export const sqlModule = {
  async listTables() {
    return { ok: true, data: { message: 'SQL queries are handled by the MCP server.' } };
  },
};
