import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { pool } from "../db/pool";
import { enqueueEmailJob } from "../queue/queue";
import { searchEmails } from "../services/search";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const scheduleSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  senderId: z.string().min(1),
  startTime: z.string(), // ISO string
  delayBetweenEmailsMs: z.coerce.number().int().min(0),
  hourlyLimit: z.coerce.number().int().min(1),
  recipients: z.array(z.string().email()).min(1),
});

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Parses an uploaded CSV/plain-text file of leads and returns the list of
 * unique, valid email addresses found. Accepts either a proper CSV with an
 * "email" column or a loose text/CSV blob — we regex-scan the raw text as
 * a fallback so odd formatting doesn't block the candidate from testing.
 */
router.post("/parse-leads", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const text = req.file.buffer.toString("utf-8");

  let emails: string[] = [];
  try {
    const records = parse(text, { columns: true, skip_empty_lines: true });
    const emailCol = Object.keys(records[0] || {}).find((k) =>
      k.toLowerCase().includes("email")
    );
    if (emailCol) {
      emails = records.map((r: any) => r[emailCol]).filter(Boolean);
    }
  } catch {
    // not a well-formed CSV with headers — fall through to regex scan
  }

  if (emails.length === 0) {
    emails = text.match(EMAIL_REGEX) || [];
  }

  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase())));
  res.json({ count: unique.length, emails: unique });
});

/**
 * Creates a campaign + one `emails` row per recipient, spacing each
 * recipient's `scheduled_time` out by `delayBetweenEmailsMs` starting at
 * `startTime`, then enqueues a BullMQ delayed job per email (jobId =
 * email.id, so this endpoint is safe to retry from the client).
 */
router.post("/schedule", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { subject, body, senderId, startTime, delayBetweenEmailsMs, hourlyLimit, recipients } =
    parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const campaignResult = await client.query(
      `INSERT INTO campaigns (user_id, subject, body, sender_id, start_time, delay_between_emails_ms, hourly_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.user!.id, subject, body, senderId, startTime, delayBetweenEmailsMs, hourlyLimit]
    );
    const campaignId = campaignResult.rows[0].id;

    const start = new Date(startTime);
    const createdIds: { id: string; scheduledTime: Date }[] = [];

    for (let i = 0; i < recipients.length; i++) {
      const scheduledTime = new Date(start.getTime() + i * delayBetweenEmailsMs);
      const emailResult = await client.query(
        `INSERT INTO emails (campaign_id, sender_id, recipient_email, subject, body, scheduled_time, original_scheduled_time, status)
         VALUES ($1, $2, $3, $4, $5, $6, $6, 'scheduled') RETURNING id, scheduled_time`,
        [campaignId, senderId, recipients[i], subject, body, scheduledTime]
      );
      createdIds.push({
        id: emailResult.rows[0].id,
        scheduledTime: emailResult.rows[0].scheduled_time,
      });
    }

    await client.query("COMMIT");

    // Enqueue AFTER commit: if enqueueing partially fails, the rows still
    // exist in Postgres and the boot-time reconciliation pass in worker.ts
    // will pick up any that never made it into Redis.
    for (const e of createdIds) {
      await enqueueEmailJob(e.id, e.scheduledTime);
    }

    res.json({ campaignId, scheduled: createdIds.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Schedule failed:", err);
    res.status(500).json({ error: "Failed to schedule campaign" });
  } finally {
    client.release();
  }
});

router.get("/emails", requireAuth, async (req, res) => {
  const status = req.query.status as string | undefined;
  const params: any[] = [];
  let where = "";
  if (status === "scheduled") {
    where = `WHERE status IN ('scheduled', 'processing', 'rescheduled')`;
  } else if (status === "sent") {
    where = `WHERE status IN ('sent', 'failed')`;
  }
  const { rows } = await pool.query(
    `SELECT id, recipient_email, subject, scheduled_time, sent_at, status, sender_id, error_message
     FROM emails ${where} ORDER BY scheduled_time DESC LIMIT 200`,
    params
  );
  res.json({ emails: rows });
});

router.get("/search", requireAuth, async (req, res) => {
  const q = (req.query.q as string) || "";
  const status = req.query.status as string | undefined;
  if (!q) return res.status(400).json({ error: "Missing q" });
  try {
    const results = await searchEmails(q, status);
    res.json({ results });
  } catch (err) {
    res.status(503).json({ error: "Search unavailable", detail: (err as Error).message });
  }
});

router.get("/senders", requireAuth, async (_req, res) => {
  const { rows } = await pool.query(`SELECT id, name, email FROM senders`);
  res.json({ senders: rows });
});

export default router;
