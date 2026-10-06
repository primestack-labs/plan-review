import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROBE = 'The bridge service projects working windows onto the availability grid, and the reviewer listens.';
const BOGUS = 'PlanReviewNoSuchVoice';

export function runSay(path, text, { voice = '', rate = '' } = {}) {
  const partial = path.replace(/\.m4a$/, '.partial.m4a');
  const args = [...(voice ? ['-v', voice] : []), ...(rate ? ['-r', String(rate)] : []), '-o', partial, '--data-format=aac', '-f', '-'];
  return new Promise((resolve, reject) => {
    const child = spawn('say', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(rename(partial, path)) : reject(new Error(`say exited ${code} for ${path}: ${stderr.trim()}`))));
    child.stdin.end(text);
  });
}

export function runAfinfo(path) {
  return new Promise((resolve, reject) => {
    const child = spawn('afinfo', [path], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      const match = stdout.match(/estimated duration: ([\d.]+) sec/);
      if (code === 0 && match) resolve(Number(match[1]));
      else reject(new Error(`afinfo gave no duration for ${path}`));
    });
  });
}

export const sameSynthesis = (a, b) => a.duration === b.duration && a.bytes === b.bytes;

export async function probeVoice(voice, { say = runSay, probe = runAfinfo, dir = mkdtempSync(join(tmpdir(), 'plan-review-voice-')) } = {}) {
  const render = async (name) => {
    const path = join(dir, `${name.replace(/\W+/g, '_')}.m4a`);
    await say(path, PROBE, { voice: name, rate: '' });
    return { duration: await probe(path), bytes: statSync(path).size };
  };
  try {
    const [requested, fallback] = await Promise.all([render(voice), render(BOGUS)]);
    return { installed: !sameSynthesis(requested, fallback), requested, fallback };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const sayProvider = {
  name: 'say',
  extension: 'm4a',
  concurrency: 8,
  defaultVoice: '',
  synthesize: runSay,
  duration: runAfinfo,
  async checkVoice(voice) {
    if (!voice) return { ok: true, detail: 'system default voice' };
    const r = await probeVoice(voice);
    return r.installed
      ? { ok: true, detail: `${r.requested.duration.toFixed(2)}s vs ${r.fallback.duration.toFixed(2)}s for the fallback` }
      : { ok: false, detail: `say fell back to the system default (identical ${r.requested.duration.toFixed(2)}s, ${r.requested.bytes} bytes). Install the voice in System Settings > Accessibility > Spoken Content > System Voice > Manage Voices.` };
  },
};
