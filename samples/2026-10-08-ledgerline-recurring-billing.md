# Recurring Billing Plan 2/2 — Schedules, generation, payment links, editor, cash forecast

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the schedules that Plan 1 stores into money: Ledgerline issues each recurring invoice on time and never twice, gives every invoice a card-payment link that marks it paid, lets the owner set up a schedule from the invoice editor on desktop and phone, and shows the next 90 days of expected cash on the dashboard.

**Architecture:** A pure recurrence engine computes occurrences in the schedule's timezone and is the only place calendar rules live. An hourly BullMQ job materialises due invoices behind a database unique index, so a second worker or a retry is a no-op. Payments go out through the existing Tollgate adapter and come back through one signed webhook that records the payment and emits `invoice.paid`. The web side adds the recurrence panel to the invoice editor and a forecast card to the dashboard, both on TanStack Query.

**Tech Stack:** Node 22, Express 5, Knex on PostgreSQL 16, BullMQ on Redis 7, `date-fns-tz`, `zod`, React 19 + Vite + TanStack Query v5 in `web/`, Vitest on both sides, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-14-recurring-billing-design.md`, sections "Recurrence rules", "Generation and idempotency", "Payment links and webhooks", "Editor and mobile UI" and "Cash forecast".

**Position in the series:** Plan 1 delivered the `schedules` table (`id`, `account_id`, `customer_id`, `template_invoice_id` unique, `frequency`, `anchor_day`, `starts_on`, `ends_on`, `max_count`, `skip_weekends`, `timezone`, `status`), the empty recurrence panel shell in the invoice editor behind the `recurring_billing` flag, and the Tollgate adapter (`server/src/payments/tollgate.js`) smoke-tested against the sandbox. This plan makes all three do real work.

**Prerequisites the developer owns:**

1. Tollgate sandbox keys `TOLLGATE_API_KEY` and `TOLLGATE_ACCOUNT_ID` in `server/.env.development`.
2. The webhook secret is a manual step: in the Tollgate dashboard, register `https://<tunnel-host>/api/webhooks/tollgate` for `checkout.completed`, copy the signing secret into `TOLLGATE_WEBHOOK_SECRET`, and repeat for staging and production. Without it every webhook answers 400 and no invoice is ever marked paid by card.
3. Run `npm run perms:grant -- recurring-billing` once per environment after Task 4 lands (tracked under LL-61). Without the grant every new route 403s for real accounts while the tests stay green, because the test harness grants all permissions.

## Global Constraints

- Work on `feature/ll-87-recurring-billing`; every commit carries the `Refs LL-87` trailer as its second `-m`.
- Docker only: migrations and tests run through `docker exec ledgerline_api ...` and `docker exec ledgerline_web ...`; never run Node on the host.
- Server: every route declares a `zod` schema through `validate()`; every query filters by `account_id` from `req.auth.accountId`; no `console.*`; outbound HTTP only through the `undici` client in `server/src/lib/http.js`; errors are `AppError(code, status)` with a stable upper-snake `code`.
- Web: design tokens from `web/src/styles/tokens.css`, the shared `Sheet` recipe for every drawer, `npm run lint:fix` before each commit, and a browser check at 360 px and 1280 px for UI tasks.
- Money is integer cents with the account `currency` alongside, formatted only at render time by `formatMoney(cents, currency)`; dates travel as ISO strings (`yyyy-MM-dd` for calendar dates) and timezone conversion goes through `date-fns-tz` only.
- Before a task is done: its tests pass in Docker, the touched side's full suite passes, and `npm run lint:fix` leaves no diff.

---

### Task 1: Recurrence engine

**Files:**
- Create: `server/src/billing/recurrence.js`
- Test: `server/test/billing/recurrence.test.js`

**Interfaces:**
- Consumes: `schedules` columns `frequency`, `anchor_day`, `starts_on`, `ends_on`, `max_count`, `skip_weekends`, `timezone` (Plan 1)
- Produces: `nextOccurrences(schedule, from, count)` returning `{ nominalOn, issueOn, issueAt }[]`

- [ ] **Step 1: Write the failing tests**

```js
// server/test/billing/recurrence.test.js
import { nextOccurrences } from '../../src/billing/recurrence.js';

const base = { frequency: 'monthly', anchor_day: 1, starts_on: '2026-11-01', ends_on: null, max_count: null, skip_weekends: false, timezone: 'Europe/Lisbon' };
const dates = (s, n, from = new Date('2026-10-08T12:00:00Z')) => nextOccurrences(s, from, n).map((o) => o.nominalOn);
describe('nextOccurrences', () => {
  it('clamps an anchor of 31 to the last day of shorter months', () => {
    expect(dates({ ...base, anchor_day: 31, starts_on: '2027-01-01' }, 3)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });
  it('moves weekend dates back to Friday when skip_weekends is on', () => {
    const [first] = nextOccurrences({ ...base, skip_weekends: true, starts_on: '2026-08-01' }, new Date('2026-07-20T00:00:00Z'), 1);
    expect(first).toMatchObject({ nominalOn: '2026-08-01', issueOn: '2026-07-31' });
  });
  it('issues at 06:00 local time on both sides of a DST change', () => {
    const at = nextOccurrences({ ...base, starts_on: '2026-10-01' }, new Date('2026-09-30T00:00:00Z'), 2).map((o) => o.issueAt);
    expect(at).toEqual(['2026-10-01T05:00:00.000Z', '2026-11-01T06:00:00.000Z']);
  });
});
```

- [ ] **Step 2: Implement the engine**

Calendar arithmetic runs on `yyyy-MM-dd` strings through `Date.UTC`, so the host timezone never leaks in. DST gotcha: adding 24 hours to a UTC instant drifts by an hour twice a year, so the engine derives the local date first and converts 06:00 local wall time once, at the end. Assume Plan 1's `schedules.timezone` always holds a valid IANA name; rows imported by its migration script were never re-validated.

```js
// server/src/billing/recurrence.js
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

const MONTH_STEP = { monthly: 1, quarterly: 3, yearly: 12 };
const parts = (iso) => iso.split('-').map(Number);
const ymd = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay() || 7;
const addDays = (iso, n) => { const [y, m, d] = parts(iso); return ymd(y, m, d + n); };
function candidateAt(s, index) {
  if (s.frequency === 'weekly') return addDays(s.starts_on, ((s.anchor_day - weekday(s.starts_on) + 7) % 7) + index * 7);
  const [y, m] = parts(s.starts_on);
  const mi = m - 1 + index * MONTH_STEP[s.frequency];
  const [year, month] = [y + Math.floor(mi / 12), (mi % 12) + 1];
  return ymd(year, month, Math.min(s.anchor_day, new Date(Date.UTC(year, month, 0)).getUTCDate()));
}
const offWeekend = (iso) => ({ 6: addDays(iso, -1), 7: addDays(iso, -2) })[weekday(iso)] ?? iso;
export function nextOccurrences(schedule, from, count) {
  const today = formatInTimeZone(from, schedule.timezone, 'yyyy-MM-dd');
  const out = [];
  for (let i = 0; out.length < count; i += 1) {
    if (schedule.max_count != null && i >= schedule.max_count) break;
    const nominalOn = candidateAt(schedule, i);
    if (schedule.ends_on && nominalOn > schedule.ends_on) break;
    const issueOn = schedule.skip_weekends ? offWeekend(nominalOn) : nominalOn;
    if (issueOn < today) continue;
    out.push({ nominalOn, issueOn, issueAt: fromZonedTime(`${issueOn}T06:00:00`, schedule.timezone).toISOString() });
  }
  return out;
}
```

Product-confirm before release that `skip_weekends` moves a Saturday or Sunday back to Friday rather than forward to Monday; Friday is implemented because it never pushes an invoice into the next month.

- [ ] **Step 3: Run the tests and commit**

```bash
docker exec ledgerline_api npx vitest run test/billing/recurrence.test.js
```

```bash
git add server/src/billing/recurrence.js server/test/billing/recurrence.test.js
git commit -m "feat(billing): add the recurrence engine" -m "Refs LL-87"
```

### Task 2: Invoice generation job

**Files:**
- Create: `server/migrations/20261008090000_invoice_schedule_period.js`
- Create: `server/src/billing/generate.js`
- Modify: `server/src/jobs/index.js`
- Test: `server/test/billing/generate.test.js`

**Interfaces:**
- Consumes: `nextOccurrences(schedule, from, count)`; existing `allocateInvoiceNumber(trx, accountId)`
- Produces: `invoices.schedule_id`, `invoices.period_key` with unique index `invoices_schedule_period_unique`; `generateForPeriod(db, schedule, occurrence)`; BullMQ job `generate-due-invoices`

- [ ] **Step 1: Migration and failing tests**

The migration adds `invoices.schedule_id` (nullable, references `schedules.id`, `ON DELETE SET NULL`) and `invoices.period_key` (`varchar(10)`, the occurrence's `nominalOn`), with the unique index `invoices_schedule_period_unique` on the pair. That index is the guard against the double-generation race: two workers that pick up the same hourly tick both reach the insert, PostgreSQL lets one row through, and the other insert becomes a no-op.

```js
// server/test/billing/generate.test.js
import { db, resetDb, seedSchedule } from '../support/db.js';
import { generateForPeriod } from '../../src/billing/generate.js';
import { nextOccurrences } from '../../src/billing/recurrence.js';

const first = (s) => nextOccurrences(s, new Date('2026-10-30T00:00:00Z'), 1)[0];
describe('invoice generation', () => {
  let schedule;
  beforeEach(async () => { await resetDb(); schedule = await seedSchedule({ anchor_day: 1, starts_on: '2026-11-01' }); });
  it('copies the template lines into a draft for the period', async () => {
    const { invoice } = await generateForPeriod(db, schedule, first(schedule));
    expect(invoice).toMatchObject({ period_key: '2026-11-01', status: 'draft' });
    expect((await db('invoice_lines').where({ invoice_id: invoice.id })).map((l) => l.amount_cents)).toEqual([120000, 4500]);
  });
  it('creates one invoice when two workers race for the same period', async () => {
    const occ = first(schedule);
    const results = await Promise.all([generateForPeriod(db, schedule, occ), generateForPeriod(db, schedule, occ)]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });
  it('does not burn an invoice number when the period already exists', async () => {
    await generateForPeriod(db, schedule, first(schedule));
    await generateForPeriod(db, schedule, first(schedule));
    expect((await db('accounts').where({ id: schedule.account_id }).first()).next_invoice_number).toBe(2);
  });
});
```

- [ ] **Step 2: Implement generation and register the job**

The invoice number is allocated only after the insert wins, so a losing racer never consumes one.

```js
// server/src/billing/generate.js
import { allocateInvoiceNumber } from '../invoices/numbering.js';

export async function generateForPeriod(db, schedule, occ) {
  return db.transaction(async (trx) => {
    const template = await trx('invoices').where({ id: schedule.template_invoice_id, account_id: schedule.account_id }).first();
    const [invoice] = await trx('invoices')
      .insert({ account_id: schedule.account_id, customer_id: schedule.customer_id, schedule_id: schedule.id,
        period_key: occ.nominalOn, issue_on: occ.issueOn, currency: template.currency, status: 'draft' })
      .onConflict(['schedule_id', 'period_key']).ignore().returning('*');
    if (!invoice) return { created: false };
    const lines = await trx('invoice_lines').where({ invoice_id: template.id }).orderBy('position');
    await trx('invoice_lines').insert(lines.map(({ id, invoice_id, ...line }) => ({ ...line, invoice_id: invoice.id })));
    const number = await allocateInvoiceNumber(trx, schedule.account_id);
    const [numbered] = await trx('invoices').where({ id: invoice.id }).update({ number }).returning('*');
    return { created: true, invoice: numbered };
  });
}
```

`generateDueInvoices(db, now)` in the same file loops over active schedules, takes `nextOccurrences(schedule, now - 7 days, 10)` whose `issueAt` has passed, and calls `generateForPeriod` for each. Register `generate-due-invoices` in `server/src/jobs/index.js` with `{ pattern: '5 * * * *' }`. Product-confirm before release, option A or B: generated invoices (A) stay as drafts for the owner to review and send (implemented), or (B) go out to the customer automatically at 06:00 local. Open question: when a paused schedule is resumed, does it generate the periods it missed while paused, or start from the next future period? The 7-day lookback currently backfills up to a week.

- [ ] **Step 3: Run the tests and commit**

```bash
docker exec ledgerline_api npx knex migrate:latest
docker exec ledgerline_api npx vitest run test/billing
```

```bash
git add server/migrations/20261008090000_invoice_schedule_period.js server/src/billing/generate.js server/src/jobs/index.js server/test/billing/generate.test.js
git commit -m "feat(billing): generate due invoices hourly, once per period" -m "Refs LL-87"
```

### Task 3: Payment links and the Tollgate webhook

**Files:**
- Create: `server/migrations/20261008091000_payment_links.js`
- Create: `server/src/payments/payment-links.js`
- Create: `server/src/routes/webhooks-tollgate.js`
- Modify: `server/src/payments/tollgate.js`
- Modify: `server/src/app.js`
- Test: `server/test/routes/webhooks-tollgate.test.js`

**Interfaces:**
- Consumes: existing `tollgate.createCheckoutSession({ amountCents, currency, reference })`; existing `recordPayment(trx, { invoiceId, amountCents, method, reference })`
- Produces: `createPaymentLink(invoice)`; `POST /api/invoices/:id/payment-link`; `POST /api/webhooks/tollgate`; event `invoice.paid`

- [ ] **Step 1: Links, signature check, migration and failing tests**

The migration creates `payment_links` (`account_id`, `invoice_id`, `tollgate_session_id` unique, `url`, `status`, `expires_at`) and `webhook_events` keyed by `event_id`. `createPaymentLink(invoice)` reuses an open link with more than an hour left, else creates a Tollgate session for `balance_cents`; `POST /api/invoices/:id/payment-link` exposes it. `verifyWebhookSignature(rawBody, header, secret)` in `tollgate.js` compares an HMAC-SHA256 of `"<t>.<rawBody>"` with `timingSafeEqual` and rejects a `t` older than 300 seconds.

```js
// server/test/routes/webhooks-tollgate.test.js
import request from 'supertest';
import { app } from '../../src/app.js';
import { db, resetDb, seedPaymentLink } from '../support/db.js';
import { signTollgateBody } from '../support/tollgate.js';

const post = (s) => request(app).post('/api/webhooks/tollgate').set('Tollgate-Signature', s.signature).type('json').send(s.body);
const paidEvent = (link, id, opts) => signTollgateBody({ id, type: 'checkout.completed', data: { session_id: link.tollgate_session_id, amount_cents: 124500 } }, opts);
describe('POST /api/webhooks/tollgate', () => {
  let link;
  beforeEach(async () => { await resetDb(); link = await seedPaymentLink({ amountCents: 124500 }); });
  it('marks the invoice paid on checkout.completed', async () => {
    await post(paidEvent(link, 'evt_1')).expect(200);
    expect((await db('invoices').where({ id: link.invoice_id }).first()).status).toBe('paid');
  });
  it('records the payment once when the same event is replayed', async () => {
    const signed = paidEvent(link, 'evt_2');
    await post(signed).expect(200);
    await post(signed).expect(200);
    expect(await db('payments').where({ invoice_id: link.invoice_id })).toHaveLength(1);
  });
  it('rejects a correctly signed body older than five minutes', async () => {
    const res = await post(paidEvent(link, 'evt_3', { ageSeconds: 301 }));
    expect([res.status, res.body.code]).toEqual([400, 'WEBHOOK_SIGNATURE_INVALID']);
  });
});
```

- [ ] **Step 2: The webhook endpoint**

The `webhook_events` primary key is the replay guard. Tollgate presumably retries a failed delivery for up to 72 hours, and a captured signed body can be resent inside the 300-second window; either way the second insert is ignored and the handler answers 200 without touching the invoice.

```js
// server/src/routes/webhooks-tollgate.js
import { Router, raw } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { verifyWebhookSignature } from '../payments/tollgate.js';
import { recordPayment } from '../payments/record-payment.js';
import { bus } from '../events/bus.js';
import { AppError } from '../lib/errors.js';
import { config } from '../config.js';

const eventSchema = z.object({ id: z.string(), type: z.literal('checkout.completed'),
  data: z.object({ session_id: z.string(), amount_cents: z.number().int().nonnegative() }) });
export const tollgateWebhook = Router();
tollgateWebhook.post('/api/webhooks/tollgate', raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body.toString('utf8');
  if (!verifyWebhookSignature(rawBody, req.get('Tollgate-Signature'), config.tollgate.webhookSecret)) throw new AppError('WEBHOOK_SIGNATURE_INVALID', 400);
  const event = eventSchema.parse(JSON.parse(rawBody));
  const link = await db.transaction(async (trx) => {
    const fresh = await trx('webhook_events').insert({ event_id: event.id }).onConflict('event_id').ignore().returning('event_id');
    if (fresh.length === 0) return null;
    const row = await trx('payment_links').where({ tollgate_session_id: event.data.session_id }).forUpdate().first();
    if (!row) throw new AppError('PAYMENT_LINK_NOT_FOUND', 404);
    await trx('payment_links').where({ id: row.id }).update({ status: 'completed' });
    await recordPayment(trx, { invoiceId: row.invoice_id, amountCents: event.data.amount_cents, method: 'tollgate', reference: event.data.session_id });
    return row;
  });
  if (link) bus.emit('invoice.paid', { invoiceId: link.invoice_id, accountId: link.account_id });
  res.json({ received: true });
});
```

Mount it in `server/src/app.js` before `express.json()` so the raw body reaches the signature check.

- [ ] **Step 3: Run the tests and commit**

```bash
docker exec ledgerline_api npx knex migrate:latest
docker exec ledgerline_api npx vitest run test/routes/webhooks-tollgate.test.js
```

```bash
git add server/migrations/20261008091000_payment_links.js server/src/payments server/src/routes/webhooks-tollgate.js server/src/app.js server/test/routes/webhooks-tollgate.test.js
git commit -m "feat(payments): add Tollgate payment links and the signed webhook" -m "Refs LL-87"
```

### Task 4: Recurrence panel and mobile schedule summary

**Files:**
- Create: `server/src/routes/schedules.js`
- Create: `web/src/invoices/recurrence/RecurrencePanel.jsx`
- Create: `web/src/invoices/recurrence/ScheduleSummary.jsx`
- Create: `web/src/invoices/recurrence/useSchedule.js`
- Create: `web/src/invoices/recurrence/describeSchedule.js`
- Modify: `web/src/invoices/InvoiceEditor.jsx`
- Modify: `server/src/auth/permissions.js`

**Interfaces:**
- Consumes: `nextOccurrences(schedule, from, count)`; the `Sheet` component; Plan 1's panel slot in the editor
- Produces: `GET` and `PUT /api/invoices/:invoiceId/schedule`; `POST /api/schedules/preview`; `useSchedule(invoiceId)`; `describeSchedule(schedule)`; `<RecurrencePanel>`; `<ScheduleSummary>`

**Design exemplars:** `web/src/customers/CustomerPanel.jsx` for the sidebar card anatomy and `web/src/payments/RecordPaymentSheet.jsx` for a form inside the `Sheet` recipe.

- [ ] **Step 1: Schedule endpoints and hook**

`server/src/routes/schedules.js` validates the body with a `zod` schema mirroring Plan 1's columns (weekly anchors 1–7, an end date and a count mutually exclusive). `GET` and `PUT /api/invoices/:invoiceId/schedule` return `{ schedule, upcoming: nextOccurrences(schedule, new Date(), 3) }`; `PUT` upserts on `template_invoice_id`. `POST /api/schedules/preview` returns `upcoming` for an unsaved draft. Add `schedules:read` (owner, bookkeeper) and `schedules:write` (owner) to `permissions.js`. `useSchedule.js` exports `useSchedule(invoiceId)` (the `GET` plus a `PUT` mutation that refreshes `['schedule', invoiceId]` and `['forecast']`), `usePreview(draft)` and `defaultSchedule()`; `describeSchedule(schedule)` builds the sentence both views show. Open question: can a bookkeeper pause and resume a schedule without being able to edit it? Today pausing is a `PUT` and needs `schedules:write`.

- [ ] **Step 2: The panel at 1280 px**

At 1280 px the editor has line items on the left (about 840 px) and a 360 px sidebar; the panel is the third sidebar card, under "Customer" and "Payment".
- Header row: repeat icon, "Repeat this invoice", an on/off switch right-aligned. Off: a muted line "Send this invoice on a schedule."
- On, top to bottom: a summary sentence on a tinted strip ("Monthly on the 1st, starting Nov 1, 2026, until cancelled"); a full-width segmented control "Weekly | Monthly | Quarterly | Yearly"; "On" select and "Starts" date side by side; an "Ends" radio group ("Never", "On <date>", "After <n> invoices"); a "Move weekend dates to Friday" checkbox.
- "Next 3 invoices": three rows, issue date left and template total right; a weekend-shifted row adds a muted "moved from Sat".
- Footer: "Pause" ghost button left (saved schedules only), "Save schedule" primary right.

```jsx
// web/src/invoices/recurrence/RecurrencePanel.jsx
import { useEffect, useState } from 'react';
import { useSchedule, usePreview, defaultSchedule } from './useSchedule.js';
import { describeSchedule } from './describeSchedule.js';
import { formatMoney } from '../../lib/money.js';

const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'];
export function RecurrenceForm({ invoiceId, total, onSaved }) {
  const { data, save } = useSchedule(invoiceId);
  const [draft, setDraft] = useState(null);
  useEffect(() => setDraft(data?.schedule ?? defaultSchedule()), [data]);
  const preview = usePreview(draft);
  if (!draft) return null;
  return (
    <form className="recurrence" onSubmit={(e) => { e.preventDefault(); save.mutate(draft, { onSuccess: onSaved }); }}>
      <p className="recurrence__summary">{describeSchedule(draft)}</p>
      <div className="segmented" role="radiogroup" aria-label="Frequency">
        {FREQUENCIES.map((f) => <button key={f} type="button" role="radio" aria-checked={draft.frequency === f}
          onClick={() => setDraft({ ...draft, frequency: f, anchor_day: 1 })}>{f[0].toUpperCase() + f.slice(1)}</button>)}
      </div>
      {/* "On", "Starts", "Ends", the weekend checkbox and the "Pause" button: copy the field markup from web/src/settings/AccountForm.jsx. */}
      <section aria-label="Next 3 invoices">
        {preview.data?.upcoming.map((o) => (
          <div key={o.nominalOn} className="recurrence__row">
            <span>{o.issueOn}{o.issueOn !== o.nominalOn && <small className="muted"> moved from {o.nominalOn}</small>}</span>
            <span className="tabular">{formatMoney(total.cents, total.currency)}</span>
          </div>))}
      </section>
      <button type="submit" className="btn btn--primary" disabled={save.isPending}>Save schedule</button>
    </form>
  );
}
```

`RecurrencePanel` wraps `RecurrenceForm` in the sidebar card with the header switch.

- [ ] **Step 3: The summary at 360 px**

Below 768 px the editor stacks into one column. The recurrence card becomes one tappable 72 px row inside 16 px gutters: repeat icon left; the summary sentence clamped to two lines with a "Next: Mon, Nov 2" chip under it; an "Active" (green) or "Paused" (grey) pill and a chevron on the right. Tapping opens a bottom `Sheet` at 90 % height titled "Repeat this invoice" with the same form in one column and "Save schedule" full width in a sticky footer.

```jsx
// web/src/invoices/recurrence/ScheduleSummary.jsx
import { useState } from 'react';
import { Sheet } from '../../components/Sheet.jsx';
import { useSchedule } from './useSchedule.js';
import { describeSchedule } from './describeSchedule.js';
import { RecurrenceForm } from './RecurrencePanel.jsx';

export function ScheduleSummary({ invoiceId, total }) {
  const { data } = useSchedule(invoiceId);
  const [open, setOpen] = useState(false);
  const schedule = data?.schedule;
  return (
    <>
      <button type="button" className="schedule-summary" onClick={() => setOpen(true)}>
        <span className="schedule-summary__text">
          {schedule ? describeSchedule(schedule) : 'Repeat this invoice'}
          {data?.upcoming?.[0] && <span className="chip">Next: {data.upcoming[0].issueOn}</span>}
        </span>
        <span className={`pill pill--${schedule?.status === 'active' ? 'success' : 'neutral'}`}>{schedule?.status === 'active' ? 'Active' : schedule ? 'Paused' : 'Off'}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Repeat this invoice" height="90vh">
        <RecurrenceForm invoiceId={invoiceId} total={total} onSaved={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
```

`InvoiceEditor.jsx` renders `RecurrencePanel` at 768 px and up, `ScheduleSummary` below; check both widths in the browser.

- [ ] **Step 4: Run the tests and commit**

```bash
docker exec ledgerline_api npx vitest run test/routes
docker exec ledgerline_web npx vitest run src/invoices
```

```bash
git add server/src/routes/schedules.js server/src/auth/permissions.js web/src/invoices
git commit -m "feat(invoices): add the recurrence panel and the mobile schedule summary" -m "Refs LL-87"
```

### Task 5: Cash forecast card

**Files:**
- Create: `server/src/billing/forecast.js`
- Create: `server/src/routes/forecast.js`
- Create: `web/src/dashboard/CashForecastCard.jsx`
- Modify: `web/src/dashboard/Dashboard.jsx`

**Interfaces:**
- Consumes: `nextOccurrences(schedule, from, count)`; `invoices.schedule_id`; event `invoice.paid`
- Produces: `buildForecast(db, accountId, from, days)`; `GET /api/forecast?days=90`; `<CashForecastCard>`

- [ ] **Step 1: Forecast service**

Open invoices land in the week of their `due_on`; drafts with a `schedule_id` count as open; future occurrences land in the week of `issueOn + payment_terms_days`. `GET /api/forecast` caches the result per account for an hour and drops the cache on `invoice.paid`.

```js
// server/src/billing/forecast.js
import { nextOccurrences } from './recurrence.js';

const plusDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export async function buildForecast(db, accountId, from, days) {
  const [start, end] = [from.toISOString().slice(0, 10), plusDays(from.toISOString().slice(0, 10), days)];
  const weeks = Array.from({ length: Math.ceil(days / 7) }, (_, i) => ({ weekOf: plusDays(start, i * 7), openCents: 0, scheduledCents: 0 }));
  const bucket = (iso) => weeks[Math.max(0, Math.floor((Date.parse(iso) - Date.parse(start)) / (7 * 86400000)))];
  const open = await db('invoices').where({ account_id: accountId }).andWhere('due_on', '<', end)
    .andWhere((q) => q.whereIn('status', ['sent', 'overdue']).orWhere((d) => d.where('status', 'draft').whereNotNull('schedule_id')));
  for (const inv of open) bucket(inv.due_on).openCents += inv.balance_cents;
  const schedules = await db('schedules as s').join('invoices as t', 't.id', 's.template_invoice_id')
    .where({ 's.account_id': accountId, 's.status': 'active' }).select('s.*', 't.total_cents', 't.payment_terms_days');
  for (const s of schedules) {
    for (const o of nextOccurrences(s, from, 60).filter((x) => x.issueAt > from.toISOString())) {
      const expectedOn = plusDays(o.issueOn, s.payment_terms_days);
      if (expectedOn >= end) break;
      bucket(expectedOn).scheduledCents += s.total_cents;
    }
  }
  return { weeks, totalCents: weeks.reduce((sum, w) => sum + w.openCents + w.scheduledCents, 0) };
}
```

- [ ] **Step 2: The card at 1280 px**

The dashboard at 1280 px is a grid; the forecast card is about 720 px wide, in the first row beside the existing "Outstanding" card, not full width.
- Header row: "Cash forecast" with a muted "next 90 days" on the left; the total on the right in large tabular figures over a muted "expected".
- Legend: "Open invoices" (solid) and "Scheduled" (lighter tint of the same hue).
- Chart, 200 px tall: thirteen stacked weekly bars, open at the bottom; week-start labels ("Oct 12") under every other bar; hovering a bar shows the week and both amounts.
- Footer: three tiles, "Next 30 days", "31–60 days", "61–90 days".
- Empty state: "No expected income yet." with a "Set up a recurring invoice" link.

`CashForecastCard` queries `['forecast', 90]` and draws the bars as one SVG `<g>` per week holding two `<rect>`s scaled to the busiest week, with a `<title>` for the hover text. Header, legend, tiles and empty state: copy the markup of `web/src/dashboard/OutstandingCard.jsx`. Add the card to `Dashboard.jsx` behind the `recurring_billing` flag; at 360 px it takes the full column and the tiles stack.

- [ ] **Step 3: Run the tests and commit**

```bash
docker exec ledgerline_api npx vitest run test/billing
docker exec ledgerline_web npx vitest run src/dashboard
```

```bash
git add server/src/billing/forecast.js web/src/dashboard
git commit -m "feat(dashboard): add the 90-day cash forecast card" -m "Refs LL-87"
```

## Verification and hand-over

- Run both full suites in Docker: `docker exec ledgerline_api npx vitest run` and `docker exec ledgerline_web npx vitest run`, after `npx knex migrate:rollback --all` and `migrate:latest` to prove the migrations round-trip.
- Run `npm run lint:fix` at the repository root and review any diff it leaves.
- Open an invoice at 1280 px and at 360 px and save a monthly schedule from each layout; the dashboard forecast shows the new schedule's bars.
- On the dev stack, scale to two workers (`docker compose up -d --scale ledgerline_worker=2`) and check that one weekly schedule starting today yields exactly one invoice after the next tick.
- Pay that invoice through its Tollgate link, then resend the same event from the Tollgate dashboard and check that one payment row exists.
- Set the account timezone to `Europe/Lisbon` and check that the 2026-10-25 DST change leaves the issue time at 06:00 local.
- Run `npm run perms:grant -- recurring-billing` against staging (LL-61) and sign in as a real bookkeeper: the schedule and forecast endpoints answer 200, not 403.
- Push the branch and open the merge request with `glab mr create --target-branch main --title "Recurring billing (LL-87)"`, its description closing LL-87 and listing the items still awaiting product sign-off.
