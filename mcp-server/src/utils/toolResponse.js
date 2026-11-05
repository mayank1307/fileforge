// The response every tool shares. Only `ok` is typed: a client rejects a whole call when a response breaks this schema,
// and the other fields vary by action, so a stricter schema would turn working calls into failures.
export const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  description: 'query_* actions return their modules as extra top-level fields.',
  properties: {
    ok: { type: 'boolean', description: 'False if the action failed or a check did not pass.' },
    data: { description: 'The result. Its shape depends on the action.' },
    ref: { description: 'Stored result ID, for fileforge_result_action.' },
    warnings: { description: 'Notes about a call that still ran.' },
    error: { description: 'Failure code and message.' },
    meta: { description: 'Tool, action and context.' },
  },
  required: ['ok'],
};

// Makes the top-level `ok` the whole truth. Extension methods can return data with no `ok`, which the schema requires.
// Many handlers also wrap the extension's reply as { ok: true, data: reply }, so a failed reply must fail the response.
export function normalizeToolResponse(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { ok: true, data: result };
  if (typeof result.ok !== 'boolean') return { ...result, ok: !result.error };
  if (result.ok && result.data?.ok === false) {
    const error = result.error ?? result.data.error;
    return { ...result, ok: false, ...(error ? { error } : {}) };
  }
  return result;
}

// Clients that predate structured output read the text, so both carry the same response.
export function toMcpToolResult(response) {
  return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }], structuredContent: response };
}
