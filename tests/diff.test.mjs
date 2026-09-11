import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffManifests } from '../scripts/diff.mjs';
import { stampHashes } from '../scripts/validate.mjs';

const load = () => stampHashes(JSON.parse(readFileSync(new URL('./fixtures/availability-bridge.manifest.json', import.meta.url))), 'plan');

test('classifies unchanged, changed, added and removed sections', () => {
  const previous = load();
  const next = load();
  next.sections[1].summary = 'A different summary.';
  next.sections.push({ ...next.sections[2], id: 't6-new', title: 'New task' });
  next.sections.splice(0, 1);
  stampHashes(next, 'plan');
  assert.deepEqual(diffManifests(previous, next), {
    added: ['t6-new'],
    removed: ['t0-preamble'],
    changed: ['t1-bridge-service'],
    unchanged: ['t5-copy-from-windows'],
  });
});

test('identical manifests are all unchanged', () => {
  const d = diffManifests(load(), load());
  assert.deepEqual(d.changed, []);
  assert.deepEqual(d.unchanged, ['t0-preamble', 't1-bridge-service', 't5-copy-from-windows']);
});
