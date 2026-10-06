# plan-review

Claude Code plugin: review an implementation plan in the browser instead of reading 2,000 lines of executor detail.

`/plan-review docs/superpowers/plans/<plan>.md` builds a reviewer's projection (goal, interfaces, decisions, UI mockups, risks; code and steps collapsed), generates per-paragraph audio with macOS `say`, opens the page, and waits. Approve or comment on each section, resolve the decisions, press Submit; Claude answers every comment, revises the plan, and opens the next round with changed sections badged.

## Install

    git clone <this repo> ~/Projects/plan-review
    ln -s ~/Projects/plan-review ~/.claude/skills/plan-review

    cd ~/Projects/plan-review && npm install

Loads next session as `plan-review@skills-dir`. Requires Node 22. Narration uses Kokoro (bundled through `kokoro-js`, runs on the CPU, about 90MB of model downloaded on first use into `~/.claude/plan-review/models/`) on macOS, Windows and Linux; macOS users can switch to the system `say` voices instead.

To go straight from a saved plan to review, add one line to `~/.claude/CLAUDE.md`: after writing-plans saves a plan, invoke `plan-review-manifest` and offer `/plan-review`.

## Layout

    commands/plan-review.md        the round loop
    skills/plan-review-manifest    plan → manifest rules
    skills/plan-review-respond     submission → replies, plan edits, next round
    schema/                        manifest and submission schemas
    scripts/                       validate, audio, render, serve, diff
    template/                      page.html, page.css, state.mjs, page.js
    tests/                         node --test tests/

Review artifacts live in `~/.claude/plan-review/<repo>/<plan>/`.

## Voice

`~/.claude/plan-review/config.json` selects the engine and voice every generation uses:

    { "tts": "kokoro", "voice": "bf_emma" }

`kokoro` (default) runs locally on any OS; voices include `bf_emma`, `bf_isabella`, `bm_george`, `bm_lewis` (British) and `af_heart`, `am_michael` (American). Paragraphs are synthesised sentence by sentence and joined with a 125 ms pause; sentence audio is cached under `~/.claude/plan-review/cache/kokoro/` so a revision costs only its new sentences.

`say` uses a macOS system voice, e.g. `{ "tts": "say", "voice": "Jamie (Premium)", "rate": "" }`. `say` falls back to the compact system voice without an error when a voice is missing, and macOS upgrades drop downloaded voices.

After editing the config or upgrading macOS run:

    npm run check-voice

For `kokoro` it checks the voice exists in the model; for `say` it synthesises a probe with the configured voice and with a bogus name and fails when the two are identical.
