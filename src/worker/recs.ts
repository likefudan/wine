import { Hono } from "hono";
import type { WineColor } from "../shared/model";
import { COLORS } from "../shared/model";
import { appellationsIn, areaNamed, tidyPlace } from "../shared/place";
import type { ProReview } from "../shared/reviews";
import { type Candidate, criticAverage } from "../shared/taste";
import { requireSameOrigin, requireUser } from "./auth";
import { trustedWine } from "./data";
import type { Env } from "./env";
import { readJson } from "./http";

/**
 * 下一款试试 (docs/design.zh.md §11): wines I have not had that share a grape, a place or a producer
 * with the ones I score well, from the shared catalogue (with what the critics' lookup found) and
 * from LWIN, plus wines for the 进阶 step. The page ranks them with my profile; nothing here knows my
 * scores, and nothing here costs an AI call.
 *
 * LWIN is sampled with an index seek from a point that moves with the seed, so each place reads a
 * handful of rows, not the thousands it holds (migration 0015).
 */

const MAX_KEYS = 6;
const PER_PLACE = 3;
const CATALOG_LIMIT = 80;
const LWIN_FROM = 1_000_000;
const LWIN_SPAN = 2_200_000;

const strings = (v: unknown, n = MAX_KEYS): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v.filter((x): x is string => typeof x === "string" && !!x.trim() && x.length <= 80).map((x) => x.trim()),
        ),
      ].slice(0, n)
    : [];

/** A small, stable hash: the same seed and place give the same sample. */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

interface CatalogRow {
  id: string;
  name: string;
  color: string;
  area: string | null;
  appellation: string | null;
  grapes: string | null;
  lwin: number | null;
  producer: string;
  country: string | null;
  region: string | null;
  review_year: number | null;
  review: string | null;
}

interface LwinRow {
  lwin: number;
  producer: string;
  wine: string;
  color: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
}

const parseJson = <T>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

const isColor = (c: unknown): c is WineColor => (COLORS as readonly unknown[]).includes(c);

export const recsRoutes = new Hono<{ Bindings: Env }>();

recsRoutes.post("/recs", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  const body = await readJson(c.req.raw);
  const grapes = strings(body.grapes);
  const regions = strings(body.regions, 4);
  const areas = strings(body.areas, 4);
  const producers = strings(body.producers, 3);
  const st = body.stretch && typeof body.stretch === "object" ? (body.stretch as Record<string, unknown>) : null;
  const stretch =
    st && typeof st.grape === "string" && st.grape.length <= 60
      ? { grape: st.grape, places: strings(st.places, 4), color: isColor(st.color) ? st.color : null }
      : null;
  const seed = typeof body.seed === "number" && Number.isFinite(body.seed) ? Math.floor(body.seed) : 0;
  const db = c.env.DB;

  // ── The shared catalogue ──
  const conds: string[] = [];
  const binds: (string | number)[] = [];
  const inList = (col: string, vals: string[]) => {
    if (!vals.length) return;
    conds.push(`${col} IN (${vals.map(() => "?").join(",")})`);
    binds.push(...vals);
  };
  const allGrapes = [...new Set([...grapes, ...(stretch ? [stretch.grape] : [])])];
  if (allGrapes.length) {
    conds.push(`EXISTS (SELECT 1 FROM json_each(w.grapes) g WHERE g.value IN (${allGrapes.map(() => "?").join(",")}))`);
    binds.push(...allGrapes);
  }
  inList("p.region", regions);
  inList("w.area", areas);
  inList("p.name", producers);
  const stretchApps = stretch?.places.filter((p) => !p.startsWith("region:")) ?? [];
  inList("w.appellation", stretchApps);
  // Wines others typed in are suggested only once vouched for (data.ts trustedWine).
  const trusted = trustedWine(c.env, "w", user.id);
  const catalog = conds.length
    ? (
        await db
          .prepare(
            `SELECT w.id, w.name, w.color, w.area, w.appellation, w.grapes, w.lwin, p.name AS producer, p.country, p.region,
               r.year AS review_year, r.data AS review
             FROM wines w JOIN producers p ON p.id = w.producer_id
             LEFT JOIN (
               SELECT v.wine_id, v.year, pr.data, row_number() OVER (PARTITION BY v.wine_id ORDER BY v.year DESC) AS k
               FROM vintages v JOIN pro_reviews pr ON pr.vintage_id = v.id AND pr.status = 'done' AND pr.data IS NOT NULL
             ) r ON r.wine_id = w.id AND r.k = 1
             WHERE (${conds.join(" OR ")}) AND ${trusted.sql}
               AND w.id NOT IN (
                 SELECT v.wine_id FROM tastings t JOIN vintages v ON v.id = t.vintage_id WHERE t.user_id = ?
                 UNION SELECT v.wine_id FROM cellar x JOIN vintages v ON v.id = x.vintage_id WHERE x.user_id = ?)
             ORDER BY r.data IS NULL, w.created_at DESC LIMIT ${CATALOG_LIMIT}`,
          )
          .bind(...binds, ...trusted.binds, user.id, user.id)
          .all<CatalogRow>()
      ).results
    : [];

  const out: Candidate[] = catalog.map((w) => {
    const review = parseJson<ProReview>(w.review);
    const gs = parseJson<string[]>(w.grapes) ?? [];
    return {
      key: w.id,
      source: "catalog",
      wineId: w.id,
      lwin: w.lwin,
      producer: w.producer,
      wine: w.name,
      color: isColor(w.color) ? w.color : null,
      country: w.country,
      region: w.region,
      area: w.area,
      appellation: w.appellation,
      grapes: gs,
      year: review ? w.review_year : null,
      critic: review ? criticAverage(review.critics ?? []) : null,
      community: review?.community?.avg ?? null,
      stretch:
        !!stretch &&
        (gs.includes(stretch.grape) || (!!w.appellation && stretchApps.includes(w.appellation))) &&
        !grapes.some((g) => gs.includes(g)),
    };
  });

  // ── LWIN ──
  const places: { col: "appellation" | "region"; value: string; stretch: boolean }[] = [];
  for (const a of areas) {
    places.push({ col: "appellation", value: a, stretch: false });
    if (areaNamed(a))
      for (const x of appellationsIn(null, a).slice(0, 3))
        places.push({ col: "appellation", value: x, stretch: false });
  }
  for (const r of regions) places.push({ col: "region", value: r, stretch: false });
  for (const p of stretch?.places ?? [])
    places.push(
      p.startsWith("region:")
        ? { col: "region", value: p.slice(7), stretch: true }
        : { col: "appellation", value: p, stretch: true },
    );
  const unique = [...new Map(places.map((p) => [`${p.col}:${p.value}`, p])).values()].slice(0, 16);
  if (unique.length) {
    const mine = await db
      .prepare(
        `SELECT DISTINCT w.lwin FROM wines w JOIN vintages v ON v.wine_id = w.id
         WHERE w.lwin IS NOT NULL AND v.id IN (SELECT vintage_id FROM tastings WHERE user_id = ?1 UNION SELECT vintage_id FROM cellar WHERE user_id = ?1)`,
      )
      .bind(user.id)
      .all<{ lwin: number }>();
    const have = new Set([...mine.results.map((r) => r.lwin), ...catalog.map((w) => w.lwin).filter((x) => x !== null)]);
    const cols = "lwin, producer, wine, color, country, region, appellation";
    const stmts = unique.flatMap((p) => {
      const start = LWIN_FROM + (hash(`${seed}:${p.col}:${p.value}`) % LWIN_SPAN);
      // Colour must be known; a stretch place also has to be the stretch's colour (Sancerre is not all white).
      const colour = p.stretch && stretch?.color ? "AND color = ?3" : "AND color IS NOT NULL";
      const extra = p.stretch && stretch?.color ? [stretch.color] : [];
      return [
        db
          .prepare(
            `SELECT ${cols} FROM lwin WHERE ${p.col} = ?1 AND lwin >= ?2 ${colour} ORDER BY lwin LIMIT ${PER_PLACE}`,
          )
          .bind(p.value, start, ...extra),
        db
          .prepare(
            `SELECT ${cols} FROM lwin WHERE ${p.col} = ?1 AND lwin > 0 AND lwin < ?2 ${colour} ORDER BY lwin LIMIT ${PER_PLACE}`,
          )
          .bind(p.value, start, ...extra),
      ];
    });
    const res = await db.batch<LwinRow>(stmts);
    unique.forEach((p, i) => {
      const rows = [...(res[i * 2]?.results ?? []), ...(res[i * 2 + 1]?.results ?? [])].slice(0, PER_PLACE);
      for (const r of rows) {
        if (have.has(r.lwin)) continue;
        have.add(r.lwin);
        const place = tidyPlace({ country: r.country, region: r.region, appellation: r.appellation });
        out.push({
          key: `lwin:${r.lwin}`,
          source: "lwin",
          wineId: null,
          lwin: r.lwin,
          producer: r.producer,
          wine: r.wine,
          color: isColor(r.color) ? r.color : null,
          country: place.country,
          region: place.region,
          area: place.area,
          appellation: place.appellation,
          grapes: p.stretch && stretch ? [stretch.grape] : [],
          year: null,
          critic: null,
          community: null,
          stretch: p.stretch,
        });
      }
    });
  }
  return c.json({ candidates: out });
});
