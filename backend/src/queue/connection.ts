import IORedis from "ioredis";
import { env } from "../config/env";

// BullMQ requires maxRetriesPerRequest: null on the connection it manages.
export const redisConnection = new IORedis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  maxRetriesPerRequest: null,
});

export const QUEUE_NAME = "email-send-queue";
