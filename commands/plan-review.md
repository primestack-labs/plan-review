---
description: Review an implementation plan in the browser — reviewer's projection, per-section verdicts, anchored comments, chaptered audio — and continue from the submitted review
argument-hint: <path/to/plan.md> [--voice <voice>] [--rate <wpm>]
allowed-tools: Read, Write(~/.claude/plan-review/**), Edit, Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/paths.mjs *), Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure-deps.mjs), Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs *), Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs *), Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs *), Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs *)
---

Run one review round for the plan at `$ARGUMENTS` (first token is the plan path; `--voice` overrides the configured voice for this plan, `--rate` sets words per minute for `say`).

Paths: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/paths.mjs "<first token of $ARGUMENTS>"` once and reuse its lines verbatim. It prints `PLAN_PATH` (absolute), `DIR` (the review folder, created), `ROUND`, `PREV` (the previous round's folder, empty in round 1) and `MANIFEST` (`missing`, `invalid`, `stale` or `current`).

0. When `${user_config.tts}` is `kokoro`: `node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure-deps.mjs`. The first run on a machine installs about 400 MB of packages and prints npm's progress; later runs print `deps: current`. Stop if it fails and show the output.
1. Unless `MANIFEST` is `current`: invoke the `plan-review-manifest` skill with the plan path and `$DIR/manifest.json`. It writes the manifest and leaves it valid.
2. `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs "$DIR/manifest.json" --plan "$PLAN_PATH"` — must print `valid: N section(s)`.
3. `node ${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs "$DIR/manifest.json" --out "$DIR/audio" --tts "${user_config.tts}" --kokoro-voice "${user_config.kokoro_voice}" --say-voice "${user_config.say_voice}"`, appending `--voice V` and `--rate R` when given in `$ARGUMENTS`. Kokoro generation runs at roughly two to three times real time on a laptop CPU, so a 25-minute plan takes about ten minutes the first time and seconds on revisions; the model (about 90 MB) downloads on the first run. The engine and voices are the plugin's setup options: change them in `/config` or with `echo '{"tts":"say"}' | claude plugin configure plan-review --values-stdin`.
4. `node ${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs "$DIR/manifest.json" --audio "$DIR/audio/index.json" --out "$DIR/index.html" --round $ROUND` plus `--previous "$PREV"` when `ROUND > 1`.
5. Tell the user the page is opening and that Submit brings the review back here. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs --dir "$DIR" --round $ROUND` as a **background** Bash task. Do nothing else while it runs; the task's exit re-invokes you.
6. When the task exits with `submitted: <path>` on stdout, invoke the `plan-review-respond` skill with that path and the same audio flags as step 3. If it exits any other way, show its output and stop.
