import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQueue, initialState, mergeDraft, submitBlockers, counters, outcome, buildSubmission, anchorFromSelection, sectionOrder } from '../template/state.mjs';

const manifest = JSON.parse(readFileSync(new URL('./fixtures/availability-bridge.manifest.json', import.meta.url)));
const { sections, decisions } = manifest;
const fresh = () => initialState(sections, decisions, {}, {}, 1);

test('buildQueue lists paragraphs in document order', () => {
  const q = buildQueue(sections);
  assert.equal(q.length, 11);
  assert.deepEqual(q[2], { id: 't1-bridge-service-p1', sectionId: 't1-bridge-service', target: 'summary' });
});

test('initialState applies prefill and previous resolutions', () => {
  const s = initialState(sections, decisions, { 't0-preamble': 'approved' }, { d1: 'Confirm' }, 1);
  assert.equal(s.round, 1);
  assert.equal(s.sections['t0-preamble'].verdict, 'approved');
  assert.equal(s.sections['t1-bridge-service'].verdict, null);
  assert.equal(s.decisions.d1.resolution, 'Confirm');
  assert.equal(s.decisions.d2.resolution, null);
  assert.deepEqual(s.comments, []);
});

test('mergeDraft restores known ids and drops unknown ones', () => {
  const s = mergeDraft(fresh(), {
    round: 1,
    sections: { 't1-bridge-service': { verdict: 'questioned', heard: true }, 't9-gone': { verdict: 'approved', heard: true } },
    decisions: { d2: { resolution: 'ok' }, d9: { resolution: 'x' } },
    comments: [{ id: 'c1', type: 'question', text: 'why', anchor: { sectionId: 't1-bridge-service', quote: 'q', prefix: '', suffix: '' } }],
    nextComment: 2, scroll: 120,
  });
  assert.equal(s.sections['t1-bridge-service'].verdict, 'questioned');
  assert.equal(s.sections['t9-gone'], undefined);
  assert.equal(s.decisions.d2.resolution, 'ok');
  assert.equal(s.decisions.d9, undefined);
  assert.equal(s.comments.length, 1);
  assert.equal(s.nextComment, 2);
  assert.equal(s.scroll, 120);
});

test('mergeDraft ignores a draft from a different round', () => {
  const s = mergeDraft(fresh(), {
    round: 2,
    sections: { 't1-bridge-service': { verdict: 'questioned', heard: true } },
    decisions: { d2: { resolution: 'ok' } },
    comments: [{ id: 'c1', type: 'question', text: 'why', anchor: { sectionId: 't1-bridge-service', quote: 'q', prefix: '', suffix: '' } }],
    nextComment: 2, scroll: 120,
  });
  assert.equal(s.sections['t1-bridge-service'].verdict, null);
  assert.equal(s.decisions.d2.resolution, null);
  assert.deepEqual(s.comments, []);
  assert.equal(s.scroll, 0);
});

test('mergeDraft merges a draft from the same round', () => {
  const s = mergeDraft(fresh(), {
    round: 1,
    sections: { 't1-bridge-service': { verdict: 'approved', heard: true } },
    decisions: {},
    comments: [],
    nextComment: 1, scroll: 50,
  });
  assert.equal(s.sections['t1-bridge-service'].verdict, 'approved');
  assert.equal(s.scroll, 50);
});

test('submitBlockers names every gap and clears when complete', () => {
  const s = fresh();
  assert.deepEqual(submitBlockers(sections, decisions, s), ['3 sections without a verdict', '2 open decisions']);
  for (const id of Object.keys(s.sections)) s.sections[id].verdict = 'approved';
  s.sections['t1-bridge-service'].verdict = 'commented';
  s.decisions.d1.resolution = 'Confirm';
  s.decisions.d2.resolution = 'Noted';
  assert.deepEqual(submitBlockers(sections, decisions, s), ['1 commented section without a comment']);
  s.comments.push({ id: 'c1', type: 'change', text: 'x', anchor: { sectionId: 't1-bridge-service', quote: 'q', prefix: '', suffix: '' } });
  assert.deepEqual(submitBlockers(sections, decisions, s), []);
});

test('counters and outcome', () => {
  const s = fresh();
  s.sections['t0-preamble'].verdict = 'approved';
  s.sections['t1-bridge-service'].verdict = 'questioned';
  assert.deepEqual(counters(sections, decisions, s), { approved: 1, commented: 0, questioned: 1, openDecisions: 2 });
  assert.equal(outcome(sections, s), 'changes-requested');
  for (const id of Object.keys(s.sections)) s.sections[id].verdict = 'approved';
  assert.equal(outcome(sections, s), 'approved');
  s.comments.push({ id: 'c1', type: 'change', text: 'x', anchor: { sectionId: 't0-preamble', quote: 'q', prefix: '', suffix: '' } });
  assert.equal(outcome(sections, s), 'changes-requested');
});

test('buildSubmission produces the schema shape', () => {
  const s = fresh();
  for (const id of Object.keys(s.sections)) s.sections[id].verdict = 'approved';
  s.decisions.d1.resolution = 'Confirm';
  s.decisions.d2.resolution = 'Noted';
  const sub = buildSubmission({ round: 1, planHash: 'abc', sections, decisions, state: s, now: '2026-09-11T10:00:00.000Z' });
  assert.deepEqual(Object.keys(sub), ['schema', 'round', 'planHash', 'submittedAt', 'outcome', 'sections', 'decisions', 'comments']);
  assert.equal(sub.outcome, 'approved');
  assert.deepEqual(sub.sections['t0-preamble'], { verdict: 'approved', heard: false });
  assert.deepEqual(sub.decisions, { d1: { resolution: 'Confirm' }, d2: { resolution: 'Noted' } });
});

test('anchorFromSelection trims context to ten characters', () => {
  assert.deepEqual(
    anchorFromSelection({ text: 'slots', before: 'projects working windows onto the 21 availability ', after: ', detects harmful mismatches' }),
    { quote: 'slots', prefix: 'ilability ', suffix: ', detects ' },
  );
});

test('sectionOrder moves by delta and clamps', () => {
  assert.equal(sectionOrder(sections, 't0-preamble', 1), 't1-bridge-service');
  assert.equal(sectionOrder(sections, 't5-copy-from-windows', 1), 't5-copy-from-windows');
  assert.equal(sectionOrder(sections, 't0-preamble', -1), 't0-preamble');
  assert.equal(sectionOrder(sections, null, 1), 't0-preamble');
});
