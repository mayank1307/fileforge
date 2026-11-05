const MASK = '***MASKED***';

function maskString(str, values) {
  if (!str || typeof str !== 'string') return str;
  let out = str;
  for (const value of values) {
    if (!value || typeof value !== 'string' || value.length < 4) continue;
    while (out.includes(value)) out = out.replace(value, MASK);
  }
  return out;
}

function maskValue(value, secretValues) {
  if (value == null) return value;
  if (typeof value === 'string') return maskString(value, secretValues);
  if (Array.isArray(value)) return value.map((v) => maskValue(v, secretValues));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = maskValue(v, secretValues);
    return out;
  }
  return value;
}

export const secretMask = {
  MASK,
  mask(value, secretValues = []) {
    const filtered = (secretValues ?? []).filter((v) => typeof v === 'string' && v.length >= 4);
    if (!filtered.length) return value;
    return maskValue(value, filtered);
  },
  maskString(str, secretValues = []) {
    const filtered = (secretValues ?? []).filter((v) => typeof v === 'string' && v.length >= 4);
    if (!filtered.length) return str;
    return maskString(str, filtered);
  },
};
