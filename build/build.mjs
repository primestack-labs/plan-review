#!/usr/bin/env node
// Builds the hosted demo into the branch root: narration as AAC under audio/, index.html with the demo transport.
// Usage: node build/build.mjs [--src <main checkout>] [--plan <plan.md>] [--voice <kokoro voice>]
import { execFileSync } from 'node:child_process';
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const mainCheckout = () => join(execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim(), '..');
const src = resolve(opt('--src', mainCheckout()));
const plan = resolve(opt('--plan', join(src, 'samples', '2026-10-08-ledgerline-recurring-billing.md')));
const voice = opt('--voice', 'bf_emma');
const manifest = join(here, 'manifest.json');
const wavDir = join(here, 'audio');
const audioOut = join(root, 'audio');
const page = join(root, 'index.html');
const exists = (p) => access(p).then(() => true, () => false);
const script = (name, ...a) => execFileSync(process.execPath, [join(src, 'scripts', name), ...a], { stdio: 'inherit' });

script('ensure-deps.mjs');
script('validate.mjs', manifest, '--plan', plan);
script('audio.mjs', manifest, '--out', wavDir, '--tts', 'kokoro', '--kokoro-voice', voice, '--say-voice', 'Samantha');

const index = JSON.parse(await readFile(join(wavDir, 'index.json'), 'utf8'));
await mkdir(audioOut, { recursive: true });
const keep = new Set(['index.json']);
for (const entry of Object.values(index)) {
  const file = entry.file.replace(/\.wav$/, '.m4a');
  keep.add(file);
  if (!(await exists(join(audioOut, file)))) execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', join(wavDir, entry.file), join(audioOut, file)]);
  entry.file = file;
}
for (const file of await readdir(audioOut)) if (!keep.has(file)) await rm(join(audioOut, file));
await writeFile(join(audioOut, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

script('render.mjs', manifest, '--audio', join(audioOut, 'index.json'), '--out', page, '--round', '1');

const shim = await readFile(join(here, 'static.js'), 'utf8');
const banner = await readFile(join(here, 'banner.html'), 'utf8');
let html = await readFile(page, 'utf8');
for (const [marker, replacement] of [['<body>\n', `<body>\n${banner}`], ['<script type="module">', `<script>\n${shim}</script>\n<script type="module">`]]) {
  if (!html.includes(marker)) throw new Error(`render output lacks ${JSON.stringify(marker)}`);
  html = html.replace(marker, replacement);
}
await writeFile(page, html);
console.log(`demo: ${Object.keys(index).length} paragraph(s), ${keep.size - 1} audio file(s), ${page}`);
