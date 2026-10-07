import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveTts } from './tts/index.mjs';

export { sameSynthesis, probeVoice } from './tts/say.mjs';

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { tts: { type: 'string' }, voice: { type: 'string' }, 'kokoro-voice': { type: 'string' }, 'say-voice': { type: 'string' } },
  });
  const { provider, voice } = resolveTts({ tts: values.tts, voice: values.voice, kokoroVoice: values['kokoro-voice'], sayVoice: values['say-voice'] });
  const result = await provider.checkVoice(voice);
  if (result.ok) console.log(`${provider.name} voice "${voice || 'system default'}" is available: ${result.detail}`);
  else {
    console.error(`${provider.name} voice "${voice}" is NOT available: ${result.detail}`);
    process.exit(1);
  }
}
