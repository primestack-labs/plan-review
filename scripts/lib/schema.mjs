const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

export function validate(schema, value, path = '$') {
  const errors = [];
  const check = (s, v, p) => {
    if ('const' in s && v !== s.const) errors.push(`${p}: expected ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.includes(v)) errors.push(`${p}: expected one of ${s.enum.join(', ')}`);
    if (s.type && typeOf(v) !== s.type) {
      errors.push(`${p}: expected ${s.type}, got ${typeOf(v)}`);
      return;
    }
    if (s.type === 'string' && s.minLength && v.length < s.minLength) {
      errors.push(`${p}: must be at least ${s.minLength} character(s)`);
    }
    if (s.type === 'array') {
      if (s.minItems && v.length < s.minItems) errors.push(`${p}: at least ${s.minItems} item(s)`);
      if (s.items) v.forEach((item, i) => check(s.items, item, `${p}[${i}]`));
    }
    if (s.type === 'object') {
      const props = s.properties ?? {};
      for (const key of s.required ?? []) if (!(key in v)) errors.push(`${p}.${key}: required`);
      for (const [key, sub] of Object.entries(props)) if (key in v) check(sub, v[key], `${p}.${key}`);
      for (const [key, sub] of Object.entries(v)) {
        if (key in props) continue;
        if (s.additionalProperties === false) errors.push(`${p}.${key}: unexpected property`);
        else if (typeof s.additionalProperties === 'object') check(s.additionalProperties, sub, `${p}.${key}`);
      }
    }
  };
  check(schema, value, path);
  return errors;
}
