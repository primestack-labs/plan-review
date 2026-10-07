import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDeps, loaderPath } from '../scripts/ensure-deps.mjs';

const setup = (npmScript) => {
  const root = mkdtempSync(join(tmpdir(), 'plan-review-deps-'));
  const bundle = join(root, 'bundle');
  mkdirSync(bundle);
  writeFileSync(join(bundle, 'package.json'), '{"dependencies":{"kokoro-js":"1.2.1"}}');
  writeFileSync(join(bundle, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}');
  const npm = join(root, 'npm');
  writeFileSync(npm, `#!/bin/sh\necho "$@" >> "${root}/npm.log"\n${npmScript}\n`);
  chmodSync(npm, 0o755);
  const home = join(root, 'home');
  return { root, bundle, npm, home, calls: () => (existsSync(join(root, 'npm.log')) ? readFileSync(join(root, 'npm.log'), 'utf8').trim().split('\n') : []) };
};

test('installs once with npm ci, writes the loader and the stamp, then is a no-op', () => {
  const t = setup('mkdir -p node_modules/kokoro-js; exit 0');
  const first = ensureDeps({ home: t.home, bundle: t.bundle, npm: t.npm, stdio: 'ignore' });
  assert.equal(first.installed, true);
  assert.equal(first.dir, join(t.home, 'deps'));
  assert.deepEqual(t.calls(), ['ci --omit=dev --no-audit --no-fund']);
  assert.equal(readFileSync(loaderPath(t.home), 'utf8'), "export * from 'kokoro-js';\nexport { env as transformersEnv } from '@huggingface/transformers';\n");
  assert.ok(existsSync(join(t.home, 'deps', '.installed')));
  assert.equal(readFileSync(join(t.home, 'deps', 'package.json'), 'utf8'), '{"dependencies":{"kokoro-js":"1.2.1"}}');
  assert.equal(ensureDeps({ home: t.home, bundle: t.bundle, npm: t.npm, stdio: 'ignore' }).installed, false);
  assert.equal(t.calls().length, 1);
});

test('a changed bundle lockfile reinstalls', () => {
  const t = setup('exit 0');
  ensureDeps({ home: t.home, bundle: t.bundle, npm: t.npm, stdio: 'ignore' });
  writeFileSync(join(t.bundle, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"x":1}}');
  assert.equal(ensureDeps({ home: t.home, bundle: t.bundle, npm: t.npm, stdio: 'ignore' }).installed, true);
  assert.equal(t.calls().length, 2);
});

test('a failing npm leaves no stamp and throws', () => {
  const t = setup('exit 1');
  assert.throws(() => ensureDeps({ home: t.home, bundle: t.bundle, npm: t.npm, stdio: 'ignore' }), /npm ci exited 1/);
  assert.equal(existsSync(join(t.home, 'deps', '.installed')), false);
  assert.equal(existsSync(loaderPath(t.home)), false);
});
