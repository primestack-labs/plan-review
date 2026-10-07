import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha1 } from './lib/hash.mjs';
import { PLAN_REVIEW_HOME } from './lib/home.mjs';

export const BUNDLE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'tts', 'kokoro');
export const depsDir = (home = PLAN_REVIEW_HOME) => join(home, 'deps');
export const loaderPath = (home = PLAN_REVIEW_HOME) => join(depsDir(home), 'load-kokoro.mjs');
const LOADER = "export * from 'kokoro-js';\nexport { env as transformersEnv } from '@huggingface/transformers';\n";

export function ensureDeps({ home = PLAN_REVIEW_HOME, bundle = BUNDLE_DIR, npm = 'npm', stdio = 'inherit', spawn = spawnSync, platform = process.platform } = {}) {
  const dir = depsDir(home);
  const stamp = join(dir, '.installed');
  const lock = readFileSync(join(bundle, 'package-lock.json'), 'utf8');
  const expected = sha1(lock);
  if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === expected) return { installed: false, dir };
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(bundle, 'package.json'), join(dir, 'package.json'));
  writeFileSync(join(dir, 'package-lock.json'), lock);
  const result = spawn(npm, ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: dir, stdio, shell: platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ci exited ${result.status} in ${dir}`);
  writeFileSync(loaderPath(home), LOADER);
  writeFileSync(stamp, `${expected}\n`);
  return { installed: true, dir };
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error('plan-review: checking Kokoro packages (about 400 MB on first install)');
  const { installed, dir } = ensureDeps();
  console.log(installed ? `deps: installed in ${dir}` : 'deps: current');
}
