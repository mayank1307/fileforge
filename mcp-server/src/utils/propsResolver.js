import { secretStore } from '../stores/secretStore.js';

const SINGLE_TOKEN_RE = /^\{([a-zA-Z_][\w.]*)\}$/;
const TOKEN_RE = /\{([a-zA-Z_][\w.]*)\}/g;
const SECRET_RE = /\{\{\s*secret:([A-Z0-9_]+)\s*\}\}/gi;
const SECRET_WHOLE_RE = /^\{\{\s*secret:([A-Z0-9_]+)\s*\}\}$/i;

export class PropsResolutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function lookupPath(root, path) {
  const parts = path.split('.');
  let cur = root;
  for (const part of parts) {
    if (cur == null) return { found: false, value: undefined };
    if (Object.prototype.hasOwnProperty.call(cur, part)) {
      cur = cur[part];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: cur };
}

function resolveTokenPath(token, ctx) {
  if (token.startsWith('steps.')) {
    return lookupPath(ctx.steps ?? {}, token.slice('steps.'.length));
  }
  if (token.startsWith('props.')) {
    return lookupPath(ctx.props ?? {}, token.slice('props.'.length));
  }
  if (token.startsWith('run.')) {
    return lookupPath(ctx.run ?? {}, token.slice('run.'.length));
  }
  return lookupPath(ctx.props ?? {}, token);
}

function resolveString(str, ctx, secretRefs, options) {
  const wholeMatch = SINGLE_TOKEN_RE.exec(str);
  if (wholeMatch) {
    const tokenPath = wholeMatch[1];
    const { found, value } = resolveTokenPath(tokenPath, ctx);
    if (!found) {
      if (options.allowMissing) return { value: str, missing: [{ kind: 'prop', ref: str, path: tokenPath }] };
      throw new PropsResolutionError('MISSING_PROP', `Unresolved placeholder: ${str}`, { token: tokenPath });
    }
    return { value, missing: [] };
  }

  const wholeSecret = SECRET_WHOLE_RE.exec(str);
  if (wholeSecret) {
    const name = wholeSecret[1];
    const secret = secretStore.get(name);
    if (secret === undefined) {
      if (options.allowMissing) return { value: str, missing: [{ kind: 'secret', ref: str, name }] };
      throw new PropsResolutionError('MISSING_SECRET', `Secret not found: ${name}`, { name });
    }
    secretRefs.add(secret);
    return { value: secret, missing: [] };
  }

  let out = str;
  const missing = [];

  out = out.replace(SECRET_RE, (m, name) => {
    const secret = secretStore.get(name);
    if (secret === undefined) {
      if (options.allowMissing) {
        missing.push({ kind: 'secret', ref: m, name });
        return m;
      }
      throw new PropsResolutionError('MISSING_SECRET', `Secret not found: ${name}`, { name });
    }
    secretRefs.add(secret);
    return secret;
  });

  out = out.replace(TOKEN_RE, (m, tokenPath) => {
    const { found, value } = resolveTokenPath(tokenPath, ctx);
    if (!found) {
      if (options.allowMissing) {
        missing.push({ kind: 'prop', ref: m, path: tokenPath });
        return m;
      }
      throw new PropsResolutionError('MISSING_PROP', `Unresolved placeholder: ${m}`, { token: tokenPath });
    }
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });

  return { value: out, missing };
}

function resolveValue(value, ctx, secretRefs, options) {
  if (value == null) return { value, missing: [] };
  if (typeof value === 'string') return resolveString(value, ctx, secretRefs, options);
  if (typeof value === 'number' || typeof value === 'boolean') return { value, missing: [] };
  if (Array.isArray(value)) {
    const out = [];
    const missing = [];
    for (const item of value) {
      const r = resolveValue(item, ctx, secretRefs, options);
      out.push(r.value);
      missing.push(...r.missing);
    }
    return { value: out, missing };
  }
  if (typeof value === 'object') {
    if (Object.getPrototypeOf(value) && Object.getPrototypeOf(value) !== Object.prototype) {
      throw new PropsResolutionError('UNSUPPORTED_VALUE', 'Class instance values are not supported in step params.');
    }
    const out = {};
    const missing = [];
    for (const [k, v] of Object.entries(value)) {
      const r = resolveValue(v, ctx, secretRefs, options);
      out[k] = r.value;
      missing.push(...r.missing);
    }
    return { value: out, missing };
  }
  if (typeof value === 'function') {
    throw new PropsResolutionError('UNSUPPORTED_VALUE', 'Function values are not supported in step params.');
  }
  return { value, missing: [] };
}

export function resolveParams(params, ctx, { allowMissing = false } = {}) {
  const secretRefs = new Set();
  const result = resolveValue(params, ctx, secretRefs, { allowMissing });
  return {
    value: result.value,
    secretValues: Array.from(secretRefs),
    missing: result.missing,
  };
}

export function collectReferences(value) {
  const refs = new Set();
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') {
      let m;
      const tokenRe = new RegExp(TOKEN_RE.source, 'g');
      while ((m = tokenRe.exec(v))) refs.add(`{${m[1]}}`);
      const secretRe = new RegExp(SECRET_RE.source, 'gi');
      while ((m = secretRe.exec(v))) refs.add(`{{secret:${m[1]}}}`);
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') { Object.values(v).forEach(walk); return; }
  };
  walk(value);
  return Array.from(refs);
}

export function validateProps(props, schema) {
  const errors = [];
  const resolved = { ...props };
  for (const [name, def] of Object.entries(schema ?? {})) {
    const value = resolved[name];
    const present = value !== undefined && value !== null;
    if (!present && def.default !== undefined) {
      resolved[name] = def.default;
      continue;
    }
    if (!present) {
      if (def.required) errors.push({ name, code: 'MISSING_REQUIRED_PROP', message: `Required prop "${name}" not provided.` });
      continue;
    }
    if (def.type) {
      const actual = Array.isArray(value) ? 'array' : typeof value;
      if (def.type === 'number' && actual !== 'number') errors.push({ name, code: 'PROP_TYPE_MISMATCH', message: `Prop "${name}" expected number, got ${actual}.` });
      else if (def.type === 'string' && actual !== 'string') errors.push({ name, code: 'PROP_TYPE_MISMATCH', message: `Prop "${name}" expected string, got ${actual}.` });
      else if (def.type === 'boolean' && actual !== 'boolean') errors.push({ name, code: 'PROP_TYPE_MISMATCH', message: `Prop "${name}" expected boolean, got ${actual}.` });
      else if (def.type === 'array' && actual !== 'array') errors.push({ name, code: 'PROP_TYPE_MISMATCH', message: `Prop "${name}" expected array, got ${actual}.` });
      else if (def.type === 'object' && (actual !== 'object' || Array.isArray(value))) errors.push({ name, code: 'PROP_TYPE_MISMATCH', message: `Prop "${name}" expected object, got ${actual}.` });
    }
  }
  return { value: resolved, errors };
}
