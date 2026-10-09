# plan-review demo

The hosted demo of the [plan-review](https://github.com/primestack-labs/plan-review) plugin: the review page for the `samples/2026-10-08-ledgerline-recurring-billing.md` plan from `main`, served by GitHub Pages at https://primestack-labs.github.io/plan-review/.

Everything demo-related lives on this branch only. `main` carries the plugin.

| Path | What |
|---|---|
| `index.html` | The rendered review page with the demo transport injected |
| `audio/` | Narration as AAC (`.m4a`), one file per paragraph, plus `index.json` |
| `build/build.mjs` | Builds the two above |
| `build/manifest.json` | The sample's manifest, hashes stamped |
| `build/static.js` | Demo transport: draft in localStorage, Submit opens a dialog with the submission JSON |
| `build/banner.html` | The banner above the page and the dialog styles |
| `build/audio/` | Kokoro WAV cache, git-ignored |

## Rebuild

From a worktree of this branch next to a `main` checkout (macOS, for `afconvert`):

```sh
git worktree add ../plan-review-demo gh-pages
cd ../plan-review-demo
node build/build.mjs          # --src <main checkout> --plan <plan.md> --voice <kokoro voice>
git add -A && git commit -m "build: ..." && git push
```

The build validates the manifest against the plan, synthesises any missing paragraph with kokoro into `build/audio/`, converts new WAVs to 64 kbps AAC under `audio/`, drops AAC files no paragraph uses any more, renders the page with the plugin's own scripts and injects the banner and the transport.

When the sample plan changes, update `build/manifest.json` from a real review of it (`~/.claude/plan-review/plan-review/<plan>/manifest.json`) before building.
