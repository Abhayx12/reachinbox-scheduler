import fs from "fs";
import path from "path";
import { pool } from "./pool";
import { env } from "../config/env";

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");

  // gen_random_uuid() needs pgcrypto (or Postgres 13+ has it built in via
  // pgcrypto extension). Enable it defensively.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await pool.query(sql);

  // Seed/upsert senders from env so the FK on emails/campaigns is satisfied.
  for (const s of env.senders) {
    await pool.query(
      `INSERT INTO senders (id, name, email) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
      [s.id, s.name, s.email]
    );
  }

  console.log(`Migration complete. Seeded ${env.senders.length} sender(s).`);
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed", err);
  process.exit(1);
});
