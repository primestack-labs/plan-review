# The review page

`/plan-review` renders one self-contained HTML page per round and serves it from a local server bound to 127.0.0.1. Everything below is on that page.

## Layout

Top to bottom: a sticky header bar, the overview, the decisions, the global constraints, one card per plan section, and a sticky footer with the Submit button.

### Header bar

- **Title and round.** The plan's H1 and `Round N`.
- **Transport.** Previous section, back 15 seconds, play/pause, forward 15 seconds, next section, and a *Stop at section end* checkbox that pauses playback at every chapter boundary.
- **Theme.** System, light or dark. The choice is kept in a cookie and the task map is redrawn to match.
- **Speed.** 0.8× to 2.0× in steps of 0.1.
- **Now playing and clock.** The chapter being narrated, elapsed and total listening time.
- **Progress bar.** One segment per chapter: `Ov` (overview), `Dec` (decisions), `P` (preamble), `T1`…`Tn` (tasks), `W` (wrap-up). Segment width is proportional to its listening time. The fill shows how far the chapter has been heard; a heard chapter is fully filled. Segments take the colour of the chapter's verdict. Clicking inside a segment seeks to that point of the chapter.
- **Counters.** Approved sections, commented sections, open decisions, and the reading and listening budget for the whole plan (reading time is estimated at 200 words per minute over the summaries, interfaces, risks and block summaries).

### Overview

Goal, architecture, tech stack, spec pointer and plan path, followed by the **task map**: a left-to-right flowchart with one node per task and an edge wherever a task produces an interface another task consumes, labelled with the shared names. Drag to pan, ctrl + wheel or pinch to zoom, *Fit* to frame it, *Fullscreen* to study a big one.

### Decisions needed

Every decision the plan raises, in one place, each with its kind (`confirm`, `assumption`, `open-question`), its text, and a link to the section it governs. A decision with discrete options shows radio buttons; any other takes free text. Every decision needs a resolution before the review can be submitted. In a later round, resolutions from the previous round are prefilled.

### Global constraints

A collapsed list of the rules that apply to the whole plan (branch, commit trailer, tooling, privacy, done criteria).

### Section cards

One card per section of the plan: the preamble, each task, and the wrap-up when the plan has one. The card header has a play button, the title, a `changed since last round` badge when applicable, and the section's own reading and listening budget. The body is split into sub-cards:

| Sub-card | Content |
|---|---|
| Summary | Two to four sentences: what the section builds and why. |
| Changes | A table of files: role, path, action (`create`, `modify`, `test`). |
| Interfaces | What the section consumes and what it produces. |
| Decisions | Links to the decisions this section owns. |
| UI | One mockup per screen or component, drawn at the plan's viewport width and scaled down to fit the card when wider. Click a mockup to open it full size in a lightbox (Esc or the × closes it). Each mockup has a *Comment on this mockup* button. |
| Risks | Gotchas, races, manual steps. |
| Code | One collapsed block per fenced block in the plan. The summary line carries the block's role and a prose explanation of what it does; tests also list their behaviours (one line per test title). Expanding shows the syntax-highlighted source. |
| Executor detail | The plan's step list verbatim, rendered as markdown, collapsed. The reviewer never has to read it. |

Below the sub-cards: comment pins for this round, threads from the previous round, and the verdict footer with *Comment* and *Approve*.

## Narration

The page carries audio for every paragraph of the manifest's narration: the overview (goal, architecture, tech stack, task map), each decision, and for every section the summary, interfaces, decisions, UI, risks and one paragraph per code block.

- Press play in the header to listen from the start, or the play button on any card or chapter label to start there.
- The region being spoken is highlighted and scrolled into view. Scrolling pauses while you have text selected or a comment open, so listening and commenting do not fight.
- A collapsed card expands when its narration starts.
- When the last paragraph of a chapter ends, the chapter is marked heard, which shows in the progress bar and is kept in the draft.
- Speed, 15-second skips and chapter jumps apply to the whole queue; the clock counts across chapters.

Audio is generated once per paragraph and cached by text and voice, so a revised round only synthesises the paragraphs that changed.

## Reviewing

### Approvals

*Approve* on a card toggles its verdict. An approved card collapses to its header; click the header to open or close it again. In a later round, sections that were approved and did not change come back approved and collapsed.

### Comments

- **On a passage.** Select text anywhere inside a card. A popover opens next to the selection; type and press *Add comment*. The comment is anchored to the quote with a short prefix and suffix so it can be found again, and records the code block or mockup it sits in.
- **On a whole section.** Press *Comment* in the card footer without a selection.
- **On a mockup.** Press *Comment on this mockup* in the figure caption.

Comments appear as pins at the bottom of their card, with the quote (or *Section* for section-scoped ones). Click a pin to edit; the quoted passage is re-highlighted. The ‹ › buttons in the popover walk through all comments in document order, saving as they go. × removes a comment; Esc closes the popover.

A comment sets the card's verdict to *commented*. Removing the last comment clears that verdict. A card cannot be submitted as commented without at least one comment.

### Decisions

Resolve each decision in the *Decisions needed* list: pick an option or type the resolution. Open decisions block submission.

### Submitting

The footer lists what still blocks submission: sections without a verdict, open decisions, commented sections without a comment. *Submit review* enables when the list is empty.

The outcome is `approved` when every section is approved and there are no comments, otherwise `changes-requested`. The submission goes to the local server, the page locks, and the terminal session continues with the respond skill.

### Autosave

Every change is saved to a draft on the local server after 400 ms. Reloading the page restores verdicts, resolutions, comments, heard chapters and scroll position. A draft belongs to its round and is not carried into the next one.

## Rounds

When Claude answers a submission it revises the plan, rebuilds the manifest and opens round n+1. On that page:

- Sections whose content changed carry the `changed since last round` badge.
- Sections that were approved and did not change are prefilled as approved and collapsed.
- A section whose comment was rejected or clarified is reopened, so the reply can be read and the verdict given again.
- Each previous comment is shown in its card as a thread: the quote, your comment, and the reply with its status (`accepted`, `rejected`, `clarified`).
- Previous decision resolutions are prefilled.

## Keyboard

| Keys | Action |
|---|---|
| Space | Play or pause |
| Shift + Space | Start the current section over |
| Shift + ← / → | Back or forward 15 seconds |
| Shift + ↑ / ↓ | Previous or next section |
| Alt + ← / → | Slower or faster |
| Esc | Close the comment popover |

Shortcuts are ignored while typing in a field.
