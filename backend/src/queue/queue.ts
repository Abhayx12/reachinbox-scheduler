import { Queue } from "bullmq";
import { redisConnection, QUEUE_NAME } from "./connection";

export const emailQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600 * 24 * 7 }, // keep 7 days for the bull-board demo
    removeOnFail: false,
  },
});

/**
 * Enqueues (or re-enqueues) a delayed BullMQ job for an email.
 *
 * jobId === email.id (the Postgres UUID) is the crux of our idempotency
 * story: BullMQ guarantees jobIds are unique per queue, so calling this
 * twice for the same email (e.g. because the API request was retried, or
 * because a reconciliation pass on boot re-scans "scheduled" rows) simply
 * upserts/no-ops instead of creating a duplicate send.
 */
export async function enqueueEmailJob(emailId: string, sendAt: Date) {
  const delay = Math.max(0, sendAt.getTime() - Date.now());
  await emailQueue.add(
    "send-email",
    { emailId },
    {
      jobId: emailId,
      delay,
    }
  );
}

/**
 * Used by the rate limiter's "push to next hour" path: removes the current
 * delayed job (if present) and re-adds it with a new delay. Because the
 * jobId stays the same, this is a move, not a duplicate.
 */
export async function rescheduleEmailJob(emailId: string, newSendAt: Date) {
  const existing = await emailQueue.getJob(emailId);
  if (existing) {
    await existing.remove();
  }
  await enqueueEmailJob(emailId, newSendAt);
}
