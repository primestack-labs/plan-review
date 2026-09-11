import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { narrationChunks, audioFileName, generateAudio } from '../scripts/audio.mjs';

const manifest = JSON.parse(readFileSync(new URL('./fixtures/availability-bridge.manifest.json', import.meta.url)));
const paragraphIds = manifest.sections.flatMap((s) => s.narration.map((p) => p.id));

test('narrationChunks flattens paragraphs in document order with their section', () => {
  const chunks = narrationChunks(manifest);
  assert.deepEqual(chunks.map((c) => c.id), paragraphIds);
  assert.equal(chunks[0].sectionId, 't0-preamble');
  assert.equal(chunks[0].target, 'summary');
});

test('audioFileName is a content hash that depends on voice and rate', () => {
  assert.match(audioFileName('', '', 'hello'), /^[0-9a-f]{40}\.m4a$/);
  assert.notEqual(audioFileName('Daniel', '', 'hello'), audioFileName('', '', 'hello'));
  assert.notEqual(audioFileName('', '180', 'hello'), audioFileName('', '', 'hello'));
});

test('generateAudio calls say once per new paragraph, probes durations, writes the index, and skips existing files', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'plan-review-audio-'));
  const calls = [];
  const say = async (path, text) => { calls.push(text); writeFileSync(path, ''); };
  const probe = async () => 1.5;

  const index = await generateAudio(manifest, outDir, { voice: 'Daniel', rate: '180', say, probe });
  assert.equal(calls.length, paragraphIds.length);
  assert.deepEqual(Object.keys(index), paragraphIds);
  assert.equal(index['t1-bridge-service-p1'].sectionId, 't1-bridge-service');
  assert.equal(index['t1-bridge-service-p1'].duration, 1.5);
  assert.equal(index['t1-bridge-service-p1'].file, audioFileName('Daniel', '180', manifest.sections[1].narration[0].text));
  assert.ok(existsSync(join(outDir, 'index.json')));

  const second = await generateAudio(manifest, outDir, { voice: 'Daniel', rate: '180', say, probe });
  assert.equal(calls.length, paragraphIds.length);
  assert.deepEqual(second, index);
});

test('generateAudio deduplicates identical paragraph text', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'plan-review-audio-'));
  const twin = structuredClone(manifest);
  twin.sections[0].narration[1].text = twin.sections[0].narration[0].text;
  let calls = 0;
  await generateAudio(twin, outDir, { say: async (path) => { calls++; writeFileSync(path, ''); }, probe: async () => 1 });
  assert.equal(calls, paragraphIds.length - 1);
});

test('generateAudio does not treat a leftover .partial.m4a as cached', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'plan-review-audio-'));
  const firstChunk = narrationChunks(manifest)[0];
  const file = audioFileName('', '', firstChunk.text);
  writeFileSync(join(outDir, file.replace(/\.m4a$/, '.partial.m4a')), '');

  const calls = [];
  const say = async (path, text) => { calls.push(text); writeFileSync(path, ''); };
  await generateAudio(manifest, outDir, { say, probe: async () => 1 });
  assert.ok(calls.includes(firstChunk.text));
});
