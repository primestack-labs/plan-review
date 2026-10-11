#!/usr/bin/env node
// Resolves a plan's review folder and round, so the command needs no shell tooling of its own.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAN_REVIEW_HOME } from './lib/home.mjs';
import { sha1 } from './lib/hash.mjs';
import { validateManifest } from './validate.mjs';

export function repoName(planPath, { exec = execFileSync } = {}) {
  try {
    return basename(exec('git', ['rev-parse', '--show-toplevel'], { cwd: dirname(planPath), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {
    return basename(dirname(planPath));
  }
}

export function manifestState(manifestPath, planText) {
  if (!existsSync(manifestPath)) return 'missing';
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return 'invalid'; }
  if (validateManifest(manifest).length) return 'invalid';
  return manifest.plan?.hash === sha1(planText) ? 'current' : 'stale';
}

export function reviewPaths(planArg, { home = PLAN_REVIEW_HOME, exec } = {}) {
  const planPath = resolve(planArg);
  const planText = readFileSync(planPath, 'utf8');
  const dir = join(home, repoName(planPath, { exec }), basename(planPath, '.md'));
  mkdirSync(dir, { recursive: true });
  const roundsDir = join(dir, 'rounds');
  const rounds = existsSync(roundsDir) ? readdirSync(roundsDir).filter((n) => /^\d+$/.test(n)).length : 0;
  const round = rounds + 1;
  return {
    PLAN_PATH: planPath,
    DIR: dir,
    ROUND: round,
    PREV: round > 1 ? join(roundsDir, String(round - 1)) : '',
    MANIFEST: manifestState(join(dir, 'manifest.json'), planText),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = process.argv[2];
  if (!plan) { console.error('usage: paths.mjs <plan.md>'); process.exit(2); }
  for (const [key, value] of Object.entries(reviewPaths(plan))) console.log(`${key}=${value}`);
}
