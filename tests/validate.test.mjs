import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateManifest, stampHashes } from '../scripts/validate.mjs';
import { sectionHash, stableStringify } from '../scripts/lib/hash.mjs';
import { uncovered } from '../scripts/lib/coverage.mjs';

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

test('a block paragraph that drops a sentence or clause of its summary is rejected', () => {
  const m = load();
  const s = m.sections[1];
  const block = s.blocks[0];
  const paragraph = s.narration.find((p) => p.target === block.id);
  block.summary += ' The unlock-all case lives in the existing solve-input tests.';
  assert.deepEqual(validateManifest(m), ['$.sections[1].blocks[0].summary: not narrated: "The unlock-all case lives in the existing solve-input tests."']);
  paragraph.text += ' The unlock all case lives in the existing solve input tests.';
  assert.deepEqual(validateManifest(m), []);
  block.summary += ' An empty batch returns immediately, and the query is limited to the batch cap.';
  paragraph.text += ' An empty batch returns immediately.';
  assert.deepEqual(validateManifest(m), ['$.sections[1].blocks[0].summary: not narrated: "and the query is limited to the batch cap."']);
});

test('a block without a paragraph and an unspoken risk are rejected', () => {
  const m = load();
  const s = m.sections[1];
  s.narration = s.narration.filter((p) => p.target !== s.blocks[1].id);
  s.risks.push('Two Google calls and one debit per comparison.');
  assert.deepEqual(validateManifest(m), [
    '$.sections[1].blocks[1]: no narration paragraph',
    `$.sections[1].risks[${s.risks.length - 1}]: not narrated: "Two Google calls and one debit per comparison."`,
  ]);
});

test('uncovered matches spoken forms of the written source', () => {
  assert.deepEqual(uncovered('Anything else is a Greek 400 through validateEnum. Valid batches return unchanged.', 'Anything else is a Greek four hundred through validate enum. Valid batches return unchanged.'), []);
  assert.deepEqual(uncovered('Reads bridge.js and the cached rows.', 'It reads bridge dot j s and the cached rows.'), []);
});

test('a narration paragraph may target a mockup', () => {
  const m = load();
  m.sections[1].ui.push({ id: 't1-bridge-service-ui1', title: 'Panel', html: '<b>x</b>', notes: 'Empty state shows a link.' });
  m.sections[1].narration.push({ id: 't1-bridge-service-p9', target: 't1-bridge-service-ui1', text: 'Mockup one, panel. Empty state shows a link.' });
  assert.deepEqual(validateManifest(m), []);
});
