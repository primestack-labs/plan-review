const LANGUAGE_SCRIPTS = {
  el: ['Greek'],
  ru: ['Cyrillic'], uk: ['Cyrillic'], bg: ['Cyrillic'], sr: ['Cyrillic'], mk: ['Cyrillic'], kk: ['Cyrillic'],
  he: ['Hebrew'],
  ar: ['Arabic'], fa: ['Arabic'], ur: ['Arabic'],
  ja: ['Hiragana', 'Katakana', 'Han'], zh: ['Han'], ko: ['Hangul', 'Han'],
  hi: ['Devanagari'], mr: ['Devanagari'], ne: ['Devanagari'],
  bn: ['Bengali'], ta: ['Tamil'], te: ['Telugu'], kn: ['Kannada'], th: ['Thai'],
};

export const scriptsFor = (language) => LANGUAGE_SCRIPTS[String(language).toLowerCase().split(/[-_]/)[0]] ?? ['Latin'];

export function foreignWords(text, scripts) {
  const allowed = new RegExp(`^[${scripts.map((s) => `\\p{Script=${s}}`).join('')}\\p{Script=Common}\\p{Script=Inherited}]+$`, 'u');
  const words = String(text).match(/[\p{L}\p{M}]+/gu) ?? [];
  return [...new Set(words.filter((w) => !allowed.test(w)))];
}

export function voiceLanguage(listing, voice) {
  const rows = String(listing).split('\n').map((line) => line.match(/^(.*?)\s+([a-z]{2,3}[_-][A-Za-z]{2,})\s+#/)).filter(Boolean);
  const row = rows.find((m) => m[1] === voice) ?? rows.find((m) => m[1].startsWith(`${voice} (`));
  return row ? row[2] : null;
}
