// Deploy helper: pushes the Worker's secrets from the environment (GitHub secrets in CI). A secret
// that is not set is left as it is on the Worker.
// Usage: node scripts/sync-secrets.mjs [production|staging]
import { execFileSync } from "node:child_process";

const target = process.argv[2] ?? "production";
const env = target === "staging" ? ["--env", "staging"] : [];
const NAMES = [
  "OWNER_EMAILS",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AZURE_FOUNDRY_API_KEY",
  "AZURE_FOUNDRY_ENDPOINT",
  "GOOGLE_MAPS_API_KEY",
];
const values = Object.fromEntries(NAMES.filter((n) => process.env[n]).map((n) => [n, process.env[n]]));
if (!Object.keys(values).length) {
  console.log("No secrets to push");
  process.exit(0);
}
execFileSync("npx", ["wrangler", "secret", "bulk", ...env], {
  input: JSON.stringify(values),
  stdio: ["pipe", "inherit", "inherit"],
});
console.log(`Pushed ${Object.keys(values).join(", ")}`);
