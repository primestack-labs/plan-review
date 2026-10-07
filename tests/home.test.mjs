import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PLAN_REVIEW_HOME } from '../scripts/lib/home.mjs';
import { MODELS_DIR, CHUNK_CACHE } from '../scripts/tts/kokoro.mjs';

test('the plugin home is ~/.claude/plan-review and kokoro paths live under it', () => {
  assert.equal(PLAN_REVIEW_HOME, join(homedir(), '.claude', 'plan-review'));
  assert.equal(MODELS_DIR, join(PLAN_REVIEW_HOME, 'models'));
  assert.equal(CHUNK_CACHE, join(PLAN_REVIEW_HOME, 'cache', 'kokoro'));
});
