# Schedule Builder Plan 2/5 — Availability ↔ Working-Hours Bridge

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The one-directional bridge from working windows to the advertised availability grid — copy action with preview diff, opt-in auto-sync, and the harmful-direction mismatch warning with Ignore/Remove/Add-window actions.

**Architecture:** A pure projection/mismatch service beside the availability content-type (slot boundaries live in exactly one server-side constant; the frontend receives bounds in API payloads, never hardcodes them), three custom availability endpoints (bridge state, copy-from-windows, dismiss-mismatch), a recompute trigger on every working-window write when `working_hours_auto_sync` is on, and availability-page UI: sync toggle, read-only mode, copy-preview modal, per-slot warnings, and a `?prefill=` deep-link into the schedule-settings windows editor.

**Tech Stack:** Strapi 5 (Document Service, core factories), Vitest (`api/tests/unit/schedule`, `frontend/tests/unit/schedule`), Nuxt 3 + PrimeVue 4, `useApi()`.

**Spec:** `docs/superpowers/specs/2026-08-19-schedule-builder-design.md` — this plan implements its «Availability ↔ working hours» section. Plan 1 (foundation) already shipped `user.working_hours_auto_sync`, `availability.mismatch_dismissals`, the `working-window` collection, and the schedule-settings editors this plan deep-links into.

> **⚠️ Product confirmation required before implementation:** the slot
> boundaries are placeholders from the spec — πρωί 06:00–12:00, μεσημέρι
> 12:00–17:00, απόγευμα 17:00–24:00. Confirm or adjust them; they are encoded
> once, in `SLOT_BOUNDS` (Task 1).

## Global Constraints

- Work on branch `feature/pt-373-schedule-builder` (continues from Plan 1's head). Every commit ends with trailer `Refs PT-373`.
- **Docker only**: `docker compose up -d` before any test authoring or run; never build/run on host. Strapi dev auto-reloads on file change — verify boot with `docker logs pt_api --tail 20`; if the watcher raced a multi-file change, `docker restart pt_api`.
- Backend: Document Service keyed by `documentId`; no `entityService`; no `console.*` in `api/src/**` (use `strapi.log`); two-file route convention (core router + `<name>-custom.js`); user-facing error strings in Greek (informal «εσύ»).
- Frontend: plain JS `<script setup>`, PrimeVue semantic tokens (no hex, no `dark:`), `useApi()` for HTTP, Greek UI copy (informal «εσύ»). After style edits: `npm run lint:css:fix` from repo root. UI tasks end with a 320×479 Playwright-MCP screenshot check AND a design-conformance pass against the exemplar page named in the task.
- **No raw dialogs**: modals use a dedicated wrapper following `frontend/components/schedule/AddressManagerModal.vue`'s `:pt` recipe (rounded-lg, blurred mask, width-capped, fullscreen ≤ sm).
- **Slot boundaries live server-side only** (`SLOT_BOUNDS`, Task 1). The frontend never hardcodes 06:00/12:00/17:00 — mismatch payloads carry each slot's `start_time`/`end_time`, and the prefill deep-link passes them through verbatim. **In tests, the boundary values appear in exactly one place**: the `SLOT_BOUNDS` contract test (Task 1). Every other test — reviewers enforce this — derives its fixtures and expectations from `SLOT_BOUNDS`/`minutesToTime`, so a boundary change touches one runtime line, one test assertion, and nothing else.
- **Time strings**: Strapi `time` values as `HH:MM:SS.mmm`; reads may drop the fractional part (`withMs` normalizer in `WorkingWindowsEditor.vue`). The end-of-day sentinel is `23:59:59.999` (renders «24:00»); any time starting `23:59:59` means 24:00 in minute arithmetic.
- **Route permissions are manual** (PT-263 is open): after adding the custom endpoints, enable them for the Teacher (authenticated) role in Strapi admin → Settings → Users & Permissions → Roles (exact grants in Task 2). Without this the routes 403.
- **Mismatch semantics** (from spec): warnings fire only while auto-sync is OFF and only in the harmful direction (advertised slot with zero overlapping window). `all_days_hours: true` advertises all 21 slots. A dismissal stores the slot's current per-day window fingerprint and re-arms when that day's windows change or when the slot is unset and later re-advertised.
- Before "done": `npm run lint:fix` at repo root passes; api suite `docker compose exec -T pt_api npx vitest run tests/unit/schedule` green; frontend suite `docker compose exec -T pt_frontend npx vitest run` green.

---


### Task 1: Bridge service — projection, mismatch detection, recompute

**Files:**
- Create: `api/src/api/availability/services/bridge.js`
- Test: `api/tests/unit/schedule/availability-bridge.test.mjs`

**Interfaces:**
- Produces: `SLOT_BOUNDS`, `SLOT_KEYS`, `slotParts(slot)` → `{ weekday, period }`, `projectWindows(windows)` → 21-boolean object, `weekdayHash(windows, weekday)` → string fingerprint, `detectMismatches(availabilityRow, windows)` → `[{ slot, weekday, start_time, end_time }]`, `getWindows(strapi, userId)`, `getAvailabilityRow(strapi, userId)`, `recompute(strapi, userId)` → written availability row. Tasks 2 and 3 consume all of these.

- [ ] **Step 1: Write the failing tests**

The slot-boundary VALUES appear in exactly one test — the contract test below.
Every other test builds its fixtures and expectations from `SLOT_BOUNDS` /
`minutesToTime`, so they test the overlap logic and survive a boundary change
untouched.


### Task 5: Copy-from-windows flow (preview modal + button)

**Files:**
- Create: `frontend/components/schedule/AvailabilityCopyModal.vue`
- Modify: `frontend/pages/app/profile/availability/index.vue`

**Interfaces:**
- Consumes: `GET /api/availabilities/bridge` (Task 2), `POST /api/availabilities/copy-from-windows` (Task 2), `buildDiff`/`SLOT_KEYS`/`PERIOD_LABELS` (Task 4), `WEEKDAYS` (`frontend/utils/schedule-times.js`).
