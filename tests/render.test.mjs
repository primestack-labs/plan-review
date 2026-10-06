import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, escapeHtml, readingMinutes, listeningSeconds, mermaidId } from '../scripts/render.mjs';
import { stampHashes } from '../scripts/validate.mjs';

const load = () => stampHashes(JSON.parse(readFileSync(new URL('./fixtures/availability-bridge.manifest.json', import.meta.url))), 'plan');
const count = (html, re) => (html.match(re) ?? []).length;
const attrValues = (html, attr) => [...html.matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))].map((m) => m[1]);

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('one card per section, in manifest order', () => {
  const m = load();
  const html = render(m);
  assert.equal(count(html, /<article class="card"/g), m.sections.length);
  const stripped = html.replace(/<button class="play"[^>]*>/g, '').replace(/<button class="seg intro"[^>]*>/g, '').replace(/<button class="chapter[^"]*"[^>]*>/g, '');
  assert.deepEqual(attrValues(stripped, 'data-section').filter((v, i, a) => a.indexOf(v) === i), m.sections.map((s) => s.id));
});

test('every card has the sub-blocks in the fixed order and a verdict bar', () => {
  const html = render(load());
  const order = ['summary', 'changes', 'interfaces', 'decisions', 'ui', 'risks', 'code'];
  const card = html.slice(html.indexOf('id="t1-bridge-service"'), html.indexOf('id="t5-copy-from-windows"'));
  const positions = order.map((n) => card.indexOf(`id="t1-bridge-service-${n}"`));
  assert.ok(positions.every((p) => p >= 0), positions.join(','));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.ok(card.includes('<details class="sub sub-executor" id="t1-bridge-service-executor">'));
  assert.equal(count(card, /<footer class="verdict">/g), 1);
  assert.ok(card.includes('data-verdict="approved"') && card.includes('data-verdict="commented"') && !card.includes('data-verdict="questioned"'));
});

test('the decisions panel lists every decision with a resolution control', () => {
  const m = load();
  const html = render(m);
  for (const d of m.decisions) assert.ok(html.includes(`data-decision="${d.id}"`), d.id);
  assert.equal(count(html, /name="decision-d1"/g), 2);
  assert.equal(count(html, /<input type="text" name="decision-d2"/g), 1);
});

test('every block is a disclosure with its source; tests list behaviours', () => {
  const html = render(load());
  assert.ok(html.includes('<details class="block" id="t1-bridge-service-b1" data-kind="test">'));
  assert.ok(html.includes('<ul class="behaviors"><li>pins the confirmed slot boundaries</li>'));
  assert.ok(html.includes('expect(SLOT_BOUNDS).toEqual'));
  assert.ok(!html.includes('<script>alert'));
});

test('every narration target resolves to an element in its card', () => {
  const m = load();
  const html = render(m);
  for (const s of m.sections) {
    for (const p of s.narration) {
      const id = ['summary', 'interfaces', 'decisions', 'risks', 'ui'].includes(p.target) ? `${s.id}-${p.target}` : p.target;
      assert.ok(html.includes(`id="${id}"`), `${p.id} → ${id}`);
    }
  }
});

test('mockups render raw html inside a sized frame; executor detail is embedded as markdown', () => {
  const html = render(load());
  assert.ok(html.includes('<figure class="mockup" data-ui="t5-copy-from-windows-ui1">'));
  assert.ok(html.includes('style="width:320px"'));
  assert.ok(html.includes('Αντιγραφή από ωράριο'));
  assert.ok(html.includes('<script type="text/markdown" id="md-t1-bridge-service">- [ ] **Step 1'));
});

test('header carries the task map, the progress bar and the embedded data', () => {
  const m = load();
  const audioIndex = { 't1-bridge-service-p1': { file: 'a.m4a', sectionId: 't1-bridge-service', duration: 30 } };
  const html = render(m, { audioIndex, round: 2 });
  assert.ok(html.includes('flowchart LR'));
  assert.ok(html.includes(`${mermaidId('t1-bridge-service')} --&gt;|SLOT_BOUNDS, projectWindows| ${mermaidId('t5-copy-from-windows')}`));
  assert.equal(count(html, /<button class="seg"/g), m.sections.length);
  assert.equal(count(html, /<button class="seg intro"/g), 2);
  assert.ok(html.includes('id="overview-goal"') && html.includes('id="overview-taskMap"'));
  assert.ok(html.includes('<span class="round">Round 2</span>'));
  const data = JSON.parse(html.match(/<script id="review-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.round, 2);
  assert.equal(data.planHash, m.plan.hash);
  assert.deepEqual(data.audioIndex, audioIndex);
  assert.deepEqual(data.changed, []);
  assert.deepEqual(data.prefill, {});
  assert.deepEqual(data.intro.map((s) => s.id), ['overview', 'decisions']);
  assert.deepEqual(data.sections.map((s) => s.id), m.sections.map((s) => s.id));
  assert.deepEqual(data.sections[1].narration[0], { id: 't1-bridge-service-p1', target: 'summary' });
  assert.deepEqual(data.decisions, [{ id: 'd1' }, { id: 'd2' }]);
});

test('overview omits the mermaid task map when there are no nodes', () => {
  const m = load();
  m.taskMap = { nodes: [], edges: [] };
  const html = render(m);
  assert.ok(!html.includes('<pre class="mermaid">'));
  assert.ok(!html.includes('flowchart LR'));
});

test('budgets come from word counts and audio durations', () => {
  const m = load();
  assert.ok(readingMinutes(m.sections[1]) > 0.3 && readingMinutes(m.sections[1]) < 1);
  assert.equal(listeningSeconds(m.sections[1], { 't1-bridge-service-p1': { duration: 10 }, 't1-bridge-service-p2': { duration: 5 } }), 15);
  assert.equal(mermaidId('t1-bridge-service'), 't1_bridge_service');
});

test('the header offers a theme switcher', () => {
  const html = render(load());
  assert.ok(html.includes('<select id="theme"'));
  for (const v of ['system', 'light', 'dark']) assert.ok(html.includes(`<option value="${v}">`), v);
});
