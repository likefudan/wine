import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

for (const m of env.TEST_MIGRATIONS) await env.DB.batch(m.queries.map((q) => env.DB.prepare(q)));

const TABLES = [
  "tasting_descriptors",
  "tastings",
  "list_items",
  "list_members",
  "lists",
  "vintage_aliases",
  "vintages",
  "wines",
  "producers",
  "photos",
  "ai_jobs",
  "invites",
  "sessions",
  "oauth_states",
  "users",
];

beforeEach(async () => {
  await env.DB.batch(TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});
