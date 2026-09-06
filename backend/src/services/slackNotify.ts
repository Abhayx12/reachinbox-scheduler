import axios from "axios";
import { pool } from "../db/pool";

/**
 * Sends a Slack message the moment a sender's hourly limit is hit.
 *
 * We don't have a hard "user" concept tying a sender to one Slack team in
 * this simplified schema (a sender is shared across the org), so for the
 * demo we notify EVERY connected Slack integration. In a multi-tenant
 * version, `senders` would carry a `user_id`/`tenant_id` and this query
 * would filter to that tenant's integration only.
 *
 * If nobody has connected Slack yet, this is a silent no-op (never
 * throws), per the requirement: "if the user hasn't connected Slack,
 * rate-limit hits should simply not notify (no crash)". Because we read
 * the integration fresh from Postgres on every call, a connect/disconnect
 * takes effect immediately with no redeploy.
 */
export async function notifyRateLimitHit(senderId: string, limit: number) {
  try {
    const { rows } = await pool.query(
      `SELECT webhook_url, access_token, channel_id FROM slack_integrations`
    );
    if (rows.length === 0) return;

    const text = `:rotating_light: *Rate limit hit* — sender \`${senderId}\` reached its hourly cap of *${limit}* emails. Remaining emails for this hour have been rescheduled to the next window.`;

    for (const integration of rows) {
      try {
        if (integration.webhook_url) {
          await axios.post(integration.webhook_url, { text });
        } else if (integration.access_token && integration.channel_id) {
          await axios.post(
            "https://slack.com/api/chat.postMessage",
            { channel: integration.channel_id, text },
            { headers: { Authorization: `Bearer ${integration.access_token}` } }
          );
        }
      } catch (postErr) {
        console.warn("Slack notify failed for one integration:", (postErr as Error).message);
      }
    }
  } catch (err) {
    // Never let a notification failure affect the email pipeline.
    console.warn("notifyRateLimitHit error:", (err as Error).message);
  }
}
