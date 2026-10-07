import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTts, PROVIDERS } from '../scripts/tts/index.mjs';
import { wavBuffer, wavDuration, joinSamples } from '../scripts/tts/kokoro.mjs';

test('resolveTts picks the provider voice, lets --voice win, and treats empty flags as unset', () => {
  assert.equal(resolveTts().provider, PROVIDERS.kokoro);
  assert.equal(resolveTts().voice, 'bf_emma');
  assert.equal(resolveTts({ tts: '', voice: '' }).voice, 'bf_emma');
  assert.equal(resolveTts({ tts: 'kokoro', kokoroVoice: 'af_heart', sayVoice: 'Samantha' }).voice, 'af_heart');
  assert.equal(resolveTts({ tts: 'say', kokoroVoice: 'af_heart', sayVoice: 'Samantha' }).voice, 'Samantha');
  assert.equal(resolveTts({ tts: 'say', sayVoice: '' }).voice, '');
  assert.equal(resolveTts({ tts: 'say', sayVoice: 'Samantha', voice: 'Jamie (Premium)' }).voice, 'Jamie (Premium)');
  assert.equal(resolveTts({ rate: '' }).rate, '');
  assert.equal(resolveTts({ tts: 'say', rate: '180' }).rate, '180');
  assert.throws(() => resolveTts({ tts: 'nope' }), /unknown tts provider/);
});

test('joinSamples inserts a gap between parts only', () => {
  const a = new Float32Array([1, 1]);
  const b = new Float32Array([2]);
  assert.deepEqual([...joinSamples([a, b], 1000, 2)], [1, 1, 0, 0, 2]);
  assert.deepEqual([...joinSamples([a], 1000, 2)], [1, 1]);
});

test('wavBuffer writes a header wavDuration reads back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-review-wav-'));
  const path = join(dir, 'a.wav');
  writeFileSync(path, wavBuffer(new Float32Array(24000 * 1.5), 24000));
  assert.equal(wavDuration(path), 1.5);
});
