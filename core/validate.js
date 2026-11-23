/** Tiny JSON-Schema subset validator (type, enum, required, min/max, items). Unknown properties are stripped. */
export function validate(schema, input) {
  const errors = [];
  const value = check(schema, input, '', errors);
  return { ok: errors.length === 0, value, errors };
}

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function check(s, v, path, errors) {
  if (v === undefined || v === null) return undefined;
  switch (s.type) {
    case 'string': {
      if (typeof v === 'number') v = String(v);
      if (typeof v !== 'string') return (errors.push(`${path}: must be a string`), undefined);
      v = v.replace(CTRL, '').trim();
      if (s.maxLength && v.length > s.maxLength) v = v.slice(0, s.maxLength);
      if (s.enum && !s.enum.includes(v)) return (errors.push(`${path}: must be one of ${s.enum.join(', ')}`), undefined);
      if (s.pattern && !new RegExp(s.pattern).test(v)) return (errors.push(`${path}: invalid format`), undefined);
      return v;
    }
    case 'number': case 'integer': {
      if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) v = Number(v);
      if (typeof v !== 'number' || !Number.isFinite(v)) return (errors.push(`${path}: must be a number`), undefined);
      if (s.type === 'integer' && !Number.isInteger(v)) return (errors.push(`${path}: must be an integer`), undefined);
      if (s.minimum !== undefined && v < s.minimum) return (errors.push(`${path}: must be >= ${s.minimum}`), undefined);
      if (s.maximum !== undefined && v > s.maximum) return (errors.push(`${path}: must be <= ${s.maximum}`), undefined);
      return v;
    }
    case 'boolean': {
      if (v === 'true') v = true;
      if (v === 'false') v = false;
      if (typeof v !== 'boolean') return (errors.push(`${path}: must be a boolean`), undefined);
      return v;
    }
    case 'array': {
      if (!Array.isArray(v)) v = [v];
      if (s.maxItems && v.length > s.maxItems) return (errors.push(`${path}: at most ${s.maxItems} items`), undefined);
      return v.map((x, i) => check(s.items || {}, x, `${path}[${i}]`, errors)).filter((x) => x !== undefined);
    }
    case 'object': {
      if (typeof v !== 'object' || Array.isArray(v)) return (errors.push(`${path || 'input'}: must be an object`), undefined);
      const out = {};
      const pre = path ? `${path}.` : '';
      for (const [k, sub] of Object.entries(s.properties || {})) {
        const r = check(sub, v[k], `${pre}${k}`, errors);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    default: return v;
  }
}

/** Top-level required check (done separately so missing-field errors are reported once). */
export function validateInput(schema, input) {
  const base = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const r = validate(schema, base);
  for (const req of schema.required || []) {
    if (r.value?.[req] === undefined && !r.errors.some((e) => e.startsWith(`${req}:`))) r.errors.push(`${req}: required`);
  }
  r.ok = r.errors.length === 0;
  return r;
}
