import { redisConnection } from "./connection";
import { env } from "../config/env";

/**
 * Rate limiting design
 * --------------------
 * We keep one counter per (sender, hour-window) in Redis, e.g.
 *   ratelimit:sender1:2026-09-05T14
 * incremented atomically with INCR, with an EXPIRE set only on first
 * creation (NX-guarded) so the key self-cleans ~2 windows later.
 *
 * Using INCR (a single atomic Redis command) instead of "read count, check,
 * write" means this is safe under concurrent workers/instances — there is
 * no read-modify-write race window. Every worker calls tryConsume() right
 * before actually sending; if it returns false, the job is *not* failed —
 * the worker re-enqueues the job as a new delayed job targeting the start
 * of the next hour window (see worker.ts), which is how we "reschedule
 * into the next available hour" without dropping anything.
 *
 * Trade-off: this is a fixed-window limiter (not sliding window/token
 * bucket), which can allow a small burst right at a window boundary. For
 * an assignment-scale system this is an acceptable, well-understood
 * trade-off and is much simpler to reason about and debug than a sliding
 * window; documented here and in the README.
 */

function hourWindowKey(senderId: string, date: Date): string {
  const iso = date.toISOString(); // e.g. 2026-09-05T14:32:10.000Z
  const hourBucket = iso.slice(0, 13); // "2026-09-05T14"
  return `ratelimit:${senderId}:${hourBucket}`;
}

export function currentHourWindowLabel(date: Date): string {
  return date.toISOString().slice(0, 13);
}

export function startOfNextHour(date: Date): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d;
}

export async function getSenderLimit(senderId: string): Promise<number> {
  // Per-sender override could be read from DB/config in a fuller
  // implementation; for now we use the global env default for all senders,
  // which the assignment explicitly allows ("either global or per-sender").
  return env.rateLimit.maxEmailsPerHourPerSender;
}

/**
 * Attempts to atomically consume one slot from the sender's current-hour
 * budget. Returns true if allowed to send now, false if the limit has been
 * hit for this hour window.
 */
export async function tryConsume(
  senderId: string,
  limit: number,
  at: Date = new Date()
): Promise<boolean> {
  const key = hourWindowKey(senderId, at);
  const count = await redisConnection.incr(key);
  if (count === 1) {
    // First hit for this window — set expiry (2h buffer for clock skew).
    await redisConnection.expire(key, 2 * 60 * 60);
  }
  if (count > limit) {
    // Roll back our own increment so we don't permanently overcount past
    // the limit (keeps the counter meaningful for dashboards/metrics).
    await redisConnection.decr(key);
    return false;
  }
  return true;
}

export async function getCurrentCount(
  senderId: string,
  at: Date = new Date()
): Promise<number> {
  const key = hourWindowKey(senderId, at);
  const v = await redisConnection.get(key);
  return v ? parseInt(v, 10) : 0;
}
