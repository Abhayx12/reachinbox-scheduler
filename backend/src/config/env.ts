import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    // We don't throw here for every var so the app can still boot in dev
    // without full OAuth/Elasticsearch configured; individual features
    // check their own required vars when actually invoked.
    return "";
  }
  return v;
}

export interface SenderConfig {
  id: string;
  name: string;
  email: string;
}

function parseSenders(): SenderConfig[] {
  try {
    return JSON.parse(process.env.SENDERS_JSON || "[]");
  } catch {
    return [];
  }
}

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  frontendUrl: required("FRONTEND_URL", "http://localhost:3000"),
  jwtSecret: required("JWT_SECRET", "dev-secret"),

  databaseUrl: required("DATABASE_URL"),

  redis: {
    host: required("REDIS_HOST", "localhost"),
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  elasticsearch: {
    node: required("ELASTICSEARCH_NODE", "http://localhost:9200"),
    index: required("ELASTICSEARCH_INDEX", "emails"),
  },

  ethereal: {
    host: required("ETHEREAL_SMTP_HOST", "smtp.ethereal.email"),
    port: parseInt(process.env.ETHEREAL_SMTP_PORT || "587", 10),
    user: process.env.ETHEREAL_SMTP_USER || "",
    pass: process.env.ETHEREAL_SMTP_PASS || "",
  },

  senders: parseSenders(),

  rateLimit: {
    maxEmailsPerHourPerSender: parseInt(
      process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || "200",
      10
    ),
    minDelayBetweenEmailsMs: parseInt(
      process.env.MIN_DELAY_BETWEEN_EMAILS_MS || "2000",
      10
    ),
  },

  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || "5", 10),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  },

  slack: {
    clientId: process.env.SLACK_CLIENT_ID || "",
    clientSecret: process.env.SLACK_CLIENT_SECRET || "",
    redirectUri: process.env.SLACK_REDIRECT_URI || "",
  },
};
