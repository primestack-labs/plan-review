# How a review works

## One round

`/plan-review <plan.md>` runs one round:

1. **Dependencies.** With the Kokoro engine, `scripts/ensure-deps.mjs` installs the pinned `kokoro-js` bundle into `~/.claude/plan-review/deps/` the first time and prints `deps: current` afterwards.
2. **Manifest.** If `manifest.json` is missing, invalid, or stamped with a different plan hash, Claude invokes the `plan-review-manifest` skill, reads the whole plan and writes the manifest: the reviewer's projection of the plan (see below). `scripts/validate.mjs --plan` checks it against the schema, stamps the plan hash and one content hash per section, and prints `valid: N section(s)`.
3. **Narration.** `scripts/audio.mjs` synthesises one audio file per narration paragraph into `audio/` and writes `audio/index.json` (file, chapter, duration per paragraph).
4. **Page.** `scripts/render.mjs` builds `index.html` from the manifest, the audio index and, from round 2 on, the previous round's submission and replies.
5. **Serve.** `scripts/serve.mjs` serves the page on 127.0.0.1, opens it in the browser, and waits. Claude does nothing until the server exits.
6. **Submit.** The page posts the submission; the server writes it, copies the manifest beside it, prints `submitted: <path>` and exits. Claude invokes the `plan-review-respond` skill.

## Responding

The respond skill:

1. Summarises the submission in one table: sections by verdict, decisions with their resolutions, comments with their anchor quote.
2. If the outcome is `approved`: says so and offers to execute the plan. Done.
3. Otherwise decides each comment: `accepted`, `rejected` (with the reason) or `clarified` (the plan is right; explains). It locates the commented passage through the section's source range in the reviewed manifest, narrowed to the block or mockup the anchor names. It verifies before agreeing and pushes back when a request is technically wrong.
4. Edits the plan for every accepted comment and every resolved `confirm` decision (the confirmed value replaces its placeholder).
5. Writes `rounds/<n>/replies.json`: one reply per comment with status and text.
6. Refreshes the manifest (ids kept, only changed sections rewritten), regenerates audio (cached paragraphs are reused), renders round n+1 with the previous round as reference, serves it, and tells you what changed.
7. When round n+1 is submitted, runs itself again.

Rounds continue until a submission comes back `approved`.

## Files on disk

Everything lives under `~/.claude/plan-review/<repo>/<plan>/`, where `<repo>` is the git top-level directory name and `<plan>` the plan's file name without `.md`:

| Path | What |
|---|---|
| `manifest.json` | The current projection, stamped with the plan hash and per-section content hashes. |
| `audio/*.wav` or `*.m4a` | One file per paragraph, named by a hash of engine, voice, rate and text. |
| `audio/index.json` | Paragraph id → file, chapter, duration. |
| `index.html` | The current round's page. |
| `draft.json` | The page's autosaved state for the current round. |
| `rounds/<n>/submission.json` | What you submitted in round n. |
| `rounds/<n>/manifest.json` | The manifest that round n reviewed. |
| `rounds/<n>/replies.json` | Claude's reply to each comment of round n. |

Other directories under `~/.claude/plan-review/`: `deps/` (the Kokoro packages), `models/` (the Kokoro model), `cache/kokoro/` (synthesised sentences).

## The manifest

The manifest is a projection for the approver, not the executor. Per section it carries a summary, the files changed, the interfaces consumed and produced, the decisions it owns, UI mockups, risks, one entry per code block (role, prose summary, test behaviours, source), the executor detail verbatim, and the narration paragraphs. At the top level: the plan header (title, goal, architecture, tech stack, spec), the global constraints, every decision with its kind and owning section, the task map (nodes and labelled edges), and the overview and decision narration.

Claude writes it by reading the plan; no parser is involved, so the plan can be in any markdown shape. The `plan-review-manifest` skill states the rules per field and how the two common shapes (superpowers writing-plans, Claude Code plan mode) map onto them. The schema is `schema/manifest.schema.json`.

Section ids are stable across rounds (`t0-preamble`, `t<n>-<slug>`, `t99-wrapup`), which is what lets the next round diff content hashes, badge changed sections, carry approvals, and attach threads to the right card.

## The submission

`rounds/<n>/submission.json` (schema `schema/submission.schema.json`):

- `round`, `planHash`, `submittedAt`, `outcome` (`approved` or `changes-requested`).
- `sections`: verdict (`approved` or `commented`) and whether the chapter was heard, per section.
- `decisions`: the resolution per decision.
- `comments`: id, text and anchor. The anchor names the section, the quoted passage with a short prefix and suffix, the scope (`text` or `section`), and the code block or mockup it sits in when applicable.

The server rejects a submission whose round or plan hash does not match the page (the plan changed under the review; rerun `/plan-review`).

## Narration engines

| Engine | Output | Where it runs | Voices |
|---|---|---|---|
| `kokoro` | 24 kHz WAV | CPU, any OS; packages and model downloaded on first use | 28 built in (`bf_emma` default) |
| `say` | AAC in M4A | macOS only, nothing to download | Any installed system voice (`Samantha` default); `--rate` sets words per minute |

Both cache per paragraph. Kokoro also caches per sentence, so a reworded paragraph re-synthesises only its new sentences. Paragraphs no longer in the manifest are pruned from `audio/`.

The engine and voices are the plugin's setup options (`tts`, `kokoro_voice`, `say_voice`), asked for at install time and changeable in `/config` or with `claude plugin configure plan-review --values-stdin`. `/plan-review <plan> --voice V [--rate R]` overrides them for one plan. `scripts/check-voice.mjs` confirms a voice is really installed (macOS `say` silently falls back to the compact system voice otherwise).

## The hand-off hook

The plugin registers a `PostToolUse` hook on the `Write` tool. When Claude writes a file matching `plans/*.md` (the superpowers plans directory, Claude Code's own `~/.claude/plans/`, or any other `plans/` directory), the hook adds a reminder to the conversation: build the manifest and offer `/plan-review <path>` before execution starts. Nothing runs without your say-so.

## Scripts

All under `${CLAUDE_PLUGIN_ROOT}/scripts/` (the plugin cache directory when installed, the checkout when developing):

| Script | Usage |
|---|---|
| `validate.mjs` | `<manifest.json> [--plan <plan.md>]` — schema and cross-reference check; with `--plan`, stamps hashes and rewrites the manifest. |
| `audio.mjs` | `<manifest.json> --out <dir> [--tts kokoro\|say] [--kokoro-voice V] [--say-voice V] [--voice V] [--rate R]` |
| `render.mjs` | `<manifest.json> --out <index.html> [--audio <audio/index.json>] [--previous <rounds/N>] [--round N]` |
| `serve.mjs` | `--dir <reviewDir> --round <n> [--port P] [--no-open]` — exits after a valid submission. |
| `diff.mjs` | `<previous.json> <next.json>` — added, removed, changed and unchanged section ids. |
| `check-voice.mjs` | `--tts say --say-voice "Jamie (Premium)"` |
| `ensure-deps.mjs` | Installs or confirms the Kokoro bundle. |
