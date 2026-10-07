import { kokoroProvider } from './kokoro.mjs';
import { sayProvider } from './say.mjs';

export const PROVIDERS = { kokoro: kokoroProvider, say: sayProvider };
export const DEFAULT_TTS = 'kokoro';

const set = (value) => value !== undefined && value !== '';

export function resolveTts(overrides = {}) {
  const name = set(overrides.tts) ? overrides.tts : DEFAULT_TTS;
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`unknown tts provider "${name}"; use one of ${Object.keys(PROVIDERS).join(', ')}`);
  const providerVoice = overrides[`${name}Voice`];
  const voice = set(overrides.voice) ? overrides.voice : set(providerVoice) ? providerVoice : provider.defaultVoice;
  return { provider, voice, rate: set(overrides.rate) ? String(overrides.rate) : '' };
}
