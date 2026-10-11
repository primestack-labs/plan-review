import { kokoroProvider } from './kokoro.mjs';
import { sayProvider } from './say.mjs';

export const PROVIDERS = { kokoro: kokoroProvider, say: sayProvider };
export const DEFAULT_TTS = 'kokoro';

const set = (value) => value !== undefined && value !== '';

export function resolveTts(overrides = {}, { platform = process.platform } = {}) {
  const name = (set(overrides.tts) ? String(overrides.tts) : DEFAULT_TTS).trim().toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`unknown narration engine "${overrides.tts}"; set it to ${Object.keys(PROVIDERS).join(' or ')}`);
  if (name === 'say' && platform !== 'darwin') throw new Error('the say engine exists only on macOS; set the narration engine to kokoro');
  const providerVoice = overrides[`${name}Voice`];
  const voice = set(overrides.voice) ? overrides.voice : set(providerVoice) ? providerVoice : provider.defaultVoice;
  return { provider, voice, rate: set(overrides.rate) ? String(overrides.rate) : '' };
}
