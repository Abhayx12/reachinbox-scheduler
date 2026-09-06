import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool";
import { env } from "../config/env";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();
const oauthClient = new OAuth2Client(
  env.google.clientId,
  env.google.clientSecret,
  env.google.redirectUri
);

// Step 1: redirect the browser to Google's consent screen.
router.get("/google", (req, res) => {
  const url = oauthClient.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "consent",
  });
  res.redirect(url);
});

// Step 2: Google redirects back here with a `code`.
router.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const { tokens } = await oauthClient.getToken(code);
    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: env.google.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload) throw new Error("No payload from Google");

    const { sub: googleId, email, name, picture } = payload;

    const { rows } = await pool.query(
      `INSERT INTO users (google_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
       RETURNING id, email, name, avatar_url`,
      [googleId, email, name, picture]
    );
    const user = rows[0];

    const sessionToken = jwt.sign(
      { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url },
      env.jwtSecret,
      { expiresIn: "7d" }
    );

    res.cookie("session_token", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${env.frontendUrl}/dashboard`);
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    res.redirect(`${env.frontendUrl}/?error=auth_failed`);
  }
});

router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

router.post("/logout", (req, res) => {
  res.clearCookie("session_token");
  res.json({ ok: true });
});

export default router;
