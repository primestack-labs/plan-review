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
      sections: { 't0-preamble': { verdict: 'approved', heard: true }, 't1-bridge-service': { verdict: 'commented', heard: true }, 't5-copy-from-windows': { verdict: 'approved', heard: false } },
      decisions: { d1: { resolution: 'Confirm 06–12 / 12–17 / 17–24' } },
      comments: [
        { id: 'c1', text: 'Why 21 slots and not 7×3 named?', anchor: { sectionId: 't1-bridge-service', quote: '21 availability slots', prefix: 'onto the ', suffix: ', detects' } },
        { id: 'c2', text: 'Show counts in the footer', anchor: { sectionId: 't5-copy-from-windows', quote: 'diff table', prefix: 'a ', suffix: ' of', uiId: 't5-copy-from-windows-ui1' } },
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
  assert.ok(card.includes('<div class="thread" id="thread-c1" data-comment="c1" data-status="clarified">'));
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

function revisedRound() {
  const previous = previousRound();
  const next = load();
  const t5 = next.sections[2];
  t5.summary = `${t5.summary} The footer now shows counts.`;
  t5.risks.push('A stale count survives a reload.');
  t5.executorDetail = `${t5.executorDetail}\nNew last line.`;
  t5.narration.unshift({ id: 't5-copy-from-windows-p0', text: 'Since round one, the footer shows counts and a stale count is a risk.', target: 'revision' });
  t5.narration.push({ id: 't5-copy-from-windows-p9', text: 'Your comment on the diff table: show counts in the footer. Accepted: the footer now shows plus n and minus n.', target: 'threads' });
  next.sections[1].narration.unshift({ id: 't1-bridge-service-p0', text: 'Nothing changed here.', target: 'revision' });
  next.sections[0].narration.push({ id: 't0-preamble-p9', text: 'No comments here.', target: 'threads' });
  stampHashes(next, 'plan');
  return { previous, next, html: render(next, { previous, round: 2 }) };
}

const card = (html, id, nextId) => html.slice(html.indexOf(`id="${id}"`), nextId ? html.indexOf(`id="${nextId}"`) : undefined);

test('a changed card opens with one line per changed field and the count of answered comments', () => {
  const { html } = revisedRound();
  const t5 = card(html, 't5-copy-from-windows');
  const revision = t5.slice(t5.indexOf('class="sub sub-revision"'), t5.indexOf('class="sub sub-summary"'));
  assert.ok(revision.includes('id="t5-copy-from-windows-revision"'));
  assert.ok(revision.includes('<h3>Since round 1</h3>'));
  assert.ok(!revision.includes('Footer now shows'));
  assert.ok(revision.includes('<li><a href="#t5-copy-from-windows-summary">Summary edited</a></li>'));
  assert.ok(revision.includes('<li><a href="#t5-copy-from-windows-risks">Risks: 1 added</a></li>'));
  assert.ok(revision.includes('<li><a href="#t5-copy-from-windows-executor">Executor detail: 1 line added</a></li><li><a href="#t5-copy-from-windows-threads">Comments: 1 accepted</a></li></ul>'));
  assert.ok(t5.includes('<div class="threads" id="t5-copy-from-windows-threads">'));
  assert.ok(!card(html, 't1-bridge-service', 't5-copy-from-windows').includes('sub-revision'));
});

test('changed fields carry the badge and show the new text as a row; unchanged fields do not', () => {
  const { html } = revisedRound();
  const t5 = card(html, 't5-copy-from-windows');
  assert.ok(t5.includes('<div class="sub sub-summary" id="t5-copy-from-windows-summary" data-changed="true"><h3>Summary <span class="badge">changed</span></h3>'));
  assert.ok(t5.includes('</span> <ins class="diff">The footer now shows counts.</ins></p>'));
  assert.ok(t5.includes('<li data-change="added"><ins class="diff">A stale count survives a reload.</ins></li>'));
  assert.ok(t5.includes('<div class="sub sub-interfaces" id="t5-copy-from-windows-interfaces"><h3>Interfaces</h3>'));
  assert.ok(t5.includes('<details class="sub sub-executor" id="t5-copy-from-windows-executor" data-changed="true"><summary>Executor detail <span class="badge">changed</span></summary><pre class="linediff">'));
  assert.ok(t5.includes('<ins>+ New last line.</ins>'));
});

test('an edited sentence shows the old row and the new row with the changed words marked', () => {
  const previous = previousRound();
  const next = load();
  next.sections[1].risks[0] = next.sections[1].risks[0].replace('24:00 everywhere', '24:00 wherever');
  stampHashes(next, 'plan');
  const t1 = card(render(next, { previous, round: 2 }), 't1-bridge-service', 't5-copy-from-windows');
  assert.ok(t1.includes('<li data-change="edited"><del class="diff">The end-of-day sentinel 23:59:59.999 must render as 24:00 <mark>everywhere</mark> minute arithmetic happens.</del><ins class="diff">The end-of-day sentinel 23:59:59.999 must render as 24:00 <mark>wherever</mark> minute arithmetic happens.</ins></li>'));
});

test('a removed risk and a rewritten summary show the previous text as a row of its own', () => {
  const previous = previousRound();
  const next = load();
  next.sections[1].summary = 'Entirely new wording that shares nothing with the old summary of this task.';
  next.sections[1].risks = [];
  stampHashes(next, 'plan');
  const t1 = card(render(next, { previous, round: 2 }), 't1-bridge-service', 't5-copy-from-windows');
  assert.ok(t1.includes('<p><del class="diff">A pure service that projects'));
  assert.ok(t1.includes('<ins class="diff">Entirely new wording that shares nothing with the old summary of this task.</ins></p>'));
  assert.ok(t1.includes('<li data-change="removed"><del class="diff">The end-of-day sentinel'));
  assert.ok(t1.includes('<a href="#t1-bridge-service-summary">Summary rewritten</a>'));
});

test('the header offers the changes toggle and the jump only when something changed', () => {
  const { html, next, previous } = revisedRound();
  assert.ok(html.includes('<span id="count-changed">1 changed</span>'));
  assert.ok(html.includes('<input id="show-changes" type="checkbox" checked> Show changes'));
  assert.ok(html.includes('<button id="next-change"'));
  assert.ok(!render(load(), { previous: previousRound(), round: 2 }).includes('id="show-changes"'));
  assert.ok(!render(next, { round: 1 }).includes('id="show-changes"'));
  assert.equal(previous.manifest.sections.length, 3);
});

test('a revision paragraph plays on a changed section and is dropped from an unchanged one', () => {
  const { html } = revisedRound();
  const data = JSON.parse(html.slice(html.indexOf('type="application/json">') + 24, html.indexOf('</script>', html.indexOf('type="application/json">'))));
  const ids = (sectionId) => data.sections.find((s) => s.id === sectionId).narration.map((p) => p.id);
  assert.ok(ids('t5-copy-from-windows').includes('t5-copy-from-windows-p0'));
  assert.ok(!ids('t1-bridge-service').includes('t1-bridge-service-p0'));
  assert.deepEqual(data.changed, ['t5-copy-from-windows']);
});

test('a threads paragraph plays on a section with threads and is dropped from one without', () => {
  const { html } = revisedRound();
  const data = JSON.parse(html.slice(html.indexOf('type="application/json">') + 24, html.indexOf('</script>', html.indexOf('type="application/json">'))));
  const ids = (sectionId) => data.sections.find((s) => s.id === sectionId).narration.map((p) => p.id);
  assert.ok(ids('t5-copy-from-windows').includes('t5-copy-from-windows-p9'));
  assert.ok(!ids('t0-preamble').includes('t0-preamble-p9'));
});

test('no previous round yields an empty context', () => {
  const ctx = roundContext(load(), null);
  assert.deepEqual([...ctx.changed], []);
  assert.deepEqual(ctx.prefill, {});
  assert.equal(ctx.threads('t1-bridge-service'), '');
});
