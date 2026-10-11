import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewPaths, manifestState } from '../scripts/paths.mjs';

const fixture = new URL('./fixtures/', import.meta.url);
const exec = () => '/repos/acme\n';

test('reviewPaths derives the review folder from the repo and plan names, creates it, and counts rounds', () => {
  const home = mkdtempSync(join(tmpdir(), 'plan-review-home-'));
  const plan = join(home, 'plan.md');
  writeFileSync(plan, '# Plan\n');
  const first = reviewPaths(plan, { home, exec });
  assert.equal(first.DIR, join(home, 'acme', 'plan'));
  assert.equal(first.ROUND, 1);
  assert.equal(first.PREV, '');
  assert.equal(first.MANIFEST, 'missing');
  mkdirSync(join(first.DIR, 'rounds', '1'), { recursive: true });
  mkdirSync(join(first.DIR, 'rounds', '2'), { recursive: true });
  const third = reviewPaths(plan, { home, exec });
  assert.equal(third.ROUND, 3);
  assert.equal(third.PREV, join(first.DIR, 'rounds', '2'));
});

test('manifestState tells missing, invalid, stale and current apart', () => {
  const home = mkdtempSync(join(tmpdir(), 'plan-review-home-'));
  const manifestPath = join(home, 'manifest.json');
  assert.equal(manifestState(manifestPath, 'x'), 'missing');
  writeFileSync(manifestPath, '{not json');
  assert.equal(manifestState(manifestPath, 'x'), 'invalid');
  writeFileSync(manifestPath, '{"plan":{}}');
  assert.equal(manifestState(manifestPath, 'x'), 'invalid');
  const manifest = JSON.parse(readFileSync(new URL('availability-bridge.manifest.json', fixture), 'utf8'));
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.equal(manifestState(manifestPath, 'some other plan text'), 'stale');
});
