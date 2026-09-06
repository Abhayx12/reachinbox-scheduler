import { Pool } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

pool.on("error", (err: Error) => {
  // Idle client errors should not crash the whole process.
  console.error("Unexpected Postgres pool error", err);
});
