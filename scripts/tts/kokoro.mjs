import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sha1 } from '../lib/hash.mjs';

export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const MODELS_DIR = join(homedir(), '.claude', 'plan-review', 'models');
export const CHUNK_CACHE = join(homedir(), '.claude', 'plan-review', 'cache', 'kokoro');
export const GAP_MS = 125;

export function wavBuffer(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

export function wavDuration(path) {
  const buf = readFileSync(path);
  let offset = 12;
  let rate = 0; let channels = 1; let bits = 16;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') { channels = buf.readUInt16LE(offset + 10); rate = buf.readUInt32LE(offset + 12); bits = buf.readUInt16LE(offset + 22); }
    if (id === 'data') return size / (rate * channels * (bits / 8));
    offset += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${path}`);
}

export function joinSamples(parts, rate, gapMs = GAP_MS) {
  const gap = Math.round((rate * gapMs) / 1000);
  const length = parts.reduce((s, p) => s + p.length, 0) + gap * Math.max(0, parts.length - 1);
  const joined = new Float32Array(length);
  let offset = 0;
  parts.forEach((p, i) => { joined.set(p, offset); offset += p.length + (i < parts.length - 1 ? gap : 0); });
  return joined;
}

let modelPromise = null;
async function model() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { KokoroTTS, TextSplitterStream, env } = await import('kokoro-js');
      env.cacheDir = MODELS_DIR;
      mkdirSync(MODELS_DIR, { recursive: true });
      const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'cpu' });
      return { tts, TextSplitterStream };
    })();
  }
  return modelPromise;
}

async function sentenceSamples(tts, TextSplitterStream, text, voice) {
  mkdirSync(CHUNK_CACHE, { recursive: true });
  const splitter = new TextSplitterStream();
  splitter.push(text);
  splitter.close();
  const parts = [];
  let rate = 24000;
  for await (const sentence of splitter) {
    const key = join(CHUNK_CACHE, `${sha1(`${voice}|${sentence}`)}.f32`);
    if (existsSync(key)) {
      const b = readFileSync(key);
      parts.push(new Float32Array(b.buffer, b.byteOffset, b.length / 4));
    } else {
      const audio = await tts.generate(sentence, { voice });
      writeFileSync(key, Buffer.from(audio.audio.buffer, audio.audio.byteOffset, audio.audio.byteLength));
      parts.push(audio.audio);
      rate = audio.sampling_rate;
    }
  }
  return { parts, rate };
}

export const kokoroProvider = {
  name: 'kokoro',
  extension: 'wav',
  concurrency: 1,
  defaultVoice: 'bf_emma',
  async synthesize(path, text, { voice }) {
    const { tts, TextSplitterStream } = await model();
    const { parts, rate } = await sentenceSamples(tts, TextSplitterStream, text, voice);
    writeFileSync(path, wavBuffer(joinSamples(parts, rate), rate));
  },
  duration: async (path) => wavDuration(path),
  async checkVoice(voice) {
    const { tts } = await model();
    const voices = Object.keys(tts.voices ?? {});
    return voices.includes(voice)
      ? { ok: true, detail: `one of ${voices.length} Kokoro voices` }
      : { ok: false, detail: `unknown Kokoro voice; available: ${voices.join(', ')}` };
  },
};
