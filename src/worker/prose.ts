import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { COLORS, isLang, type Lang, ulid } from "../shared/model";
import { placePath } from "../shared/place";
import { PROSE_LANG, PROSE_MAX, type ProseTasting, type ProseWine, tastingFacts, wineFacts } from "../shared/prose";
import { requireApproved, requireSameOrigin, requireUser } from "./auth";
import type { Env } from "./env";
import { HttpError, now, readJson } from "./http";
import { AZURE_HOST, DAILY_AI_LIMIT, aiEnabled } from "./label";

/**
 * 分享图: one tasting written up as a critic's note, from what the person recorded and nothing else.
 * The phone sends the tasting (it may not have synced yet); the note comes back for the person to
 * read and edit before it goes on the picture. Counts against the same daily AI allowance as labels.
 */

/** Sonnet writes well and quickly; Opus if it is down. */
export const PROSE_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["note", "places"],
  properties: {
    note: { type: "string" },
    places: { type: "array", items: { type: "string" } },
  },
};

export function prosePrompt(lang: Lang, wine: string[], tasting: string[], places: string[]): string {
  const length =
    lang === "en"
      ? "60 to 110 words; shorter (one or two sentences) when there are only a few observations"
      : "90 to 170 Chinese characters; shorter (one or two sentences) when there are only a few observations";
  return `You are helping a wine lover turn their own tasting notes into a polished note in the voice of a professional wine critic (the measured, evocative register of Jancis Robinson, Wine Advocate or Decanter), to print on a shareable card.

THE WINE
${wine.join("\n")}

WHAT THE TASTER RECORDED
${tasting.length ? tasting.join("\n") : "(nothing beyond the wine itself)"}

Write "note" in ${PROSE_LANG[lang]}, ${length}, as one flowing paragraph of plain text (no title, no quotation marks around it, no lists, no emoji).
Rules — the note must stay faithful:
- Use only the observations above. Never add an aroma, flavour, texture, structural element, food pairing, ageing claim or quality judgement the taster did not record. You may choose an elegant order, connect observations naturally and use the critic's craft vocabulary for the same things (e.g. "medium+ acidity" → lively/fresh acidity), but not new facts.
- If the taster's own words are given, weave in what they say (translated if needed) — they are the heart of the note; do not contradict them.
- Do not mention the score, the price, the producer's reputation, the vintage's weather or anything about the winery that is not above. Do not say "the taster" or "I"; write the note itself.
- Faults, if recorded, are stated plainly and briefly.
${lang === "zh-CN" ? "- Use mainland Chinese wine vocabulary (单宁, 酒体, 余味, 香气)." : ""}

Also return "places": the ${places.length} place names below, in the same order, each written the way ${lang === "en" ? "an English-language wine publication would (unchanged unless it is not in English)" : `a Chinese-language wine publication in ${lang === "zh-TW" ? "Taiwan" : "mainland China"} would (e.g. Bordeaux → ${lang === "zh-TW" ? "波爾多" : "波尔多"}, Napa Valley → ${lang === "zh-TW" ? "納帕谷" : "纳帕谷"}); keep the original spelling when there is no established ${lang === "zh-TW" ? "Traditional" : "Simplified"} Chinese name`}:
${places.map((p, i) => `${i + 1}. ${p}`).join("\n") || "(none: return an empty array)"}`;
}

/** The wine as the phone sent it, kept to what the note needs. */
function cleanWine(v: unknown): ProseWine | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const s = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
  const producer = s(o.producer, 120);
  if (!producer) return null;
  return {
    producer,
    wine: s(o.wine, 160) || producer,
    year: Number.isInteger(o.year) && (o.year as number) >= 0 && (o.year as number) <= 2200 ? (o.year as number) : 0,
    color: (COLORS as readonly string[]).includes(o.color as string) ? (o.color as ProseWine["color"]) : "red",
    country: s(o.country, 60) || null,
    region: s(o.region, 80) || null,
    area: s(o.area, 80) || null,
    appellation: s(o.appellation, 80) || null,
    grapes: Array.isArray(o.grapes)
      ? o.grapes
          .filter((g) => typeof g === "string")
          .map((g) => g.slice(0, 60))
          .slice(0, 8)
      : [],
    abv: typeof o.abv === "number" && o.abv > 0 && o.abv < 30 ? o.abv : null,
  };
}

function cleanTasting(x: unknown): ProseTasting {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as never;
  return {
    appearance: obj(o.appearance),
    nose: obj(o.nose),
    palate: obj(o.palate),
    extra: obj(o.extra),
    descriptors: Array.isArray(o.descriptors) ? (o.descriptors as ProseTasting["descriptors"]).slice(0, 30) : [],
    quality: typeof o.quality === "string" ? o.quality : null,
    score: null,
    note: typeof o.note === "string" ? o.note.slice(0, PROSE_MAX) : null,
  };
}

/** The place names as the card shows them: country, then 产区 / 大区 / 子产区. */
export const placeNames = (v: ProseWine, path: string[]) => [v.country, ...path].filter((p): p is string => !!p);

async function write(
  env: Env,
  prompt: string,
): Promise<{ note: string; places: string[]; model: string; usage: [number, number] }> {
  let last: unknown;
  for (const model of PROSE_MODELS) {
    try {
      const client = new Anthropic({
        apiKey: env.AZURE_FOUNDRY_API_KEY!,
        baseURL: `${AZURE_HOST}/anthropic`,
        timeout: 40_000,
        maxRetries: 0,
      });
      const r = await client.messages.create({
        model,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      } as Anthropic.MessageCreateParamsNonStreaming);
      const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      const out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
        note?: unknown;
        places?: unknown;
      };
      const note = typeof out.note === "string" ? out.note.trim().slice(0, PROSE_MAX) : "";
      if (!note) throw new Error(`${model}: empty note`);
      const places = Array.isArray(out.places) ? out.places.map((p) => String(p).trim().slice(0, 60)) : [];
      return { note, places, model, usage: [r.usage.input_tokens, r.usage.output_tokens] };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export const proseRoutes = new Hono<{ Bindings: Env }>();

proseRoutes.post("/prose", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  requireApproved(c.env, user);
  if (!aiEnabled(c.env)) throw new HttpError(503, "ai_off", "AI 还没有开通");
  const body = await readJson(c.req.raw);
  const wine = cleanWine(body.wine);
  if (!wine) throw new HttpError(400, "bad_wine", "缺少酒款信息");
  const lang: Lang = isLang(body.lang) ? body.lang : "zh-CN";
  const since = new Date(Date.now() - 86400_000).toISOString();
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_jobs WHERE user_id = ? AND created_at > ?")
    .bind(user.id, since)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= DAILY_AI_LIMIT) throw new HttpError(429, "ai_limit", "今天的 AI 次数用完了，明天再试");

  const places = placeNames(wine, placePath(wine));
  const prompt = prosePrompt(lang, wineFacts(wine), tastingFacts(cleanTasting(body.tasting)), places);
  const jobId = ulid();
  try {
    const r = await write(c.env, prompt);
    await c.env.DB.prepare(
      "INSERT INTO ai_jobs (id, user_id, kind, status, model, input_tokens, output_tokens, created_at) VALUES (?, ?, 'prose', 'done', ?, ?, ?, ?)",
    )
      .bind(jobId, user.id, r.model, r.usage[0], r.usage[1], now())
      .run();
    // A place the model dropped or mangled keeps its own name.
    const shown = places.map((p, i) => r.places[i] || p);
    return c.json({ note: r.note, places: shown });
  } catch (e) {
    await c.env.DB.prepare(
      "INSERT INTO ai_jobs (id, user_id, kind, status, error, created_at) VALUES (?, ?, 'prose', 'failed', ?, ?)",
    )
      .bind(jobId, user.id, String((e as Error)?.message ?? e).slice(0, 300), now())
      .run();
    throw new HttpError(502, "ai_failed", "没能写出品鉴文字，请稍后再试");
  }
});
