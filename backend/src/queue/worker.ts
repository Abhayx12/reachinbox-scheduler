import { Worker, Job, DelayedError } from "bullmq";
import { redisConnection, QUEUE_NAME } from "./connection";
import { pool } from "../db/pool";
import { env } from "../config/env";
import { sendEmail } from "../services/mailer";
import { indexEmail } from "../services/search";
import {
  tryConsume,
  getSenderLimit,
  startOfNextHour,
  currentHourWindowLabel,
} from "./rateLimiter";
import { notifyRateLimitHit } from "../services/slackNotify";

interface EmailJobData {
  emailId: string;
}

/**
 * Concurrency: configurable via WORKER_CONCURRENCY. BullMQ's Worker will
 * pull up to N jobs in parallel from the queue automatically.
 *
 * Min delay between sends: BullMQ's `limiter` option throttles how many
 * jobs the *worker* pulls per unit time across ALL concurrent slots, which
 * is exactly "minimum delay between individual email sends" — it's a
 * queue-wide throttle, not per-job sleep (a per-job sleep would NOT
 * actually space out sends when concurrency > 1).
 */
const worker = new Worker<EmailJobData>(
  QUEUE_NAME,
  async (job: Job<EmailJobData>, token?: string) => {
    const { emailId } = job.data;

    // --- Idempotency + restart-safety -----------------------------------
    // Always re-read current state from Postgres, the single source of
    // truth, rather than trusting anything cached in the job payload. If
    // this row is already "sent", a duplicate/replayed job is a safe no-op.
    const { rows } = await pool.query( `SELECT e.*, s.name as sender_name, s.email as sender_email, c.hourly_limit as campaign_hourly_limit FROM emails e JOIN senders s ON s.id = e.sender_id LEFT JOIN campaigns c ON c.id = e.campaign_id WHERE e.id = $1`, [emailId] );
    const email = rows[0];
    if (!email) {
      console.warn(`Job ${job.id}: email ${emailId} no longer exists, skipping.`);
      return;
    }
    if (email.status === "sent") {
      console.log(`Job ${job.id}: email ${emailId} already sent, skipping (idempotent).`);
      return;
    }

    // --- Rate limiting -----------------------------------------------------
    const limit = email.campaign_hourly_limit ?? (await getSenderLimit(email.sender_id));
    const allowed = await tryConsume(email.sender_id, limit);
    if (!allowed) {
      const nextWindow = startOfNextHour(new Date());
      console.log(
        `Sender ${email.sender_id} hit hourly limit (${limit}); rescheduling ${emailId} to ${nextWindow.toISOString()}`
      );

      await pool.query(
        `UPDATE emails SET status = 'rescheduled', scheduled_time = $2, updated_at = now() WHERE id = $1`,
        [emailId, nextWindow]
      );
      await pool.query(
        `INSERT INTO rate_limit_events (sender_id, email_id, hour_window, rescheduled_to)
         VALUES ($1, $2, $3, $4)`,
        [email.sender_id, emailId, currentHourWindowLabel(new Date()), nextWindow]
      );

      await notifyRateLimitHit(email.sender_id, limit);

      if (token) {
        await job.moveToDelayed(nextWindow.getTime(), token);
      }
      throw new DelayedError();
    }

    // --- Mark processing (helps observability + detect stuck jobs) ------
    await pool.query(
      `UPDATE emails SET status = 'processing', attempts = attempts + 1, updated_at = now() WHERE id = $1`,
      [emailId]
    );

    try {
      const result = await sendEmail({
        fromName: email.sender_name,
        fromEmail: email.sender_email,
        to: email.recipient_email,
        subject: email.subject,
        html: email.body,
      });

      await pool.query(
        `UPDATE emails
         SET status = 'sent', sent_at = now(), message_id = $2, updated_at = now()
         WHERE id = $1`,
        [emailId, `${result.messageId}${result.previewUrl ? " | preview: " + result.previewUrl : ""}`]
      );

      await indexEmail({
        id: email.id,
        recipient_email: email.recipient_email,
        subject: email.subject,
        body: email.body,
        sender_id: email.sender_id,
        status: "sent",
        scheduled_time: email.scheduled_time,
        sent_at: new Date(),
      });
    } catch (err) {
      const message = (err as Error).message;
      await pool.query(
        `UPDATE emails SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1`,
        [emailId, message]
      );
      throw err; // let BullMQ's retry/backoff handle transient SMTP errors
    }
  },
  {
    connection: redisConnection,
    concurrency: env.workerConcurrency,
    limiter: {
      max: 1,
      duration: env.rateLimit.minDelayBetweenEmailsMs,
    },
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

/**
 * Restart-safety reconciliation
 * ------------------------------
 * BullMQ persists all delayed jobs in Redis, so on a plain process restart
 * nothing is lost — the worker just reconnects and keeps consuming. The
 * edge cases this guards against:
 *  1. Redis itself being wiped/rebuilt while Postgres survives (no job
 *     exists at all for a still-pending email).
 *  2. A job that exists in Redis but is stuck in a terminal state
 *     (failed after exhausting retries, or somehow already completed)
 *     while Postgres still thinks the email is pending — e.g. recovering
 *     from a bug that caused repeated failed attempts. A job "existing"
 *     is not the same as it still being able to fire; we check its actual
 *     state and re-create it if it's dead.
 */
async function reconcileOnBoot() {
  const { rows } = await pool.query(
    `SELECT id, scheduled_time FROM emails WHERE status IN ('scheduled', 'processing', 'rescheduled')`
  );
  let requeued = 0;
  for (const row of rows) {
    const needsRequeue = await jobNeedsRequeue(row.id);
    if (needsRequeue) {
      const { enqueueEmailJob, emailQueue } = await import("./queue");
      const existing = await emailQueue.getJob(row.id);
      if (existing) {
        await existing.remove();
      }
      await enqueueEmailJob(row.id, new Date(row.scheduled_time));
      requeued++;
    }
  }
  if (requeued > 0) {
    console.log(`Reconciliation: re-enqueued ${requeued} email(s) missing or dead in Redis.`);
  }
}

async function jobNeedsRequeue(id: string): Promise<boolean> {
  const { emailQueue } = await import("./queue");
  const job = await emailQueue.getJob(id);
  if (!job) return true;
  const state = await job.getState();
  return state === "completed" || state === "failed" || state === "unknown";
}

reconcileOnBoot().catch((err) => console.error("Reconciliation failed:", err));

console.log(
  `Worker started. Concurrency=${env.workerConcurrency}, minDelayMs=${env.rateLimit.minDelayBetweenEmailsMs}`
);

export default worker;
