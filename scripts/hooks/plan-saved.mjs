import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLAN_FILE = /(^|\/)plans\/[^/]+\.md$/;

export function planSavedContext(input) {
  let event;
  try { event = JSON.parse(input); } catch { return null; }
  const path = event?.tool_input?.file_path;
  if (event?.tool_name !== 'Write' || typeof path !== 'string' || !PLAN_FILE.test(path)) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `A plan was saved at ${path}. Invoke the plan-review-manifest skill on it and offer /plan-review ${path} before the execution choice.`,
    },
  };
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  const out = planSavedContext(input);
  if (out) process.stdout.write(JSON.stringify(out));
}
