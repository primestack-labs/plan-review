import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function diffManifests(previous, next) {
  const before = new Map(previous.sections.map((s) => [s.id, s.contentHash]));
  const after = new Set(next.sections.map((s) => s.id));
  const result = { added: [], removed: [], changed: [], unchanged: [] };
  for (const s of next.sections) {
    if (!before.has(s.id)) result.added.push(s.id);
    else if (before.get(s.id) !== s.contentHash) result.changed.push(s.id);
    else result.unchanged.push(s.id);
  }
  for (const id of before.keys()) if (!after.has(id)) result.removed.push(id);
  return result;
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [prev, next] = process.argv.slice(2);
  if (!prev || !next) {
    console.error('usage: diff.mjs <previous.json> <next.json>');
    process.exit(2);
  }
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  console.log(JSON.stringify(diffManifests(read(prev), read(next)), null, 2));
}
