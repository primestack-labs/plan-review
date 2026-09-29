import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runSay, runAfinfo } from './audio.mjs';
import { readConfig } from './lib/config.mjs';

const PROBE = 'The bridge service projects working windows onto the availability grid, and the reviewer listens.';
const BOGUS = 'PlanReviewNoSuchVoice';

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

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const voice = process.argv[2] ?? readConfig().voice;
  if (!voice) {
    console.error('usage: check-voice.mjs [voice]  (defaults to the voice in ~/.claude/plan-review/config.json)');
    process.exit(2);
  }
  const result = await probeVoice(voice);
  if (result.installed) {
    console.log(`voice "${voice}" is installed: ${result.requested.duration.toFixed(2)}s vs ${result.fallback.duration.toFixed(2)}s for the fallback`);
  } else {
    console.error(`voice "${voice}" is NOT installed: say fell back to the system default (identical ${result.requested.duration.toFixed(2)}s, ${result.requested.bytes} bytes). Install it in System Settings > Accessibility > Spoken Content > System Voice > Manage Voices.`);
    process.exit(1);
  }
}
