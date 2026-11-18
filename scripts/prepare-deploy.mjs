// Deploy helper: find (or create) the environment's D1 database and write its id into
// wrangler.jsonc, and bind the photo bucket when it exists (labels are read but not kept until then).
// Usage: node scripts/prepare-deploy.mjs [production|staging]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ENVS = {
  production: { db: "wine", bucket: "wine-photos", placeholder: "00000000-0000-0000-0000-000000000000", env: [] },
  staging: {
    db: "wine-staging",
    bucket: "wine-photos-staging",
    placeholder: "11111111-1111-1111-1111-111111111111",
    env: ["--env", "staging"],
  },
};
const target = process.argv[2] ?? "production";
const cfg = ENVS[target];
if (!cfg) throw new Error(`unknown environment ${target}`);

const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8" });
const list = () => JSON.parse(wrangler("d1", "list", "--json"));
let db = list().find((d) => d.name === cfg.db);
if (!db) {
  console.log(`Creating D1 database ${cfg.db}`);
  wrangler("d1", "create", cfg.db, "--location", "wnam");
  db = list().find((d) => d.name === cfg.db);
}
if (!db) throw new Error(`D1 database ${cfg.db} not found after create`);

let config = readFileSync("wrangler.jsonc", "utf8");
if (!config.includes(cfg.placeholder)) throw new Error(`database_id placeholder for ${target} missing`);
config = config.replace(cfg.placeholder, db.uuid);
console.log(`Using D1 database ${db.name} (${db.uuid})`);

let hasBucket = false;
try {
  hasBucket = new RegExp(`^name:\\s+${cfg.bucket}$`, "m").test(wrangler("r2", "bucket", "list"));
} catch {
  console.log("Cannot list R2 buckets with this token: photos stay off");
}
if (hasBucket) {
  const binding = `"r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "${cfg.bucket}" }],\n`;
  // Right before this environment's d1_databases: the top level for production, the staging block's own.
  const marker =
    target === "staging"
      ? '      "d1_databases": [\n        {\n          "binding": "DB",\n          "database_name": "wine-staging"'
      : '  "d1_databases": [\n    {\n      "binding": "DB",\n      "database_name": "wine",';
  if (!config.includes(marker)) throw new Error("d1_databases block not found");
  config = config.replace(marker, `${target === "staging" ? "      " : "  "}${binding}${marker}`);
  console.log(`Photos go to R2 bucket ${cfg.bucket}`);
} else console.log(`No R2 bucket ${cfg.bucket}: labels are read but photos are not kept`);
writeFileSync("wrangler.jsonc", config);
