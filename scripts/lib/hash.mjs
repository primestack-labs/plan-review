import { createHash } from 'node:crypto';

export const sha1 = (text) => createHash('sha1').update(text).digest('hex');

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sectionHash(section) {
  const { narration, sourceRange, contentHash, ...content } = section;
  return sha1(stableStringify(content));
}
