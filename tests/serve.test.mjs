import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createReviewServer } from '../scripts/serve.mjs';

const dir = mkdtempSync(join(tmpdir(), 'plan-review-serve-'));
writeFileSync(join(dir, 'index.html'), '<!doctype html><title>t</title>');
writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ plan: { hash: 'abc' } }));
mkdirSync(join(dir, 'audio'));
writeFileSync(join(dir, 'audio', 'x.m4a'), 'AUDIO');
writeFileSync(join(dir, 'audio', 'y.wav'), 'WAV');

const submitted = [];
const server = createReviewServer({ dir, round: 1, planHash: 'abc', onSubmit: (p) => submitted.push(p) });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const submission = (overrides = {}) => ({
  schema: 1, round: 1, planHash: 'abc', submittedAt: '2026-09-11T10:00:00Z', outcome: 'approved',
  sections: { 't0-preamble': { verdict: 'approved', heard: true } }, decisions: {}, comments: [], ...overrides,
});

test('serves the page, audio and 404s outside the review dir', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const audio = await fetch(`${base}/audio/x.m4a`);
  assert.equal(audio.headers.get('content-type'), 'audio/mp4');
  assert.equal(await audio.text(), 'AUDIO');
  assert.equal((await fetch(`${base}/audio/y.wav`)).headers.get('content-type'), 'audio/wav');
  assert.equal((await fetch(`${base}/manifest.json`)).status, 404);
  assert.equal((await fetch(`${base}/audio/../manifest.json`)).status, 404);
  assert.equal((await fetch(`${base}/draft.json`)).status, 404);
});

test('POST /draft writes draft.json and GET serves it back', async () => {
  const res = await post('/draft', { sections: {}, scroll: 42 });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'draft.json'), 'utf8')), { sections: {}, scroll: 42 });
  assert.equal((await (await fetch(`${base}/draft.json`)).json()).scroll, 42);
});

test('an invalid submission is rejected with the schema errors and nothing is written', async () => {
  const res = await post('/submit', submission({ outcome: 'maybe' }));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /\$\.outcome: expected one of approved, changes-requested/);
  assert.ok(!existsSync(join(dir, 'rounds')));
  assert.equal((await post('/submit', submission({ round: 2 }))).status, 409);
  assert.equal((await post('/submit', submission({ planHash: 'stale' }))).status, 409);
  assert.deepEqual(submitted, []);
});

test('a malformed JSON body is rejected on both endpoints without side effects', async () => {
  const before = readFileSync(join(dir, 'draft.json'), 'utf8');
  const malformed = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' };

  const draftRes = await fetch(`${base}/draft`, malformed);
  assert.equal(draftRes.status, 400);
  assert.equal(await draftRes.text(), 'invalid JSON body');
  assert.equal(readFileSync(join(dir, 'draft.json'), 'utf8'), before);

  const submitRes = await fetch(`${base}/submit`, malformed);
  assert.equal(submitRes.status, 400);
  assert.equal(await submitRes.text(), 'invalid JSON body');
  assert.ok(!existsSync(join(dir, 'rounds')));
});

test('a valid submission writes the round files and fires onSubmit', async () => {
  const res = await post('/submit', submission());
  assert.equal(res.status, 200);
  const { path } = await res.json();
  assert.equal(path, join(dir, 'rounds', '1', 'submission.json'));
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).outcome, 'approved');
  assert.ok(existsSync(join(dir, 'rounds', '1', 'manifest.json')));
  assert.deepEqual(submitted, [path]);
});
