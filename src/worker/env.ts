export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Label and glass photos. Missing until the bucket exists: labels are still read, not kept. */
  PHOTOS?: R2Bucket;
  /** https://airoma.llmat.dev: the Google redirect goes back here. */
  SITE_ORIGIN: string;
  /** "production" or "staging"; missing in tests. */
  ENVIRONMENT?: string;
  /** Who runs the site, comma-separated Google emails: they may always sign in and invite others. */
  OWNER_EMAILS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Ke Li's Azure (Microsoft Foundry) key, the same as the badminton site's: reading labels. */
  AZURE_FOUNDRY_API_KEY?: string;
  /** The Azure resource for that key, e.g. https://name.openai.azure.com; defaults to Ke Li's main one. */
  AZURE_FOUNDRY_ENDPOINT?: string;
  /** Google Places (New), for 酒庄地址联想; optional. */
  GOOGLE_MAPS_API_KEY?: string;
  /** "1" lets /api/auth/dev sign in as anyone: local runs and tests only, never set in wrangler.jsonc. */
  DEV_LOGIN?: string;
  /** The release running, set by CI on deploy; shown by /api/health. */
  APP_VERSION?: string;
}
