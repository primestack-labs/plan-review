import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sha1 } from './lib/hash.mjs';

export const introSections = (manifest) => [
  { id: 'overview', narration: manifest.narration?.overview ?? [] },
  { id: 'decisions', narration: manifest.narration?.decisions ?? [] },
].filter((s) => s.narration.length);

export function narrationChunks(manifest) {
  return [...introSections(manifest), ...manifest.sections].flatMap((s) => s.narration.map((p) => ({ id: p.id, sectionId: s.id, target: p.target, text: p.text })));
}

export const audioFileName = (voice, rate, text) => `${sha1(`${voice}|${rate}|${text}`)}.m4a`;

const exists = (path) => access(path).then(() => true, () => false);

export async function generateAudio(manifest, outDir, { voice = '', rate = '', concurrency = 8, say = runSay, probe = runAfinfo } = {}) {
  await mkdir(outDir, { recursive: true });
  const chunks = narrationChunks(manifest);
  const index = {};
  const inFlight = new Map();
  let cursor = 0;

  const ensure = (path, text) => {
    if (!inFlight.has(path)) {
      inFlight.set(path, exists(path).then((present) => (present ? undefined : say(path, text, { voice, rate }))));
    }
    return inFlight.get(path);
  };

  const worker = async () => {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor++];
      const file = audioFileName(voice, rate, chunk.text);
      const path = join(outDir, file);
      await ensure(path, chunk.text);
      index[chunk.id] = { file, sectionId: chunk.sectionId, duration: await probe(path) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));

  const ordered = Object.fromEntries(chunks.map((c) => [c.id, index[c.id]]));
  await writeFile(join(outDir, 'index.json'), `${JSON.stringify(ordered, null, 2)}\n`);
  return ordered;
}

export function runSay(path, text, { voice, rate }) {
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

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, voice: { type: 'string', default: '' }, rate: { type: 'string', default: '' } },
  });
  const [manifestPath] = positionals;
  if (!manifestPath || !values.out) {
    console.error('usage: audio.mjs <manifest.json> --out <dir> [--voice V] [--rate R]');
    process.exit(2);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const index = await generateAudio(manifest, values.out, { voice: values.voice, rate: values.rate });
  const total = Object.values(index).reduce((sum, e) => sum + e.duration, 0);
  console.log(`${Object.keys(index).length} paragraph(s), ${Math.round(total / 60)} min of audio in ${values.out}`);
}
