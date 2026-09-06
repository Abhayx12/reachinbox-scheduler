import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";

const client = new Client({ node: env.elasticsearch.node });
const INDEX = env.elasticsearch.index;

export async function ensureIndex() {
  try {
    const exists = await client.indices.exists({ index: INDEX });
    if (!exists) {
      await client.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            recipient_email: { type: "keyword" },
            subject: { type: "text" },
            body: { type: "text" },
            sender_id: { type: "keyword" },
            status: { type: "keyword" },
            scheduled_time: { type: "date" },
            sent_at: { type: "date" },
          },
        },
      });
    }
  } catch (err) {
    // Elasticsearch is a "nice to have" for the demo; don't crash the API
    // if it's not running locally — just log and continue. Search endpoints
    // will return an explanatory error until ES is up.
    console.warn("Elasticsearch not available yet:", (err as Error).message);
  }
}

export async function indexEmail(email: {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  sender_id: string;
  status: string;
  scheduled_time: Date | string;
  sent_at: Date | string | null;
}) {
  try {
    await client.index({
      index: INDEX,
      id: email.id,
      document: email,
      refresh: "wait_for",
    });
  } catch (err) {
    console.warn("Elasticsearch index failed:", (err as Error).message);
  }
}

export async function searchEmails(query: string, status?: string) {
  const must: any[] = [
    {
      multi_match: {
        query,
        fields: ["subject", "body", "recipient_email"],
      },
    },
  ];
  if (status) {
    must.push({ term: { status } });
  }
  const result = await client.search({
    index: INDEX,
    query: { bool: { must } },
    size: 50,
  });
  return result.hits.hits.map((h) => h._source);
}
