import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));

test('plugin.json declares the setup options and release metadata', () => {
  const m = json('.claude-plugin/plugin.json');
  assert.equal(m.name, 'plan-review');
  assert.equal(m.version, '1.0.0');
  assert.equal(m.license, 'MIT');
  assert.match(m.homepage, /github\.com\/primestack-labs\/plan-review/);
  assert.deepEqual(Object.keys(m.userConfig), ['tts', 'kokoro_voice', 'say_voice']);
  assert.deepEqual(m.userConfig.tts.options, ['kokoro', 'say']);
  assert.equal(m.userConfig.tts.default, 'kokoro');
  assert.equal(m.userConfig.kokoro_voice.default, 'bf_emma');
  assert.equal(m.userConfig.say_voice.default, 'Samantha');
});

test('marketplace.json publishes this repo as plan-review@primestack', () => {
  const m = json('.claude-plugin/marketplace.json');
  assert.equal(m.name, 'primestack');
  assert.deepEqual(m.plugins.map((p) => [p.name, p.source]), [['plan-review', './']]);
});

test('hooks.json registers the plan-saved hook on Write', () => {
  const h = json('hooks/hooks.json').hooks.PostToolUse;
  assert.equal(h.length, 1);
  assert.equal(h[0].matcher, 'Write');
  assert.deepEqual(h[0].hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/scripts/hooks/plan-saved.mjs']);
});
