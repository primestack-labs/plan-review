---
name: plan-review-manifest
description: Fill or refresh the plan-review manifest (the reviewer's projection) for an implementation plan in any markdown shape. Use when /plan-review needs a manifest, right after a plan is saved, or when asked to prepare a plan for review.
---

# Plan review manifest

Input: a plan markdown path and the manifest output path. Output: a manifest that passes `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs <manifest> --plan <plan>`. The schema is `${CLAUDE_PLUGIN_ROOT}/schema/manifest.schema.json`; read it before writing.

Read the whole plan first. The manifest is a projection for the **approver**, not the executor: what is built, why, what it exposes, what was decided or assumed, what the UI looks like, what can go wrong. Executor mechanics (steps, commands, commit lines) go verbatim into `executorDetail` and nowhere else. Every other text field is plain prose: the page escapes markdown, so no backticks, emphasis or links anywhere except `executorDetail` and block `source`.

The plan may be in any markdown shape. The rules below say what each field holds; "Recognised shapes" says where the two common formats keep it. For any other shape apply the same rules to what the plan provides and leave a field empty when the plan has nothing for it. `plan.goal`, `plan.architecture` and `plan.techStack` are the exception: when no header states them, infer each from the body in one or two sentences.

## Sections

- One `task` section per unit of work: the heading the plan treats as a task, phase, milestone or step group, at the lowest heading level that carries its own file list, step list or code. `ordinal` = position in the plan, `id` = `t<ordinal>-<slug>` (slug: lowercase, articles and conjunctions dropped, words joined by `-`, at most four words). `title`: the heading text verbatim.
- One `preamble` section (`t0-preamble`, ordinal 0, title `Context`) for everything before the first task: goal, context, spec pointer, prerequisites. Global constraints go to the top-level `constraints` list, not here.
- One `wrapup` section (`t99-wrapup`, ordinal 99) only when material follows the last task: verification, rollout, open items.
- `sourceRange`: `[first, last]`, from the section's heading line to its last content line before the next heading.

## Fields

- `summary`: two to four sentences. What the task builds and why it exists. No file paths, no step narration.
- `changes`: every file the section creates, modifies or tests, as `{ role, path, action }`: the explicit file list when there is one, plus any file the steps create outside it; else the paths the steps and blocks name. `role` names what the file is for ("bridge service", "route permissions test"); `path` verbatim.
- `interfaces`: what the section depends on (`consumes`) and what it exposes (`produces`): endpoints, functions, events, schema fields, settings. From explicit lines when present, one entry per name (a line that groups several names becomes one entry each); else from the prose and the blocks. A catch-all ("everything earlier tasks produce") lists only the names it spells out. A note that is neither (`Design exemplars`, `Testing pattern`) is not an interface: it lands in `ui.notes`, `risks` or a decision.
- `decisions` (top level): every "confirm before", "product confirmation", "placeholder", "assumption", "open question", "decide", "TBD" note anywhere in the plan, ids `d<n>` in document order. A global-constraint line is not a decision, and neither is a placeholder the plan already resolves for the executor (an abbreviated snippet to copy from a named file) — that one is a risk. `kind`: `confirm` when the plan asks for a yes, `assumption` when it states something unverified, `open-question` otherwise. A statement the plan asserts without hedging is a risk, not a decision; `assumption` needs the hedge (assume, should, presumably, expected to). `sectionId`: the section whose work the note governs — the task it names, else the task whose code uses the setting, else the section it sits in (`t0-preamble` when it governs the whole plan). A note repeated in several places is one decision, ordered by its first occurrence. Add `options` when the note offers named alternatives, including an implicit "X or Y"; a yes/no question gets none. Each section lists its decisions in `decisionIds`.
- `blocks`: every fenced block in the section, in order, id `<section>-b<n>`, except the run-the-tests and commit blocks, which are executor mechanics and stay in `executorDetail`. Any other shell block (setup, tooling, a render that produces a deliverable) is a block of kind `command`. `kind`: `test` when the file or content is a test, `command` for shell, else `code`. `role`: the file or purpose. `summary`: what it is, what it does, load-bearing details only (a guard, a sentinel, a non-obvious decision), two to four sentences, never line-level mechanics. Tests also get `behaviors`: one line per `it(...)`/`test(...)` title, plus the cases the step lists in prose for the same file. A `Testing pattern` note goes into the summary of the test block it describes. `source`: the block verbatim.
- `ui`: for a task whose steps describe a screen, layout or component, one mockup per screen or component, in order, id `<section>-ui<n>`: `html` is a self-contained fragment with inline styles only (no `<style>` rules that could leak into the page), no scripts, structure and labels only; its root element is as wide as `width` (px; the component's own width when the plan states one, else the stated viewport, default 360); `notes` is one string. Copy stays in the plan's language.
- `risks`: anything the plan flags as a gotcha, race, manual step, or "without this X 403s". A wrap-up checklist stays in `executorDetail`; only its flagged items are risks.
- `executorDetail`: from the first step to the end of the section, verbatim markdown, minus the fenced blocks that became `blocks`; the run and commit blocks stay. The file and interface lines are not repeated. For the preamble: its text minus the header lines that became `plan.*` fields.
- `narration`: spoken paragraphs in card order: summary, interfaces, decisions, ui, risks, one per block. `target` is `summary`, `interfaces`, `decisions`, `risks`, `ui`, or the block id. Ids `<section>-p<n>`. One paragraph per target of 40 to 120 words, one per mockup for `ui`; a longer target continues in consecutive paragraphs with the same target. Write for the ear: digits, dates, status codes, routes, symbols and abbreviations as words ("four oh three", "slash api slash invoices", "P T three seven three"), hyphenated compounds spaced, file names by basename ("bridge dot j s"), no `[[`. Announce each block: "Code block N, <role>." then its summary. Skip empty fields.
- `narration` (top level, optional but expected): `overview` paragraphs with `target` `goal`, `architecture`, `techStack`, `taskMap` (ids `overview-p<n>`), spoken before the first section: the goal, the architecture, the stack, then the task map read as "task A feeds B with X"; `decisions` paragraphs, one per decision, `target` = its id (ids `decisions-p<n>`), each read as the kind, the text, and the options if any. Same ear rules as section narration.
- `taskMap`: one node per task section, `title` a short name of two to four words rather than the full heading; an edge `A → B` whenever a name in A's `produces` appears in B's `consumes`, matched on the bare name (function, route, event, column, component) ignoring signatures and qualifiers, `label` = the shared names, comma-separated. When the plan has no interface lists, edges come from stated dependencies ("after phase 1", "uses the endpoint from step 2"), `label` = the thing shared.
- `plan`: `path` as given to the command, `title` from the H1 (else the file name), `goal`/`architecture`/`techStack`/`spec` from header lines when present (`spec` may stay `""`). Leave `hash` and every `contentHash` as `""`; `validate.mjs --plan` stamps them.

## Recognised shapes

- **superpowers writing-plans**: H1 title; bold header lines `**Goal:**`, `**Architecture:**`, `**Tech Stack:**`, `**Spec:**`; `## Global Constraints`; one `### Task N:` heading per task with `**Files:**` (`Create`/`Modify`/`Test` lines), `**Interfaces:**` (`Consumes`/`Produces` lines), checkbox steps with fenced blocks, and run and commit command blocks. Each maps directly onto the field of the same name.
- **Claude Code plan mode** (a file under `~/.claude/plans/`): free headings such as `## Context`, `## Approach`, `## Steps` or `## Implementation`, `## Verification`; files named inline, no interface lists. Everything before the first step-bearing heading is the preamble; each step-bearing heading or numbered phase is a task; a verification or testing section after the last task is the wrapup; interfaces and the task map come from the prose.

## Refresh

When the manifest exists and the plan changed: keep every id; rewrite only sections whose plan text changed; add new sections and drop removed ones; re-derive `decisions` and `taskMap`.

## Finish

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs <manifest> --plan <plan>`. Fix every reported path until it prints `valid`.
