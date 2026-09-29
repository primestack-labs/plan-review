import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { sameSynthesis, probeVoice } from '../scripts/check-voice.mjs';

test('sameSynthesis compares duration and size', () => {
  assert.equal(sameSynthesis({ duration: 4.9, bytes: 100 }, { duration: 4.9, bytes: 100 }), true);
  assert.equal(sameSynthesis({ duration: 4.9, bytes: 100 }, { duration: 5.0, bytes: 100 }), false);
});

test('probeVoice reports a fallback when the requested voice renders like the bogus one', async () => {
  const say = async (path, text, { voice }) => writeFileSync(path, voice === 'Real' ? 'aaaa' : 'bb');
  const probe = async (path) => (path.includes('Real') ? 4.9 : 5.1);
  assert.equal((await probeVoice('Real', { say, probe })).installed, true);
  assert.equal((await probeVoice('Missing', { say, probe })).installed, false);
});
