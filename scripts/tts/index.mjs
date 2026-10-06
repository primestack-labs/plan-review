import { kokoroProvider } from './kokoro.mjs';
import { sayProvider } from './say.mjs';

export const PROVIDERS = { kokoro: kokoroProvider, say: sayProvider };
export const DEFAULT_TTS = 'kokoro';

export function resolveTts(config = {}, overrides = {}) {
  const name = overrides.tts ?? config.tts ?? DEFAULT_TTS;
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`unknown tts provider "${name}"; use one of ${Object.keys(PROVIDERS).join(', ')}`);
  return {
    provider,
    voice: overrides.voice ?? config.voice ?? provider.defaultVoice,
    rate: overrides.rate ?? config.rate ?? '',
  };
}
