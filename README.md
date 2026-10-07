# plan-review

Claude Code plugin: review an implementation plan in the browser instead of reading 2,000 lines of executor detail.

`/plan-review docs/superpowers/plans/<plan>.md` builds a reviewer's projection (goal, interfaces, decisions, UI mockups, risks; code and steps collapsed), narrates it paragraph by paragraph, opens the page, and waits. Approve or comment on each section, resolve the decisions, press Submit; Claude answers every comment, revises the plan, and opens the next round with changed sections badged.

Plans in the [superpowers](https://github.com/obra/superpowers) writing-plans format are supported. When a plan is saved to a `plans/` directory, the plugin reminds Claude to offer a review before execution starts.

## Install

    /plugin marketplace add primestack-labs/plan-review
    /plugin install plan-review@primestack

Claude Code asks for the narration engine and voice when it enables the plugin. Change them later in `/config`, or from a shell (options left out keep their values):

    echo '{"tts":"say","say_voice":"Jamie (Premium)"}' | claude plugin configure plan-review --values-stdin

Requires Node 22 and npm on `PATH`.

| Option | Values | Default |
|---|---|---|
| Narration engine | `kokoro` (CPU, any OS), `say` (macOS system voices) | `kokoro` |
| Kokoro voice | `bf_emma`, `bf_isabella`, `bm_george`, `bm_lewis`, `af_heart`, `am_michael`, 28 in total | `bf_emma` |
| macOS say voice | any name from `say -v '?'` | `Samantha` |

With Kokoro, the first `/plan-review` on a machine installs about 400 MB of packages into `~/.claude/plan-review/deps/` and downloads a 90 MB model into `~/.claude/plan-review/models/`. Generation runs at two to three times real time on a laptop CPU and caches every sentence, so a revision costs only its new sentences. `say` downloads nothing; premium voices are installed in System Settings > Accessibility > Spoken Content.

Check a voice after changing it or after a macOS upgrade (`say` falls back to the compact system voice without an error when a voice is missing):

    node ~/.claude/plugins/cache/primestack/plan-review/<version>/scripts/check-voice.mjs --tts say --say-voice "Jamie (Premium)"

## Per plan

    /plan-review <plan.md> --voice bm_george
    /plan-review <plan.md> --voice "Jamie (Premium)" --rate 180    # engine say

`--voice` overrides the configured voice for that plan and must belong to the configured engine; `--rate` applies to `say`.

## Layout

    commands/plan-review.md        the round loop
    skills/plan-review-manifest    plan → manifest rules
    skills/plan-review-respond     submission → replies, plan edits, next round
    hooks/hooks.json               hand-off after a plan is saved
    schema/                        manifest and submission schemas
    scripts/                       validate, audio, render, serve, diff, ensure-deps
    scripts/tts/kokoro/            pinned Kokoro dependency bundle
    template/                      page.html, page.css, state.mjs, page.js
    tests/                         node --test tests/

Review artifacts live in `~/.claude/plan-review/<repo>/<plan>/`.

## Develop

    git clone https://github.com/primestack-labs/plan-review ~/Projects/plan-review
    cd ~/Projects/plan-review && npm test && npm run validate
    claude --plugin-dir ~/Projects/plan-review

Release: bump `version` in `.claude-plugin/plugin.json` and `package.json`, then `claude plugin tag --push`.

## Licence

MIT
