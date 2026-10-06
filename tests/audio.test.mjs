import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { narrationChunks, audioFileName, generateAudio, pruneStale } from '../scripts/audio.mjs';

const stub = (calls = [], duration = 1) => ({ name: 'stub', extension: 'm4a', concurrency: 8, defaultVoice: '', synthesize: async (path, text) => { calls.push(text); writeFileSync(path, ''); }, duration: async () => duration });

const manifest = JSON.parse(readFileSync(new URL('./fixtures/availability-bridge.manifest.json', import.meta.url)));
const paragraphIds = [...manifest.narration.overview, ...manifest.narration.decisions, ...manifest.sections.flatMap((s) => s.narration)].map((p) => p.id);

test('narrationChunks flattens paragraphs in document order with their section', () => {
  const chunks = narrationChunks(manifest);
  assert.deepEqual(chunks.map((c) => c.id), paragraphIds);
  assert.equal(chunks[0].sectionId, 'overview');
  assert.equal(chunks[0].target, 'goal');
  assert.equal(chunks[2].sectionId, 'decisions');
  assert.equal(chunks[4].sectionId, 't0-preamble');
});

test('audioFileName is a content hash that depends on provider, voice and rate', () => {
  assert.match(audioFileName('say', '', '', 'hello', 'm4a'), /^[0-9a-f]{40}\.m4a$/);
  assert.match(audioFileName('kokoro', 'bf_emma', '', 'hello', 'wav'), /^[0-9a-f]{40}\.wav$/);
  assert.notEqual(audioFileName('say', 'Daniel', '', 'hello', 'm4a'), audioFileName('say', '', '', 'hello', 'm4a'));
  assert.notEqual(audioFileName('say', '', '180', 'hello', 'm4a'), audioFileName('say', '', '', 'hello', 'm4a'));
  assert.notEqual(audioFileName('kokoro', '', '', 'hello', 'm4a'), audioFileName('say', '', '', 'hello', 'm4a'));
});

test('generateAudio calls say once per new paragraph, probes durations, writes the index, and skips existing files', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'plan-review-audio-'));
  const calls = [];
  const provider = stub(calls, 1.5);

  const index = await generateAudio(manifest, outDir, { provider, voice: 'Daniel', rate: '180' });
  assert.equal(calls.length, paragraphIds.length);
  assert.deepEqual(Object.keys(index), paragraphIds);
  assert.equal(index['t1-bridge-service-p1'].sectionId, 't1-bridge-service');
  assert.equal(index['t1-bridge-service-p1'].duration, 1.5);
  assert.equal(index['t1-bridge-service-p1'].file, audioFileName('stub', 'Daniel', '180', manifest.sections[1].narration[0].text, 'm4a'));
  assert.ok(existsSync(join(outDir, 'index.json')));

  const second = await generateAudio(manifest, outDir, { provider, voice: 'Daniel', rate: '180' });
  assert.equal(calls.length, paragraphIds.length);
  assert.deepEqual(second, index);
});

test('generateAudio deduplicates identical paragraph text', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'plan-review-audio-'));
  const twin = structuredClone(manifest);
  twin.sections[0].narration[1].text = twin.sections[0].narration[0].text;
  const calls = [];
  await generateAudio(twin, outDir, { provider: stub(calls) });
  assert.equal(calls.length, paragraphIds.length - 1);
});

test('generateAudio does not treat a leftover .partial.m4a as cached', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'plan-review-audio-'));
  const firstChunk = narrationChunks(manifest)[0];
  const file = audioFileName('stub', '', '', firstChunk.text, 'm4a');
  writeFileSync(join(outDir, file.replace(/\.m4a$/, '.partial.m4a')), '');

  const calls = [];
  await generateAudio(manifest, outDir, { provider: stub(calls) });
  assert.ok(calls.includes(firstChunk.text));
});

test('generateAudio prunes files the index no longer references', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'plan-review-audio-'));
  writeFileSync(join(outDir, 'stale.m4a'), '');
  writeFileSync(join(outDir, 'stale.wav'), '');
  await generateAudio(manifest, outDir, { provider: stub() });
  assert.ok(!existsSync(join(outDir, 'stale.m4a')) && !existsSync(join(outDir, 'stale.wav')));
  assert.equal(await pruneStale(outDir, new Set()), paragraphIds.length);
});
