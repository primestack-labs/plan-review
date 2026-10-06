import { realpathSync } from 'node:fs';
import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sha1 } from './lib/hash.mjs';
import { readConfig } from './lib/config.mjs';
import { resolveTts } from './tts/index.mjs';

export const introSections = (manifest) => [
  { id: 'overview', narration: manifest.narration?.overview ?? [] },
  { id: 'decisions', narration: manifest.narration?.decisions ?? [] },
].filter((s) => s.narration.length);

export function narrationChunks(manifest) {
  return [...introSections(manifest), ...manifest.sections].flatMap((s) => s.narration.map((p) => ({ id: p.id, sectionId: s.id, target: p.target, text: p.text })));
}

export const AUDIO_EXTENSIONS = ['m4a', 'wav'];
export const audioFileName = (providerName, voice, rate, text, extension) => `${sha1(`${providerName}|${voice}|${rate}|${text}`)}.${extension}`;

const exists = (path) => access(path).then(() => true, () => false);

export async function generateAudio(manifest, outDir, { provider, voice = provider.defaultVoice ?? '', rate = '', concurrency = provider.concurrency ?? 1 }) {
  await mkdir(outDir, { recursive: true });
  const chunks = narrationChunks(manifest);
  const index = {};
  const inFlight = new Map();
  let cursor = 0;

  const ensure = (path, text) => {
    if (!inFlight.has(path)) {
      inFlight.set(path, exists(path).then((present) => (present ? undefined : provider.synthesize(path, text, { voice, rate }))));
    }
    return inFlight.get(path);
  };

  const worker = async () => {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor++];
      const file = audioFileName(provider.name, voice, rate, chunk.text, provider.extension);
      const path = join(outDir, file);
      await ensure(path, chunk.text);
      index[chunk.id] = { file, sectionId: chunk.sectionId, duration: await provider.duration(path) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));

  const ordered = Object.fromEntries(chunks.map((c) => [c.id, index[c.id]]));
  await writeFile(join(outDir, 'index.json'), `${JSON.stringify(ordered, null, 2)}\n`);
  await pruneStale(outDir, new Set(Object.values(ordered).map((e) => e.file)));
  return ordered;
}

export async function pruneStale(outDir, keep) {
  let removed = 0;
  for (const name of await readdir(outDir)) {
    if (AUDIO_EXTENSIONS.some((ext) => name.endsWith(`.${ext}`)) && !keep.has(name)) {
      await unlink(join(outDir, name));
      removed++;
    }
  }
  return removed;
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, tts: { type: 'string' }, voice: { type: 'string' }, rate: { type: 'string' } },
  });
  const [manifestPath] = positionals;
  if (!manifestPath || !values.out) {
    console.error('usage: audio.mjs <manifest.json> --out <dir> [--tts kokoro|say] [--voice V] [--rate R]  (defaults from ~/.claude/plan-review/config.json)');
    process.exit(2);
  }
  const { provider, voice, rate } = resolveTts(readConfig(), values);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const index = await generateAudio(manifest, values.out, { provider, voice, rate });
  const total = Object.values(index).reduce((sum, e) => sum + e.duration, 0);
  console.log(`${Object.keys(index).length} paragraph(s), ${Math.round(total / 60)} min of audio in ${values.out}, ${provider.name} voice ${voice || 'system default'}`);
}
