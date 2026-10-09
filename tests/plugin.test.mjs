import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));

test('plugin.json declares the setup options and release metadata', () => {
  const m = json('.claude-plugin/plugin.json');
  assert.equal(m.name, 'plan-review');
  assert.equal(m.version, '1.2.0');
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

test('command and skills address the plugin through CLAUDE_PLUGIN_ROOT and pass the setup options', () => {
  const texts = ['commands/plan-review.md', 'skills/plan-review-manifest/SKILL.md', 'skills/plan-review-respond/SKILL.md'].map(read);
  for (const t of texts) {
    assert.ok(!t.includes('.claude/skills'), 'no skills-dir path');
    assert.ok(t.includes('${CLAUDE_PLUGIN_ROOT}'), 'plugin root used');
  }
  const command = texts[0];
  assert.ok(command.includes('ensure-deps.mjs'));
  for (const key of ['tts', 'kokoro_voice', 'say_voice']) assert.ok(command.includes(`\${user_config.${key}}`), key);
  assert.ok(texts[2].includes('${user_config.tts}'), 'respond passes the engine');
});

test('the command spells the audio flags out instead of a shell variable', () => {
  const command = read('commands/plan-review.md');
  assert.ok(!command.includes('VOICE_FLAGS'));
  assert.ok(command.includes('--tts "${user_config.tts}" --kokoro-voice "${user_config.kokoro_voice}" --say-voice "${user_config.say_voice}"'));
  assert.ok(!command.includes('with `claude plugin configure plan-review`'), 'configure needs --values-stdin');
});

test('the skills do not require the superpowers plan format', () => {
  const manifest = read('skills/plan-review-manifest/SKILL.md');
  assert.ok(!manifest.includes('for a superpowers implementation plan'));
  assert.ok(manifest.includes('## Recognised shapes'));
  assert.ok(manifest.includes('Claude Code plan mode'));
  const respond = read('skills/plan-review-respond/SKILL.md');
  assert.ok(!respond.includes('superpowers:receiving-code-review'));
  assert.ok(!respond.includes('writing-plans execution choice'));
  assert.ok(existsSync(new URL('../samples/2026-10-07-api-rate-limiting.md', import.meta.url)));
});
