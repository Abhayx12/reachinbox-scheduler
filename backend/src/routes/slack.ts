import { Router } from "express";
import axios from "axios";
import { pool } from "../db/pool";
import { env } from "../config/env";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

// Step 1: kick off Slack's OAuth v2 authorize flow.
// Scopes: incoming-webhook (simplest path to "post a message") +
// chat:write as a fallback if you configure a fixed channel instead.
router.get("/oauth/start", requireAuth, (req: AuthedRequest, res) => {
  const state = req.user!.id; // tie the callback back to this user
  const params = new URLSearchParams({
    client_id: env.slack.clientId,
    scope: "incoming-webhook,chat:write",
    redirect_uri: env.slack.redirectUri,
    state,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

// Step 2: Slack redirects back with `code` + our `state` (userId).
router.get("/oauth/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const userId = req.query.state as string;

    const { data } = await axios.post(
      "https://slack.com/api/oauth.v2.access",
      null,
      {
        params: {
          client_id: env.slack.clientId,
          client_secret: env.slack.clientSecret,
          code,
          redirect_uri: env.slack.redirectUri,
        },
      }
    );

    if (!data.ok) {
      throw new Error(`Slack OAuth error: ${data.error}`);
    }

    const webhookUrl = data.incoming_webhook?.url || null;
    const channelId = data.incoming_webhook?.channel_id || null;
    const accessToken = data.access_token;
    const teamId = data.team?.id;
    const teamName = data.team?.name;

    await pool.query(
      `INSERT INTO slack_integrations (user_id, team_id, team_name, access_token, webhook_url, channel_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         team_id = EXCLUDED.team_id, team_name = EXCLUDED.team_name,
         access_token = EXCLUDED.access_token, webhook_url = EXCLUDED.webhook_url,
         channel_id = EXCLUDED.channel_id, connected_at = now()`,
      [userId, teamId, teamName, accessToken, webhookUrl, channelId]
    );

    res.redirect(`${env.frontendUrl}/dashboard?slack=connected`);
  } catch (err) {
    console.error("Slack OAuth callback failed:", err);
    res.redirect(`${env.frontendUrl}/dashboard?slack=error`);
  }
});

router.get("/status", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT team_name, connected_at FROM slack_integrations WHERE user_id = $1`,
    [req.user!.id]
  );
  res.json({ connected: rows.length > 0, integration: rows[0] || null });
});

router.post("/disconnect", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`DELETE FROM slack_integrations WHERE user_id = $1`, [req.user!.id]);
  res.json({ ok: true });
});

export default router;
