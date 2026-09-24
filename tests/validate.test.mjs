import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateManifest, stampHashes, narrationIssues } from '../scripts/validate.mjs';
import { sectionHash, stableStringify } from '../scripts/lib/hash.mjs';

const load = () => JSON.parse(readFileSync(new URL('./fixtures/availability-bridge.manifest.json', import.meta.url)));
const planText = readFileSync(new URL('./fixtures/availability-bridge.plan.md', import.meta.url), 'utf8');

test('the fixture manifest validates', () => {
  assert.deepEqual(validateManifest(load()), []);
});

test('a missing field is reported with its path', () => {
  const m = load();
  delete m.sections[1].summary;
  assert.deepEqual(validateManifest(m), ['$.sections[1].summary: required']);
});

test('duplicate ids are reported', () => {
  const m = load();
  m.sections[1].ui.push({ id: 't1-bridge-service-b1', title: 'Clash', html: '<b>x</b>' });
  assert.deepEqual(validateManifest(m), ['$.sections[1].ui[0].id: duplicate id t1-bridge-service-b1']);
});

test('dangling references are reported', () => {
  const m = load();
  m.sections[1].decisionIds.push('d9');
  m.decisions[0].sectionId = 't9-nowhere';
  m.taskMap.edges[0].to = 't9-nowhere';
  m.sections[2].narration[0].target = 'nope';
  m.narration.overview[1].target = 'nowhere';
  m.narration.decisions[0].target = 'd9';
  assert.deepEqual(validateManifest(m), [
    '$.decisions[0].sectionId: unknown section t9-nowhere',
    '$.narration.overview[1].target: unknown target nowhere',
    '$.narration.decisions[0].target: unknown decision d9',
    '$.taskMap.edges[0].to: unknown node t9-nowhere',
    '$.sections[1].decisionIds[1]: unknown decision d9',
    '$.sections[2].narration[0].target: unknown target nope',
  ]);
});

test('stampHashes fills plan.hash and every contentHash', () => {
  const m = stampHashes(load(), planText);
  assert.match(m.plan.hash, /^[0-9a-f]{40}$/);
  for (const s of m.sections) assert.match(s.contentHash, /^[0-9a-f]{40}$/);
});

test('contentHash ignores key order, narration, sourceRange and itself', () => {
  const m = load();
  const s = m.sections[1];
  const reordered = Object.fromEntries(Object.entries(s).reverse());
  reordered.narration = [];
  reordered.sourceRange = [0, 0];
  reordered.contentHash = 'stale';
  assert.equal(sectionHash(reordered), sectionHash(s));
  assert.notEqual(sectionHash({ ...s, summary: 'changed' }), sectionHash(s));
  assert.equal(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
});

test('narration lint rejects dashes, parentheses, long paragraphs and long sentences', () => {
  assert.deepEqual(narrationIssues('Short and plain. Two ideas, two sentences.'), []);
  assert.deepEqual(narrationIssues('A dash — here.'), ['contains a dash; use a comma or a full stop']);
  assert.deepEqual(narrationIssues('An aside (like this).'), ['contains parentheses; make the aside its own sentence']);
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
  assert.deepEqual(narrationIssues(`${long}.`), ['a sentence of 40 words; keep sentences under 35']);
  const m = load();
  m.sections[1].narration[0].text = `${long}. ${long}. ${long}.`;
  assert.deepEqual(validateManifest(m), [
    '$.sections[1].narration[0].text: 120 words; keep a paragraph under 90',
    '$.sections[1].narration[0].text: a sentence of 40 words; keep sentences under 35',
  ]);
});
