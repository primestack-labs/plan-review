import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readConfig } from './lib/config.mjs';
import { resolveTts } from './tts/index.mjs';

export { sameSynthesis, probeVoice } from './tts/say.mjs';

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { provider, voice } = resolveTts(readConfig(), process.argv[2] ? { voice: process.argv[2] } : {});
  const result = await provider.checkVoice(voice);
  if (result.ok) console.log(`${provider.name} voice "${voice || 'system default'}" is available: ${result.detail}`);
  else {
    console.error(`${provider.name} voice "${voice}" is NOT available: ${result.detail}`);
    process.exit(1);
  }
}
