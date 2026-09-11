---
name: plan-review-manifest
description: Fill or refresh the plan-review manifest (the reviewer's projection) for a superpowers implementation plan. Use when /plan-review needs a manifest, right after superpowers:writing-plans saves a plan, or when asked to prepare a plan for review.
---

# Plan review manifest

Input: a plan markdown path and the manifest output path. Output: a manifest that passes `node ~/.claude/skills/plan-review/scripts/validate.mjs <manifest> --plan <plan>`. The schema is `~/.claude/skills/plan-review/schema/manifest.schema.json`; read it before writing.

Read the whole plan first. The manifest is a projection for the **approver**, not the executor: what is built, why, what it exposes, what was decided or assumed, what the UI looks like, what can go wrong. Executor mechanics (steps, commands, commit lines) go verbatim into `executorDetail` and nowhere else.

## Sections

- One `task` section per `###` task heading, `ordinal` = task number, `id` = `t<ordinal>-<slug>` (slug: lowercase, words joined by `-`, at most four words).
- One `preamble` section (`t0-preamble`, ordinal 0) for everything before the first task: goal, spec pointer, prerequisites. Global constraints go to the top-level `constraints` list, not here, as plain prose (the page escapes markdown).
- One `wrapup` section (`t99-wrapup`, ordinal 99) only when material follows the last task.
- `sourceRange`: first and last line of the section in the plan.

## Fields

- `summary`: two to four sentences. What the task builds and why it exists. No file paths, no step narration.
- `changes`: every `Create`/`Modify`/`Test` line as `{ role, path, action }`. `role` names what the file is for ("bridge service", "route permissions test"); `path` verbatim.
- `interfaces`: `Consumes`/`Produces` lines verbatim, one entry per line; a line listing several names becomes one entry per name. A bullet that is neither (`Design exemplars`, `Testing pattern`) is not an interface — it lands in `ui.notes`, `risks` or a decision.
- `decisions` (top level): every "confirm before", "product confirmation", "placeholder", "assumption", "open question", "decide" note anywhere in the plan, ids `d<n>` in document order. A global-constraint line is not a decision, and neither is a placeholder the plan already resolves for the executor (an abbreviated snippet to copy from a named file) — that one is a risk. `kind`: `confirm` when the plan asks for a yes, `assumption` when it states something unverified, `open-question` otherwise. A statement the plan asserts without hedging is a risk, not a decision; `assumption` needs the hedge (assume, should, presumably, expected to). `sectionId`: the section whose work the note governs — the task it names, else the section it sits in (`t0-preamble` when it governs the whole plan). Add `options` when the note offers discrete choices. Each section lists its decisions in `decisionIds`.
- `blocks`: every fenced block in the section, in order, id `<section>-b<n>`, except the run and commit command blocks, which are executor mechanics and stay in `executorDetail`. `kind`: `test` when the file or content is a test, `command` for shell, else `code`. `role`: the file or purpose. `summary`: what it is, what it does, load-bearing details only (a guard, a sentinel, a non-obvious decision), two to four sentences, never line-level mechanics. Tests also get `behaviors`: one line per `it(...)`/`test(...)` title. `source`: the block verbatim.
- `ui`: for a task whose files touch the frontend and whose steps describe layout, one mockup per screen or component, in order, id `<section>-ui<n>`: `html` is a self-contained fragment with inline styles, no scripts, structure and labels only, at the plan's stated viewport (`width` in px; default 360). Greek copy stays Greek.
- `risks`: anything the plan flags as a gotcha, race, manual step, or "without this X 403s".
- `executorDetail`: the section's step list verbatim, markdown, minus the fenced blocks that became `blocks`; the run and commit blocks stay.
- `narration`: spoken paragraphs in card order: summary, interfaces, decisions, ui, risks, one per block. `target` is `summary`, `interfaces`, `decisions`, `risks`, `ui`, or the block id. Ids `<section>-p<n>`. Write for the ear: symbols and abbreviations as words ("returns", "P T three seven three"), hyphenated compounds spaced, file names by basename ("bridge dot j s"), no `[[`. Announce each block: "Code block N, <role>." then its summary. Skip empty fields.
- `taskMap`: one node per task section, `title` a short name of two to four words rather than the full heading; an edge `A → B` whenever a name in A's `produces` appears in B's `consumes`, `label` = the shared names, comma-separated.
- `plan`: `path` relative to the repo root, `title` from the H1, `goal`/`architecture`/`techStack`/`spec` from the header lines. Leave `hash` and every `contentHash` as `""`; `validate.mjs --plan` stamps them.

## Refresh

When the manifest exists and the plan changed: keep every id; rewrite only sections whose plan text changed; add new sections and drop removed ones; re-derive `decisions` and `taskMap`.

## Finish

Run `node ~/.claude/skills/plan-review/scripts/validate.mjs <manifest> --plan <plan>`. Fix every reported path until it prints `valid`.
