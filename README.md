# plan-review

Claude Code plugin: review an implementation plan in the browser instead of reading 2,000 lines of executor detail.

`/plan-review docs/superpowers/plans/<plan>.md` builds a reviewer's projection (goal, interfaces, decisions, UI mockups, risks; code and steps collapsed), generates per-paragraph audio with macOS `say`, opens the page, and waits. Approve or comment on each section, resolve the decisions, press Submit; Claude answers every comment, revises the plan, and opens the next round with changed sections badged.

## Install

    git clone <this repo> ~/Projects/plan-review
    ln -s ~/Projects/plan-review ~/.claude/skills/plan-review

Loads next session as `plan-review@skills-dir`. Requires macOS (`say`, `afinfo`, `open`) and Node 22.

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

`~/.claude/plan-review/config.json` holds the `say` voice and rate every generation uses, e.g. `{ "voice": "Jamie (Premium)" }`. `say` falls back to the compact system voice without an error when a voice is missing, and macOS upgrades drop downloaded voices, so after editing the config or upgrading run:

    npm run check-voice

It synthesises a probe with the configured voice and with a bogus name and fails when the two are identical.
