# Redis Cost Reduction — Design Spec

**Date:** 2026-07-31
**Backend:** NestJS (`backend/`), Fly.io deployment (`slackcrm-backend`)

## Goal

Upstash Redis (added earlier this session to fix Bull-queue scheduling, which had silently been failing in production for lack of any Redis at all) burned through its 500K/month command quota in about a day — roughly 146K commands in 24h. Reduce both the actual command volume and remove exposure to per-command billing/limits entirely, without changing any user-facing behavior (WhatsApp follow-ups, meeting reminders, campaign scheduling, token blacklist all keep working exactly as they do today).

## Current State

- 9 separate Bull queues are registered via `BullModule.registerQueue()` across 9 modules: `email`, `data-sync`, `analytics`, `ai`, `webhook`, `workflow` (all in `backend/src/queues/queue.module.ts`), plus `campaign-dispatch`, `whatsapp-followup`, `meeting-reminder` (each in its own small dispatch module).
- Each registered queue name causes Bull (`@nestjs/bull`) to open its own set of Redis connections (client, pub/sub subscriber, blocking client) and run its own periodic maintenance (stalled-job checks, delayed-job promotion polling) — continuously, whether or not that queue ever has a job. Most of these 9 queues are lightly used or idle most of the time; the constant baseline overhead across all 9, 24/7, is the dominant source of command volume — not actual job throughput.
- Redis is currently Upstash (`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` Fly secrets), reached over TLS (added in `app.module.ts`'s `BullModule.forRootAsync` and `auth/token-blacklist/token-blacklist.service.ts`), billed per-command on a monthly quota.
- The backend runs as a single Fly machine (`slackcrm-backend`, one machine, `iad` region) with no attached volume today.

## What's Changing

### 1. Consolidate 9 Bull queues into 2

- **`background-jobs`**: absorbs `email`, `data-sync`, `analytics`, `ai`, `webhook`, `workflow`.
- **`scheduled-tasks`**: absorbs `whatsapp-followup`, `meeting-reminder`, `campaign-dispatch`.

Bull routes jobs within a queue by job-type name (`@Process('job-type-name')`), and every job-type name already in use across these queues is unique (e.g. `send-meeting-reminder`, `send-whatsapp-followup`). So this is a mechanical change: each module's `BullModule.registerQueue({ name: OLD_NAME })` and every `@InjectQueue(OLD_NAME)` / `.add(...)` call site switches to one of the two new shared names. No processor logic changes, no job-type renames, no behavior change to what gets processed or when. `QUEUE_NAMES` in `backend/src/queues/queue.constants.ts` gains `BACKGROUND_JOBS` and `SCHEDULED_TASKS`; the 9 old queue-name constants are removed once nothing references them.

This cuts Bull's idle connection/polling overhead from 9× to 2×.

### 2. Redis moves from Upstash to co-located on the existing Fly machine

- Redis (`redis-server`) runs as a second process inside the same Docker image/machine as the NestJS backend — no new Fly app, no new machine, no new line item on the Fly bill.
- Bound to `127.0.0.1:6379` only — never exposed outside the machine, so no password/TLS is needed (nothing outside the VM can reach it). The existing TLS-enable logic in `app.module.ts` and `token-blacklist.service.ts` already keys off `host !== 'localhost' && host !== '127.0.0.1'` — pointing `REDIS_HOST` at `127.0.0.1` automatically disables the TLS path already built for Upstash, no further code change needed there.
- A small Fly volume (1GB, mounted at `/data/redis`) persists Redis's RDB snapshot across `flyctl deploy` restarts, so pending scheduled jobs (a booked meeting's reminder, an armed WhatsApp follow-up) survive a deploy instead of silently vanishing. Fly volume cost for 1GB is negligible (a small fraction of a dollar per month).
- Dockerfile installs `redis-server`; the container's entrypoint becomes a small script that starts `redis-server --daemonize yes --dir /data/redis --appendonly yes` first, waits for it to be ready, then execs the existing Node start command — so the machine still runs one `CMD`, just with Redis started ahead of the app inside it.
- `fly.toml` gains a `[[mounts]]` block for the volume. `flyctl volumes create` provisions the volume in the same region as the existing machine before the next deploy.
- Fly secrets change: `REDIS_HOST=127.0.0.1`, `REDIS_PORT=6379`, `REDIS_PASSWORD` removed (unset).

### Cutover

- Whatever is currently queued in Upstash (any pending meeting reminders/follow-ups scheduled during today's testing) will not carry over — the switch is a clean cutover, not a migration of in-flight jobs. Given this is still early-stage/low-volume usage, that one-time loss is accepted rather than engineered around.
- Order of operations: create the volume → update `fly.toml` and the Dockerfile/entrypoint → apply the queue-consolidation code change → set the new Redis secrets → deploy → verify Bull connects (clean boot log, no `ECONNREFUSED`/retry-limit warnings) → verify a real scheduled job (e.g. re-trigger the auto-send test flow) actually fires end-to-end.

## Testing

- Unit: none of the consolidation changes touch business logic, so existing processor tests (if any) continue to cover behavior; no new unit tests needed for a queue-name rename.
- Manual, post-deploy: confirm the app boots without Redis connection errors; confirm a `scheduled-tasks` job (WhatsApp follow-up or meeting reminder) and a `background-jobs` job (whichever is easiest to trigger, e.g. an email send) both fire correctly; confirm `redis-cli -h 127.0.0.1 ping` from inside the machine (via `flyctl ssh console`) responds after a deploy, proving the volume persisted data across the restart.

## Out of Scope (YAGNI)

- Migrating in-flight jobs from Upstash to the new Redis (accepted one-time loss, see Cutover).
- Further reducing Bull's per-queue overhead beyond consolidation (e.g. tuning `stalledInterval`) — not needed once down to 2 queues.
- Redis high availability / replication — a single co-located instance matches the single-machine backend's own availability characteristics; if the backend goes down, so does Redis, which is already true of every other piece of this app.
