import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, roundContext } from '../scripts/render.mjs';
import { stampHashes } from '../scripts/validate.mjs';

const load = () => stampHashes(JSON.parse(readFileSync(new URL('./fixtures/availability-bridge.manifest.json', import.meta.url))), 'plan');

function previousRound() {
  const manifest = load();
  return {
    manifest,
    submission: {
      schema: 1, round: 1, planHash: manifest.plan.hash, submittedAt: '2026-09-11T10:00:00Z', outcome: 'changes-requested',
      sections: { 't0-preamble': { verdict: 'approved', heard: true }, 't1-bridge-service': { verdict: 'questioned', heard: true }, 't5-copy-from-windows': { verdict: 'approved', heard: false } },
      decisions: { d1: { resolution: 'Confirm 06–12 / 12–17 / 17–24' } },
      comments: [
        { id: 'c1', type: 'question', text: 'Why 21 slots and not 7×3 named?', anchor: { sectionId: 't1-bridge-service', quote: '21 availability slots', prefix: 'onto the ', suffix: ', detects' } },
        { id: 'c2', type: 'change', text: 'Show counts in the footer', anchor: { sectionId: 't5-copy-from-windows', quote: 'diff table', prefix: 'a ', suffix: ' of', uiId: 't5-copy-from-windows-ui1' } },
      ],
    },
    replies: { round: 1, replies: { c1: { status: 'clarified', text: '21 is 7 weekdays × 3 periods; the object is keyed by slot name.' }, c2: { status: 'accepted', text: 'Footer now shows +n / −n.' } } },
  };
}

test('unchanged approved sections are prefilled; changed and replied-to sections are not', () => {
  const previous = previousRound();
  const next = load();
  next.sections[2].summary = 'Footer now shows counts.';
  stampHashes(next, 'plan');
  const ctx = roundContext(next, previous);
  assert.deepEqual([...ctx.changed], ['t5-copy-from-windows']);
  assert.deepEqual(ctx.prefill, { 't0-preamble': 'approved' });
  assert.deepEqual(ctx.previousResolutions, { d1: 'Confirm 06–12 / 12–17 / 17–24' });
});

test('an accepted reply on an unchanged approved section keeps the prefill; rejected or clarified clears it', () => {
  const previous = previousRound();
  previous.submission.sections['t5-copy-from-windows'].verdict = 'approved';
  const keep = roundContext(load(), previous);
  assert.equal(keep.prefill['t5-copy-from-windows'], 'approved');
  previous.replies.replies.c2.status = 'rejected';
  const cleared = roundContext(load(), previous);
  assert.equal(cleared.prefill['t5-copy-from-windows'], undefined);
});

test('threads render the quote, the comment and the reply inside the section', () => {
  const html = render(load(), { previous: previousRound(), round: 2 });
  const card = html.slice(html.indexOf('id="t1-bridge-service"'), html.indexOf('id="t5-copy-from-windows"'));
  assert.ok(card.includes('<div class="thread" data-comment="c1" data-status="clarified">'));
  assert.ok(card.includes('<blockquote>21 availability slots</blockquote>'));
  assert.ok(card.includes('Why 21 slots'));
  assert.ok(card.includes('7 weekdays × 3 periods'));
});

test('changed sections carry the badge and the resolved decision is checked', () => {
  const previous = previousRound();
  const next = load();
  next.sections[1].summary = 'Changed.';
  stampHashes(next, 'plan');
  const html = render(next, { previous, round: 2 });
  assert.ok(html.includes('id="t1-bridge-service" data-section="t1-bridge-service" data-kind="task" data-verdict="" data-changed="true"'));
  assert.ok(html.includes('id="t0-preamble" data-section="t0-preamble" data-kind="preamble" data-verdict="approved" data-collapsed="true"'));
  assert.ok(html.includes('value="Confirm 06–12 / 12–17 / 17–24" checked'));
  assert.ok(html.includes('data-decision="d1" data-kind="confirm" data-resolved="true"'));
});

test('no previous round yields an empty context', () => {
  const ctx = roundContext(load(), null);
  assert.deepEqual([...ctx.changed], []);
  assert.deepEqual(ctx.prefill, {});
  assert.equal(ctx.threads('t1-bridge-service'), '');
});
