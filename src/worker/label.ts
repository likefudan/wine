import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import type { Usage } from "../shared/costs";
import { COLORS, ID_RE, LABEL_MODELS, type LabelModel, isLabelModel, ulid } from "../shared/model";
import { requireApproved, requireSameOrigin, requireUser } from "./auth";
import { claudeUsage, logCall } from "./costs";
import type { Env } from "./env";
import { HttpError, now, readJson } from "./http";

/**
 * 拍酒标: Claude reads producer, wine, vintage, region and alcohol off a label photo (docs/design.zh.md
 * §3.1). Called on Ke Li's Azure (Microsoft Foundry), the same resource and key as the badminton
 * site. The person always confirms what was read before it becomes a wine. The photo is kept in R2
 * when the bucket is there, as the tasting's cover.
 */

export const AZURE_HOST = "https://happy-badminton-jay-main-1.openai.azure.com";
/** Tried after the person's own choice, when it fails. */
const FALLBACK: string[] = ["claude-sonnet-5-5", "claude-fable-5-1"];
/** Labels read per person per day (§2); 专业评价 has its own limits (reviews.ts). */
export const DAILY_AI_LIMIT = 40;
/** The phone shrinks the photo to 1600px (about 300 KB); this stops a stray full-size one. */
const MAX_IMAGE_BYTES = 2_500_000;

export const aiEnabled = (env: Env) => !!env.AZURE_FOUNDRY_API_KEY;

export interface LabelReading {
  producer: string;
  wine: string;
  year: number | null;
  color: (typeof COLORS)[number] | null;
  country: string;
  region: string;
  appellation: string;
  grapes: string[];
  abv: number | null;
  confident: boolean;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["producer", "wine", "year", "color", "country", "region", "appellation", "grapes", "abv", "confident"],
  properties: {
    producer: { type: "string" },
    wine: { type: "string" },
    year: { type: ["integer", "null"] },
    color: { type: ["string", "null"], enum: [...COLORS, null] },
    country: { type: "string" },
    region: { type: "string" },
    appellation: { type: "string" },
    grapes: { type: "array", items: { type: "string" } },
    abv: { type: ["number", "null"] },
    confident: { type: "boolean" },
  },
};

const PROMPT = `This is a phone photo of a wine bottle's label. Read what the label says.
- producer: the winery or producer exactly as printed (e.g. "Opus One", "Château Margaux", "Ridge Vineyards").
- wine: the wine's own name or cuvée (e.g. "Monte Bello", "Reserve Cabernet Sauvignon"). If the label has no separate name, use the grape or style printed most prominently; if none, repeat the producer.
- year: the vintage printed on the label, or null when none is visible (also for non-vintage wines).
- color: red, white, rose, sparkling or dessert, judged from the label's words and the bottle; null if you can't tell.
- country, region, appellation: as printed or clearly implied by the appellation. region is the big region (for the USA and Australia, the state); appellation is the most precise appellation on the label (e.g. "Oakville" → country "USA", region "California", appellation "Oakville"; "Pauillac" → country "France", region "Bordeaux", appellation "Pauillac"). Empty string when unknown.
- grapes: grape varieties printed on the label, in English. Empty array when none.
- abv: alcohol % as a number if printed, else null.
- confident: false when the photo is not a wine label, is unreadable, or you are guessing the producer.
Only use what is on the label or follows directly from it. Never invent a vintage.`;

type Raw = { text: string; usage: Usage };

/** Claude, through Foundry's Anthropic endpoint, with the answer held to SCHEMA. */
async function askClaude(env: Env, model: string, image: string): Promise<Raw> {
  const client = new Anthropic({
    apiKey: env.AZURE_FOUNDRY_API_KEY!,
    baseURL: `${AZURE_HOST}/anthropic`,
    timeout: 45_000,
    maxRetries: 0,
  });
  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);
  return {
    text: response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""),
    usage: claudeUsage(response.usage),
  };
}

/** Other models, through Foundry's OpenAI-style endpoint; they are asked for JSON in words. */
async function askOpenAi(env: Env, model: string, image: string): Promise<Raw> {
  const res = await fetch(`${AZURE_HOST}/openai/v1/chat/completions`, {
    method: "POST",
    headers: { "api-key": env.AZURE_FOUNDRY_API_KEY!, "content-type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${PROMPT}\nReply with one JSON object only, with exactly these keys: ${SCHEMA.required.join(", ")}.`,
            },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
  const out = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: out.choices[0]?.message.content ?? "",
    usage: { input: out.usage?.prompt_tokens ?? 0, output: out.usage?.completion_tokens ?? 0 },
  };
}

/** The JSON object in a model's answer, even when it is wrapped in a ```json fence. */
const jsonIn = (text: string) => JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

/** The order to try models in: the person's choice, then the fallbacks. */
export const modelsFor = (chosen: string | null): string[] => {
  const first: LabelModel = isLabelModel(chosen) ? chosen : LABEL_MODELS[0].id;
  return [first, ...FALLBACK.filter((m) => m !== first)];
};

async function readLabel(
  env: Env,
  image: string,
  chosen: string | null,
  userId: string,
): Promise<{ reading: LabelReading; model: string; usage: Usage }> {
  let last: unknown;
  for (const model of modelsFor(chosen)) {
    let billed: Usage | null = null;
    try {
      const api = LABEL_MODELS.find((m) => m.id === model)?.api ?? "anthropic";
      const { text, usage } =
        api === "openai" ? await askOpenAi(env, model, image) : await askClaude(env, model, image);
      billed = usage;
      const r = jsonIn(text) as LabelReading;
      const done = {
        reading: {
          producer: String(r.producer ?? "").slice(0, 120),
          wine: String(r.wine ?? "").slice(0, 160),
          year: Number.isInteger(r.year) && r.year! >= 1900 && r.year! <= 2100 ? r.year : null,
          color: r.color && (COLORS as readonly string[]).includes(r.color) ? r.color : null,
          country: String(r.country ?? "").slice(0, 60),
          region: String(r.region ?? "").slice(0, 80),
          appellation: String(r.appellation ?? "").slice(0, 80),
          grapes: Array.isArray(r.grapes) ? r.grapes.map((g) => String(g).slice(0, 60)).slice(0, 8) : [],
          abv: typeof r.abv === "number" && r.abv > 0 && r.abv < 30 ? r.abv : null,
          confident: r.confident === true,
        },
        model,
        usage,
      };
      billed = null;
      await logCall(env, { userId, feature: "label", model, usage });
      return done;
    } catch (e) {
      // It answered, but not with a label we could read: billed all the same.
      if (billed) await logCall(env, { userId, feature: "label", model, usage: billed, ok: false });
      last = e;
    }
  }
  throw last;
}

export const labelRoutes = new Hono<{ Bindings: Env }>();

labelRoutes.post("/label", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  requireApproved(c.env, user);
  if (!aiEnabled(c.env)) throw new HttpError(503, "ai_off", "拍酒标识别还没有开通，请手动输入");
  const body = await readJson(c.req.raw);
  const image = typeof body.image === "string" ? body.image.replace(/^data:image\/jpeg;base64,/, "") : "";
  if (!image || image.length > (MAX_IMAGE_BYTES * 4) / 3) throw new HttpError(400, "bad_image", "照片无效，请重拍");
  const since = new Date(Date.now() - 86400_000).toISOString();
  const used = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM ai_jobs WHERE user_id = ? AND kind = 'label' AND created_at > ?",
  )
    .bind(user.id, since)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= DAILY_AI_LIMIT) throw new HttpError(429, "ai_limit", "今天的识别次数用完了，请手动输入");

  // Keep the photo first: if reading fails, the person still has their cover picture.
  let photoId: string | null = null;
  if (c.env.PHOTOS) {
    photoId = ulid();
    const key = `labels/${user.id}/${photoId}.jpg`;
    const bytes = Uint8Array.from(atob(image), (ch) => ch.charCodeAt(0));
    await c.env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    await c.env.DB.prepare("INSERT INTO photos (id, user_id, r2_key, kind, created_at) VALUES (?, ?, ?, 'label', ?)")
      .bind(photoId, user.id, key, now())
      .run();
  }
  const jobId = ulid();
  try {
    const { reading, model, usage } = await readLabel(c.env, image, user.label_model, user.id);
    await c.env.DB.prepare(
      "INSERT INTO ai_jobs (id, user_id, kind, status, model, input_tokens, output_tokens, created_at) VALUES (?, ?, 'label', 'done', ?, ?, ?, ?)",
    )
      .bind(jobId, user.id, model, usage.input, usage.output, now())
      .run();
    return c.json({ reading, photoId });
  } catch (e) {
    await c.env.DB.prepare(
      "INSERT INTO ai_jobs (id, user_id, kind, status, error, created_at) VALUES (?, ?, 'label', 'failed', ?, ?)",
    )
      .bind(jobId, user.id, String((e as Error)?.message ?? e).slice(0, 300), now())
      .run();
    throw new HttpError(502, "ai_failed", "没能读出酒标，请重拍或手动输入");
  }
});

/** Photos a person may keep a day without reading them (分享图 补拍): storage, not AI. */
export const DAILY_PHOTO_LIMIT = 60;

/** A label photo taken later (分享图), kept as the tasting's photo: no reading, no AI allowance. */
labelRoutes.post("/photos", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  requireApproved(c.env, user);
  if (!c.env.PHOTOS) throw new HttpError(503, "photos_off", "照片存储还没有开通");
  const body = await readJson(c.req.raw);
  const image = typeof body.image === "string" ? body.image.replace(/^data:image\/jpeg;base64,/, "") : "";
  if (!image || image.length > (MAX_IMAGE_BYTES * 4) / 3 || !/^[A-Za-z0-9+/=]+$/.test(image))
    throw new HttpError(400, "bad_image", "照片无效，请重拍");
  const since = new Date(Date.now() - 86400_000).toISOString();
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM photos WHERE user_id = ? AND created_at > ?")
    .bind(user.id, since)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= DAILY_PHOTO_LIMIT) throw new HttpError(429, "photo_limit", "今天上传的照片太多了，明天再试");
  const photoId = ulid();
  const key = `labels/${user.id}/${photoId}.jpg`;
  const bytes = Uint8Array.from(atob(image), (ch) => ch.charCodeAt(0));
  await c.env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  await c.env.DB.prepare("INSERT INTO photos (id, user_id, r2_key, kind, created_at) VALUES (?, ?, ?, 'label', ?)")
    .bind(photoId, user.id, key, now())
    .run();
  return c.json({ photoId });
});

labelRoutes.get("/photos/:id", async (c) => {
  const user = await requireUser(c);
  const pid = c.req.param("id");
  if (!ID_RE.test(pid) || !c.env.PHOTOS) return c.notFound();
  const row = await c.env.DB.prepare("SELECT r2_key FROM photos WHERE id = ? AND user_id = ?")
    .bind(pid, user.id)
    .first<{ r2_key: string }>();
  if (!row) return c.notFound();
  const obj = await c.env.PHOTOS.get(row.r2_key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
});
