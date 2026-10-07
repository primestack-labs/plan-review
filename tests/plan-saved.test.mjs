import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planSavedContext } from '../scripts/hooks/plan-saved.mjs';

const write = (file_path, tool_name = 'Write') => JSON.stringify({ hook_event_name: 'PostToolUse', tool_name, tool_input: { file_path, content: '# plan' }, tool_response: 'ok' });

test('a Write to a markdown file inside a plans directory yields the hand-off context', () => {
  const out = planSavedContext(write('/repo/temp/superpowers/plans/2026-10-07-x.md'));
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /plan-review-manifest/);
  assert.match(out.hookSpecificOutput.additionalContext, /\/plan-review \/repo\/temp\/superpowers\/plans\/2026-10-07-x\.md/);
  assert.ok(planSavedContext(write('docs/superpowers/plans/y.md')));
});

test('other paths, other tools and malformed input yield nothing', () => {
  assert.equal(planSavedContext(write('/repo/notes/my-plans.md')), null);
  assert.equal(planSavedContext(write('/repo/plans-notes/x.md')), null);
  assert.equal(planSavedContext(write('/repo/plans/x.txt')), null);
  assert.equal(planSavedContext(write('/repo/plans/sub/x.md')), null);
  assert.equal(planSavedContext(write('/repo/plans/x.md', 'Edit')), null);
  assert.equal(planSavedContext('not json'), null);
  assert.equal(planSavedContext('{}'), null);
});

test('the CLI prints JSON for a plan write and nothing otherwise, exit 0 both times', () => {
  const script = fileURLToPath(new URL('../scripts/hooks/plan-saved.mjs', import.meta.url));
  const hit = spawnSync('node', [script], { input: write('/r/plans/p.md'), encoding: 'utf8' });
  assert.equal(hit.status, 0);
  assert.equal(JSON.parse(hit.stdout).hookSpecificOutput.hookEventName, 'PostToolUse');
  const miss = spawnSync('node', [script], { input: 'garbage', encoding: 'utf8' });
  assert.equal(miss.status, 0);
  assert.equal(miss.stdout, '');
});
