---
name: plan-review-respond
description: Handle a submitted plan-review round — answer every comment, revise the plan, re-render and reopen the page, or hand off to execution when the plan is approved. Use when /plan-review reports a submission or the user says a review was submitted.
---

# Plan review respond

Input: `rounds/<n>/submission.json`. Beside it: `manifest.json` (the reviewed snapshot). The current manifest and plan path are in `<reviewDir>/manifest.json` (`plan.path`, relative to the repo root).

Paths: `reviewDir` is three directories up from the submission path (`rounds/<n>/submission.json`); `n` is the `rounds/<n>` directory name. Every path used in steps 5 and 6 is absolute under `reviewDir` — write `<reviewDir>/rounds/<n>/replies.json`, not a bare `rounds/<n>/replies.json`, and pass absolute paths to `validate.mjs`, `audio.mjs`, `render.mjs`, and `serve.mjs`.

Apply `superpowers:receiving-code-review`: verify before agreeing, push back with reasons when a request is technically wrong, never accept to please.

1. Read the submission. Summarise to the user in one table: sections by verdict, decisions with their resolutions, comments with type and anchor quote.
2. If `outcome` is `approved`: say so and offer the writing-plans execution choice (subagent-driven or inline). Stop.
3. For each comment, decide `accepted`, `rejected` (with the reason), or `clarified` (the plan is right; explain). An anchor identifies a card region, not a plan offset: locate the plan text via the section's `sourceRange` in `<reviewDir>/manifest.json`, narrowed to the block's `source` when `blockId` is set or the mockup's task when `uiId` is set, and use `quote` only as a hint.
4. Edit the plan for every accepted comment and for every resolved `confirm` decision (the confirmed value replaces its placeholder and the warning note goes away). Keep ids and task numbering stable.
5. Write `<reviewDir>/rounds/<n>/replies.json`: `{ "round": n, "replies": { "<commentId>": { "status": "...", "text": "..." } } }`. Every comment gets a reply.
6. Re-run the loop: `plan-review-manifest` refresh, then from `~/.claude/skills/plan-review/scripts/`: `validate.mjs <reviewDir>/manifest.json --plan <plan>`, `audio.mjs`, `render.mjs ... --round n+1 --previous <reviewDir>/rounds/<n>`, and `serve.mjs --dir <reviewDir> --round n+1` as a background task, exactly as `/plan-review` does. Tell the user what changed and that round n+1 is open. Drafts belong to their round: `draft.json` from round `n` never restores into round `n+1`'s page, so the new round starts from the rendered state (prefilled approvals, resolved decisions), not the previous draft.
7. When that task exits with `submitted: <path>`, run this skill again on the new path.
