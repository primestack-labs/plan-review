const DOTTED_ABBREVIATION = /(?:\b[A-Za-z]\.){2,}$/;
const CLOSERS = /["'»)\]]+$/;
const CLAUSE_SEPARATORS = [/(?<=[;:])\s+/, /(?<=,)\s+/];

export function splitSentences(text) {
  const out = [];
  for (const part of text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?]["'»)\]]*)\s+(?=\S)/)) {
    const prev = out.at(-1);
    if (prev && DOTTED_ABBREVIATION.test(prev.replace(CLOSERS, ''))) out[out.length - 1] = `${prev} ${part}`;
    else out.push(part);
  }
  return out.filter(Boolean);
}

async function pack(text, separators, count, max) {
  const [separator, ...rest] = separators;
  if (!separator) {
    throw new Error(`a narration sentence exceeds the Kokoro limit of ${max} phoneme tokens (${await count(text)}): "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`);
  }
  const parts = text.split(separator);
  const out = [];
  let current = '';
  for (const part of parts) {
    const candidate = current ? `${current} ${part}` : part;
    if (await count(candidate) <= max) {
      current = candidate;
      continue;
    }
    if (current) out.push(current);
    if (await count(part) <= max) {
      current = part;
    } else {
      out.push(...await pack(part, rest, count, max));
      current = '';
    }
  }
  if (current) out.push(current);
  return out;
}

export async function chunksWithin(text, count, max) {
  const out = [];
  for (const sentence of splitSentences(text)) {
    if (await count(sentence) <= max) out.push(sentence);
    else out.push(...await pack(sentence, CLAUSE_SEPARATORS, count, max));
  }
  return out;
}
