import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wordDiff, textChange, listChange, lineDiff, sectionRevision, revisionNotes } from '../scripts/lib/revision.mjs';
import { stampHashes } from '../scripts/validate.mjs';

const load = () => stampHashes(JSON.parse(readFileSync(new URL('./fixtures/availability-bridge.manifest.json', import.meta.url))), 'plan');
const flat = (ops) => ops.map((o) => `${{ equal: '=', insert: '+', delete: '-' }[o.op]}${o.value}`).join('|');
const row = (ops) => ops.map((o) => (o.op === 'equal' ? o.value : `[${o.value}]`)).join('');

test('wordDiff keeps whitespace inside the tokens and merges runs of one kind', () => {
  const { ops, similarity } = wordDiff('the cache grows with distinct pairs', 'the cache table grows with distinct address pairs');
  assert.equal(flat(ops), '=the cache |+table |=grows with distinct |+address |=pairs');
  assert.ok(similarity > 0.7 && similarity < 1, String(similarity));
  assert.equal(flat(wordDiff('one two', 'uno dos').ops), '-one two|+uno dos');
  assert.equal(flat(wordDiff('one two three four', 'uno two tres four').ops), '-one|+uno|= two |-three|+tres|= four');
  assert.equal(flat(wordDiff('alpha beta gamma delta the one two three four', 'pi rho sigma tau the five six seven eight').ops), '-alpha beta gamma delta the one two three four|+pi rho sigma tau the five six seven eight');
});

test('textChange keeps the old and the new text apart and marks only the changed words', () => {
  assert.equal(textChange('same text', 'same text'), null);
  const r = textChange('Footer shows counts.', 'Footer now shows counts.');
  assert.equal(r.kind, 'edited');
  assert.equal(r.parts.length, 1);
  assert.equal(row(r.parts[0].before), 'Footer shows counts.');
  assert.equal(row(r.parts[0].after), 'Footer [now ]shows counts.');
});

test('textChange compares sentence by sentence and keeps unchanged sentences once', () => {
  const r = textChange(
    'First sentence stays. The cache grows with distinct pairs; nothing prunes it. Last sentence stays.',
    'First sentence stays. The cache table grows with distinct address pairs; nothing prunes it. Last sentence stays.',
  );
  assert.deepEqual(r.parts.map((p) => p.kind), ['same', 'changed', 'same']);
  assert.equal(r.parts[0].text, 'First sentence stays.');
  assert.equal(row(r.parts[1].before), 'The cache grows with distinct pairs;');
  assert.equal(row(r.parts[1].after), 'The cache [table ]grows with distinct [address ]pairs;');
  assert.equal(r.parts[2].text, 'nothing prunes it. Last sentence stays.');
});

test('a sentence replaced by one that shares nothing with it gets plain rows, and the field counts as rewritten', () => {
  const r = textChange('Footer shows counts.', 'Every row of the diff table opens the window it came from.');
  assert.equal(r.kind, 'rewritten');
  assert.deepEqual(r.parts, [{ kind: 'changed', before: [{ op: 'equal', value: 'Footer shows counts.' }], after: [{ op: 'equal', value: 'Every row of the diff table opens the window it came from.' }] }]);
  const added = textChange('Kept as is.', 'Kept as is. And one more.');
  assert.deepEqual(added.parts[1], { kind: 'changed', before: null, after: [{ op: 'equal', value: 'And one more.' }] });
});

test('listChange pairs an edited item, counts added and removed ones and keeps order', () => {
  const before = ['Nothing prunes the cache', 'The SDK is polled for ten seconds', 'Savings exist only against a baseline'];
  const after = ['Nothing prunes the cache; a TTL is deferred', 'Savings exist only against a baseline', 'Browser verification is billed'];
  const change = listChange(before, after);
  assert.deepEqual(change.items.map((i) => i.kind), ['removed', 'edited', 'same', 'added']);
  assert.equal(row(change.items[1].change.parts[0].after), 'Nothing prunes the cache[; a TTL is deferred]');
  assert.equal(change.items[0].text, 'The SDK is polled for ten seconds');
  assert.deepEqual(change.counts, { added: 1, removed: 1, edited: 1 });
  assert.equal(listChange(before, before), null);
  const reordered = listChange(['reset-demo deletes every row', 'Determinism rests on a fixture', 'Never press the button', 'A green render'], ['Every render calls Google', 'Figures drift', 'reset-demo deletes every row; also the proposal', 'The run is asynchronous', 'A green render']);
  assert.deepEqual(reordered.items.map((i) => `${i.kind}:${i.text.split(' ')[0]}`), ['removed:Determinism', 'removed:Never', 'added:Every', 'added:Figures', 'edited:reset-demo', 'added:The', 'same:A']);
  const far = listChange(['The seed creates a season with three placements and a ready proposal.'], ['The scenario places three lessons that zigzag and presses the button.']);
  assert.deepEqual(far.items.map((i) => i.kind), ['removed', 'added']);
});

test('lineDiff groups changed lines into hunks with two lines of context and marks words in paired lines', () => {
  const before = ['a', 'b', 'c', 'const TIERS = { minor_s: 900 };', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n');
  const after = ['a', 'b', 'c', 'const TIERS = { minor_s: 300 };', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].join('\n');
  const d = lineDiff(before, after);
  assert.equal(d.hunks.length, 2);
  assert.equal(d.hunks[0].map((o) => o.op).join(','), 'equal,equal,delete,insert,equal,equal');
  assert.equal(row(d.hunks[0][2].ops), 'const TIERS = { minor_s: [900] };');
  assert.equal(row(d.hunks[0][3].ops), 'const TIERS = { minor_s: [300] };');
  assert.equal(flat(d.hunks[1]), '=i|=j|+k');
  assert.equal(d.hunks[1][2].ops, undefined);
  assert.deepEqual([d.added, d.removed], [2, 1]);
  assert.equal(lineDiff(before, before), null);
});

test('sectionRevision is null for an unchanged section and reports every changed field', () => {
  const previous = load().sections[1];
  const next = load().sections[1];
  assert.equal(sectionRevision(previous, next), null);
  next.summary = `${next.summary} It also recomputes on demand.`;
  next.risks.push('A stale cache row survives a redeploy.');
  next.interfaces.produces.push('recompute(studentId)');
  next.blocks[0].summary = 'Something else entirely, rewritten from scratch for the second round of the review.';
  next.blocks[0].source = `${next.blocks[0].source}\n// changed`;
  next.executorDetail = `${next.executorDetail}\nNew last line.`;
  next.changes.push({ role: 'migration', path: 'api/database/migrations/001.js', action: 'create' });
  stampHashes({ plan: {}, sections: [next] }, 'plan');
  const r = sectionRevision(previous, next);
  assert.equal(r.summary.kind, 'edited');
  assert.deepEqual(r.risks.counts, { added: 1, removed: 0, edited: 0 });
  assert.deepEqual(r.interfaces.produces.counts, { added: 1, removed: 0, edited: 0 });
  assert.equal(r.interfaces.consumes, null);
  assert.deepEqual(r.changes.counts, { added: 1, removed: 0, edited: 0 });
  assert.equal(r.blocks[next.blocks[0].id].summary.kind, 'rewritten');
  assert.equal(r.blocks[next.blocks[0].id].source, true);
  assert.equal(r.executorDetail.added, 1);
  assert.deepEqual(r.ui, {});
});

test('revisionNotes names each changed field with its target', () => {
  const previous = load().sections[1];
  const next = load().sections[1];
  next.summary = `${next.summary} It also recomputes on demand.`;
  next.risks.push('A stale cache row survives a redeploy.');
  next.blocks[0].source = `${next.blocks[0].source}\n// changed`;
  next.executorDetail = `${next.executorDetail}\nNew last line.`;
  const notes = revisionNotes(sectionRevision(previous, next), next);
  assert.deepEqual(notes, [
    { target: 'summary', text: 'Summary edited' },
    { target: 'risks', text: 'Risks: 1 added' },
    { target: next.blocks[0].id, text: 'Code block 1: source changed' },
    { target: 'executor', text: 'Executor detail: 1 line added' },
  ]);
});
