---
description: Review an implementation plan in the browser — reviewer's projection, per-section verdicts, anchored comments, chaptered audio — and continue from the submitted review
argument-hint: <path/to/plan.md> [--voice <voice>] [--rate <wpm>]
allowed-tools: Read, Write, Edit, Bash(node:*), Bash(git:*), Bash(ls:*), Bash(mkdir:*), Bash(open:*), Bash(shasum:*)
---

Run one review round for the plan at `$ARGUMENTS` (first token is the plan path; `--voice` overrides the configured voice for this plan, `--rate` sets words per minute for `say`).

Paths (compute them once, reuse verbatim):

```
PLUGIN=${CLAUDE_PLUGIN_ROOT}
PLAN_PATH=<first token of $ARGUMENTS>
REPO=$(basename "$(git rev-parse --show-toplevel)")
PLAN=$(basename "$PLAN_PATH" .md)
DIR=~/.claude/plan-review/$REPO/$PLAN
ROUND=$(( $(ls "$DIR/rounds" 2>/dev/null | wc -l) + 1 ))
PREV=$DIR/rounds/$((ROUND - 1))      # only when ROUND > 1
VOICE_FLAGS=--tts "${user_config.tts}" --kokoro-voice "${user_config.kokoro_voice}" --say-voice "${user_config.say_voice}"
```

Add `--voice V` and `--rate R` to `VOICE_FLAGS` when given in `$ARGUMENTS`.

0. When `${user_config.tts}` is `kokoro`: `node $PLUGIN/scripts/ensure-deps.mjs`. The first run on a machine installs about 500 MB of packages and prints npm's progress; later runs print `deps: current`. Stop if it fails and show the output.
1. `mkdir -p "$DIR"`.
2. If `$DIR/manifest.json` is missing, or `node $PLUGIN/scripts/validate.mjs "$DIR/manifest.json"` fails, or the plan's sha1 differs from `plan.hash` in the manifest (`shasum "$PLAN_PATH"`): invoke the `plan-review-manifest` skill with the plan path and `$DIR/manifest.json`. It writes the manifest and leaves it valid.
3. `node $PLUGIN/scripts/validate.mjs "$DIR/manifest.json" --plan "$PLAN_PATH"` — must print `valid: N section(s)`.
4. `node $PLUGIN/scripts/audio.mjs "$DIR/manifest.json" --out "$DIR/audio" $VOICE_FLAGS`. Kokoro generation runs at roughly two to three times real time on a laptop CPU, so a 25-minute plan takes about ten minutes the first time and seconds on revisions; the model (about 90 MB) downloads on the first run. The engine and voices are the plugin's setup options: change them in `/config` or with `claude plugin configure plan-review`.
5. `node $PLUGIN/scripts/render.mjs "$DIR/manifest.json" --audio "$DIR/audio/index.json" --out "$DIR/index.html" --round $ROUND` plus `--previous "$PREV"` when `ROUND > 1`.
6. Tell the user the page is opening and that Submit brings the review back here. Run `node $PLUGIN/scripts/serve.mjs --dir "$DIR" --round $ROUND` as a **background** Bash task. Do nothing else while it runs; the task's exit re-invokes you.
7. When the task exits with `submitted: <path>` on stdout, invoke the `plan-review-respond` skill with that path and `$VOICE_FLAGS`. If it exits any other way, show its output and stop.
