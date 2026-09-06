import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { env } from "./config/env";
import { emailQueue } from "./queue/queue";
import { ensureIndex } from "./services/search";

import authRoutes from "./routes/auth";
import slackRoutes from "./routes/slack";
import scheduleRoutes from "./routes/schedule";

const app = express();

app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// --- Live BullMQ dashboard for real-time queue visibility -----------------
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

// --- API routes -------------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/slack", slackRoutes);
app.use("/api", scheduleRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

ensureIndex().catch(() => {});

app.listen(env.port, () => {
  console.log(`ReachInbox scheduler API listening on :${env.port}`);
  console.log(`BullMQ dashboard: http://localhost:${env.port}/admin/queues`);
});
