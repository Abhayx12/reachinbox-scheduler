# ReachInbox — Email Job Scheduler

A production-shaped email scheduler: Express + TypeScript API, BullMQ/Redis
for delayed job scheduling (no cron), Postgres for durable state, Ethereal
for fake SMTP, Elasticsearch for search, and a Next.js + Tailwind dashboard
with Google login.

## Architecture overview

```
┌────────────┐    schedule campaign     ┌─────────────┐
│  Frontend  │ ───────────────────────▶ │  Express API │
│  (Next.js) │ ◀─────────────────────── │             │
└────────────┘     poll /api/emails     └──────┬──────┘
                                                │ writes row per recipient
                                                ▼
                                         ┌─────────────┐      enqueue(jobId=email.id, delay)
                                         │  Postgres   │◀────────────┐
                                         │  (source of │             │
                                         │   truth)    │             ▼
                                         └──────▲──────┘      ┌─────────────┐
                                                │ read/write   │  BullMQ     │
                                                │ status       │  (Redis)    │
                                         ┌──────┴──────┐      └──────┬──────┘
                                         │   Worker    │◀────────────┘
                                         │ (BullMQ     │  delayed job fires
                                         │  consumer)  │
                                         └──────┬──────┘
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                              Ethereal SMTP  Elasticsearch  Slack webhook
                              (send email)   (index for      (on rate-limit
                                              search)          hit)
```

**Postgres is the single source of truth.** Every scheduled email is a row
in the `emails` table before it's ever touched by BullMQ. A BullMQ delayed
job only ever carries `{ emailId }` — never the email content itself — so
the worker always re-reads current state from Postgres before acting. This
is what makes restarts and idempotency simple to reason about (see below)
instead of relying on BullMQ/Redis as the source of truth, which would be
fragile if Redis were ever flushed.

### How scheduling works

1. `POST /api/schedule` validates the request, creates a `campaigns` row,
   then inserts one `emails` row per recipient with a `scheduled_time`
   staggered by `delayBetweenEmailsMs` starting at `startTime`.
2. After the DB transaction commits, the API calls `enqueueEmailJob(email.id, scheduledTime)`
   for each row, which adds a **BullMQ delayed job** (`queue.add(..., { delay })`).
   No cron, no polling loop — BullMQ's delayed-job mechanism (a Redis sorted
   set keyed by execution time) fires jobs exactly when due.
3. `jobId = email.id` (the Postgres UUID). BullMQ enforces unique job IDs
   per queue, so this single decision gives us:
   - **Idempotency**: re-calling the schedule/enqueue logic for the same
     email can never create a duplicate job.
   - **Easy correlation**: given a BullMQ job, we always know which DB row
     it maps to, and vice versa, with no separate mapping table.

### How persistence on restart is handled

- BullMQ jobs live in Redis, which persists to disk (AOF/RDB) — a plain
  API/worker process restart loses nothing; the worker just reconnects and
  keeps consuming from where it left off.
- The harder edge case — Redis data lost/rebuilt while Postgres survives —
  is handled by a **boot-time reconciliation pass** in `worker.ts`: on
  startup, it scans Postgres for any `emails` row still in
  `scheduled` / `processing` / `rescheduled` status, checks whether a
  matching BullMQ job exists, and re-enqueues it if not. Because `jobId`
  is deterministic (`email.id`), this reconciliation is itself idempotent
  and safe to run on every boot.
- The worker always re-reads the email's `status` from Postgres before
  sending, and no-ops if it's already `sent`. Combined with the above, a
  job firing twice (e.g. a duplicate reconciliation) can never result in a
  duplicate send.

### How rate limiting & concurrency are implemented

**Concurrency** — the BullMQ `Worker` is created with
`concurrency: WORKER_CONCURRENCY` (env-configurable), so up to N jobs run
in parallel. All per-job DB/SMTP work is safe under this because every
write is scoped to that job's own `email.id` row.

**Minimum delay between sends** — implemented via BullMQ's built-in
`limiter: { max: 1, duration: MIN_DELAY_BETWEEN_EMAILS_MS }` option on the
Worker. This throttles how fast the worker *pulls* jobs across all
concurrency slots combined — which is what "minimum delay between
individual sends" actually requires. (A `setTimeout`/sleep inside the job
handler would **not** achieve this once `concurrency > 1`, since multiple
jobs would sleep in parallel rather than being staggered.)

Default: **2000ms minimum between sends** (`MIN_DELAY_BETWEEN_EMAILS_MS=2000`),
configurable via env.

**Emails-per-hour rate limit** — implemented with a Redis counter keyed by
`ratelimit:{senderId}:{YYYY-MM-DDTHH}` (a fixed hour window), incremented
atomically with `INCR` right before a send is attempted:

- `INCR` is a single atomic Redis command, so there's no read-check-write
  race between concurrent workers/instances — this is safe multi-worker
  rate limiting, not an in-memory counter.
- If the increment pushes the count over the configured limit, we `DECR`
  to undo it (keeping the counter accurate) and treat this as "limit hit":
  - The email's `scheduled_time` is updated to the start of the next UTC
    hour, its status is set to `rescheduled`, and it's **re-enqueued under
    the same jobId** with a new delay — so it fires again at the next hour
    boundary. Order is preserved: since all limit-hit emails in a batch
    roll to the same "next hour" instant and are processed by the worker
    in the order BullMQ pulls them, throughput stays close to FIFO.
  - A row is written to `rate_limit_events` for observability/demo purposes.
  - `notifyRateLimitHit()` fires a live Slack message (see below).
- Limit is configurable globally via `MAX_EMAILS_PER_HOUR_PER_SENDER`, and
  the schema/API already support a per-campaign `hourlyLimit` override.

**Trade-off documented**: this is a fixed-window limiter, not a sliding
window or token bucket. It can allow a small burst right at an hour
boundary (e.g. N emails at 12:59:59 and N more at 13:00:01). For an
assignment-scale system this is a well-understood, simple-to-reason-about
trade-off; a sliding-window/token-bucket implementation would be a
reasonable follow-up if stricter smoothing were required.

**Behavior under load (1000+ emails at once)**: nothing changes
structurally — 1000 `emails` rows get inserted in one transaction, 1000
BullMQ delayed jobs get added (BullMQ/Redis comfortably handles this), and
the worker drains them at `concurrency × (1 send per MIN_DELAY)` throughput,
automatically deferring anything beyond the hourly cap to the next window
via the mechanism above. Nothing is dropped or hard-failed for being
over capacity.

### Slack notification on rate-limit hit

- `GET /api/slack/oauth/start` kicks off a real Slack OAuth v2 `authorize`
  flow (`incoming-webhook` + `chat:write` scopes).
- The callback exchanges the code for a token via `oauth.v2.access` and
  stores the resulting webhook URL / bot token against the user in
  `slack_integrations`.
- The moment a sender's hourly limit is hit, the worker calls
  `notifyRateLimitHit()`, which posts directly to the stored webhook (or
  `chat.postMessage` if only a bot token was granted) — a real HTTP call
  in the send path, not a log line.
- If no integration row exists, this is a **silent no-op** (checked fresh
  from Postgres on every call) — no crash, and connecting Slack later
  starts sending notifications immediately with no redeploy needed.

### Idempotency — same email never sent twice

Enforced at two layers:
1. **BullMQ**: `jobId = email.id` — duplicate `queue.add()` calls for the
   same email id are no-ops against an existing job.
2. **Worker**: before sending, it re-reads the row from Postgres and skips
   (no-ops) if `status === 'sent'`. This covers the case where a job
   somehow fires twice (e.g. a manual retry from the Bull-Board UI) even
   after the send already succeeded.

### Live BullMQ dashboard

Bull-Board is mounted at **`/admin/queues`** on the backend
(`http://localhost:4000/admin/queues`), showing real-time job counts,
delayed job schedule, and per-job status/data for the `email-send-queue`.

---

## Features implemented

**Backend**
- [x] Email scheduling API, stored in Postgres (source of truth)
- [x] BullMQ delayed jobs (no cron) for scheduling
- [x] Ethereal SMTP sending, multiple named senders
- [x] Elasticsearch indexing on send (`/api/search`)
- [x] Live Bull-Board queue dashboard
- [x] Restart-safe: boot-time reconciliation + Redis persistence
- [x] Idempotent sends (jobId + status check)
- [x] Configurable worker concurrency
- [x] Configurable minimum delay between sends (BullMQ limiter)
- [x] Redis-backed, multi-worker-safe hourly rate limiting, per sender
- [x] Rate-limited emails rescheduled (not dropped) into next hour window
- [x] Real Slack OAuth + live webhook notification on rate-limit hit,
      with graceful no-op when disconnected
- [x] Google OAuth login, JWT session cookie

**Frontend**
- [x] Google login → redirect to dashboard
- [x] Header with name/email/avatar + logout
- [x] Scheduled / Sent tabs
- [x] Compose modal: subject, body, CSV/text lead upload with detected
      count, start time, delay, hourly limit
- [x] Scheduled table: email, subject, scheduled time, status
- [x] Sent table: email, subject, sent time, status (sent/failed)
- [x] Loading states (skeleton rows) and empty states on both tables
- [x] Slack connect/disconnect widget
- [x] TypeScript throughout, typed API responses/props, reusable components

---

## Setup

### 1. Infrastructure (Redis, Postgres, Elasticsearch)

```bash
docker-compose up -d
```

This starts Redis on `6379`, Postgres on `5432` (db/user/pass all
`reachinbox`), and Elasticsearch on `9200`.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run migrate     # creates tables + seeds senders from SENDERS_JSON
npm run dev          # API on :4000
npm run worker       # in a second terminal — the BullMQ consumer
```

**Ethereal SMTP**: get free test credentials by running:
```bash
node scripts/create-ethereal-account.js
```
Paste the printed `ETHEREAL_SMTP_*` values into `backend/.env`. Sent mail
can be viewed at https://ethereal.email/login with the same credentials
(the worker also logs a `preview:` URL per send).

**Google OAuth**: create an OAuth 2.0 Client ID at
https://console.cloud.google.com/apis/credentials, add
`http://localhost:4000/api/auth/google/callback` as an authorized redirect
URI, and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.

**Slack OAuth**: create an app at https://api.slack.com/apps, add the
`incoming-webhook` and `chat:write` scopes, set the redirect URL to
`http://localhost:4000/api/slack/oauth/callback`, and set
`SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` in `.env`.

### 3. Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > .env.local
npm run dev           # dashboard on :3000
```

Visit `http://localhost:3000`, sign in with Google, and you're in.

---

## Assumptions, shortcuts, trade-offs

- **Senders are static config**, not a full CRUD entity — they're seeded
  from `SENDERS_JSON` in `.env` at migration time. Good enough to
  demonstrate multi-sender rate limiting; a real product would let users
  manage senders in the UI.
- **Ethereal uses one shared SMTP account** across all configured senders
  (the `From:` header differs per sender, not the SMTP login) — Ethereal
  is a single fake catch-all inbox anyway, so this doesn't lose any
  meaningful signal for the demo. Swapping to per-sender Ethereal accounts
  is a small change in `services/mailer.ts` if needed.
- **CSV lead parsing** tries a proper CSV-with-headers parse first, then
  falls back to a regex email scan over the raw file text — this keeps
  the compose flow forgiving of loosely-formatted lead lists.
- **Rate limiting is fixed-window**, not sliding-window/token-bucket (see
  trade-off note above).
- **Slack notification fan-out**: since `senders` aren't tied to a
  specific tenant/user in this schema, a rate-limit hit notifies *every*
  connected Slack integration. A multi-tenant version would scope this to
  the owning tenant.
- **CSV upload size**: leads are parsed in-memory (`multer` memory
  storage) — fine for typical lead-list sizes, would move to streaming
  for very large files.
