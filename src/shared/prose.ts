import { DESCRIPTOR_BY_ID } from "./descriptors";
import {
  BODY_WORDS,
  COLOR_WORDS,
  DEPTH_WORDS,
  DEVELOPMENT_WORDS,
  FAULT_WORDS,
  FINISH_WORDS,
  HUE_WORDS,
  LEVEL_WORDS,
  MOUSSE_WORDS,
  QUALITY_WORDS,
  READINESS_WORDS,
  REASON_WORDS,
  SWEETNESS_WORDS,
  TEXTURE_WORDS,
} from "./guide";
import type { Lang, Tasting, VintageInfo } from "./model";
import { placePath } from "./place";

/**
 * 分享图 (品鉴记录 → 图片): what the person recorded, as plain English facts for the model that writes
 * the critic-style note (src/worker/prose.ts). Only fields the person filled in appear, so the model
 * has nothing else to work from. Read-only and forgiving: anything unknown is left out.
 */

/** The parts of a tasting the note is written from (what the phone sends to /api/prose). */
export type ProseTasting = Pick<
  Tasting,
  "appearance" | "nose" | "palate" | "extra" | "descriptors" | "quality" | "score" | "note"
>;
export type ProseWine = Pick<
  VintageInfo,
  "producer" | "wine" | "year" | "color" | "country" | "region" | "area" | "appellation" | "grapes" | "abv"
>;

/** The longest note (and person's own words) we accept or keep, in characters. */
export const PROSE_MAX = 600;

const en = (table: Record<string, { en: string }>, key: unknown) =>
  typeof key === "string" && table[key] ? table[key]!.en : null;
const at = (table: { en: string }[], v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= table.length ? table[v - 1]!.en : null;
const words = (ids: unknown) =>
  (Array.isArray(ids) ? ids : [])
    .map((d) => (typeof d === "string" ? d : (d as { id?: unknown })?.id))
    .map((id) => (typeof id === "string" ? DESCRIPTOR_BY_ID.get(id)?.name.en : undefined))
    .filter((w): w is string => !!w)
    .slice(0, 12);

/** The wine's own facts: what it is, not how it tasted. */
export function wineFacts(v: ProseWine): string[] {
  const out: string[] = [];
  const name = v.wine.trim().toLowerCase() === v.producer.trim().toLowerCase() ? v.producer : `${v.producer} ${v.wine}`;
  out.push(`Wine: ${name} ${v.year ? v.year : "NV"}`);
  if (COLOR_WORDS[v.color]) out.push(`Style: ${COLOR_WORDS[v.color].en}`);
  const where = [v.country, ...placePath({ region: v.region, area: v.area, appellation: v.appellation })].filter(
    Boolean,
  );
  if (where.length) out.push(`From: ${where.join(" > ")}`);
  if (v.grapes.length) out.push(`Grapes: ${v.grapes.slice(0, 8).join(", ")}`);
  if (v.abv) out.push(`Alcohol: ${v.abv}%`);
  return out;
}

/** What the person noticed, one line per thing, in WSET terms. Empty when nothing was recorded. */
export function tastingFacts(x: ProseTasting): string[] {
  const out: string[] = [];
  const a = x.appearance ?? {};
  const look = [
    a.clarity === "hazy" ? "hazy" : null,
    at(DEPTH_WORDS, a.intensity),
    en(HUE_WORDS, a.hue),
    a.rim ? "with a watery/developed rim" : null,
    a.legs ? "visible legs" : null,
    a.sediment ? "some sediment" : null,
  ].filter(Boolean);
  if (look.length) out.push(`Appearance: ${look.join(", ")}`);

  const n = x.nose ?? {};
  const aromas = [
    ...words(x.descriptors).map((w, i) => {
      const s = (x.descriptors[i] as { intensity?: number })?.intensity;
      return s === 3 ? `${w} (prominent)` : s === 1 ? `${w} (faint)` : w;
    }),
    ...(Array.isArray(n.custom) ? n.custom : [])
      .filter((c): c is string => typeof c === "string" && !!c.trim())
      .slice(0, 6)
      .map((c) => c.trim().slice(0, 40)),
  ];
  const nose = [
    n.condition === "unclean" ? "unclean" : null,
    at(LEVEL_WORDS, n.intensity) && `${at(LEVEL_WORDS, n.intensity)} intensity`,
    en(DEVELOPMENT_WORDS, n.development),
  ].filter(Boolean);
  if (nose.length) out.push(`Nose: ${nose.join(", ")}`);
  if (aromas.length) out.push(`Aromas: ${aromas.join("; ")}`);

  const p = x.palate ?? {};
  const pal = [
    at(SWEETNESS_WORDS, p.sweetness),
    at(LEVEL_WORDS, p.acidity) && `${at(LEVEL_WORDS, p.acidity)} acidity`,
    at(LEVEL_WORDS, p.tannin) &&
      `${at(LEVEL_WORDS, p.tannin)} tannin${en(TEXTURE_WORDS, p.tanninTexture) ? ` (${en(TEXTURE_WORDS, p.tanninTexture)})` : ""}`,
    at(LEVEL_WORDS, p.alcohol) && `${at(LEVEL_WORDS, p.alcohol)} alcohol`,
    at(BODY_WORDS, p.body) && `${at(BODY_WORDS, p.body)} body`,
    at(LEVEL_WORDS, p.flavour) && `${at(LEVEL_WORDS, p.flavour)} flavour intensity`,
    en(MOUSSE_WORDS, p.mousse) && `${en(MOUSSE_WORDS, p.mousse)} mousse`,
    at(FINISH_WORDS, p.finish) &&
      `${at(FINISH_WORDS, p.finish)} finish${typeof p.finishSeconds === "number" && p.finishSeconds > 0 ? ` (about ${Math.round(p.finishSeconds)} seconds)` : ""}`,
  ].filter(Boolean);
  if (pal.length) out.push(`Palate: ${pal.join(", ")}`);
  const flavours = words(p.flavours);
  if (flavours.length) out.push(`Flavours on the palate: ${flavours.join("; ")}`);

  const e = x.extra ?? {};
  const faults = (Array.isArray(e.faults) ? e.faults : []).map((f) => en(FAULT_WORDS, f)).filter(Boolean);
  if (faults.length) out.push(`Faults noticed: ${faults.join(", ")}`);
  const quality = en(QUALITY_WORDS, x.quality);
  const reasons = (Array.isArray(e.reasons) ? e.reasons : []).map((r) => en(REASON_WORDS, r)).filter(Boolean);
  if (quality) out.push(`Quality: ${quality}${reasons.length ? ` (because of its ${reasons.join(", ")})` : ""}`);
  const ready = en(READINESS_WORDS, e.readiness);
  if (ready) out.push(`Readiness: ${ready}`);
  const year = (v: unknown) => (typeof v === "number" && v >= 1900 && v <= 2200 ? v : null);
  if (year(e.drinkFrom) || year(e.drinkTo))
    out.push(`Drinking window: ${year(e.drinkFrom) ?? "now"}–${year(e.drinkTo) ?? ""}`);
  if (typeof e.decantMinutes === "number" && e.decantMinutes > 0) out.push(`Decanted: ${e.decantMinutes} minutes`);
  if (typeof e.dayOpen === "number" && e.dayOpen > 1) out.push(`Tasted on day ${e.dayOpen} after opening`);
  const note = typeof x.note === "string" ? x.note.trim().slice(0, PROSE_MAX) : "";
  if (note) out.push(`Taster's own words (may be in any language): «${note}»`);
  return out;
}

/** The language the note is written in, as the model is told. */
export const PROSE_LANG: Record<Lang, string> = {
  "zh-CN": "Simplified Chinese (mainland wording)",
  "zh-TW": "Traditional Chinese, Taiwan wine vocabulary (品飲, 單寧, 酒體, 餘韻, 香氣)",
  en: "English",
};

/** Characters that may not start a line (and the opening ones that may not end one). */
const NO_START = new Set([..."，。、；：！？）」』》〉”’,.;:!?)%…·"]);
const NO_END = new Set([..."（「『《〈“‘("]);

/**
 * Lines of at most `max` px: Latin words stay whole, CJK breaks between characters, and closing
 * punctuation never starts a line.
 */
export function wrap(measure: (s: string) => number, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    const tokens = para.match(/[A-Za-zÀ-ÿ0-9'’\-–]+[,.;:!?%)]*|\s+|./gu) ?? [];
    let line = "";
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      const next = line + tok;
      if (!line || measure(next.trimEnd()) <= max) {
        line = next;
        continue;
      }
      if (/^\s+$/.test(tok)) {
        out.push(line.trimEnd());
        line = "";
        continue;
      }
      // Pull the last character down with a closing mark, or push an opening one down.
      if (NO_START.has(tok[0]!) && line.length > 1) {
        const last = line.slice(-1);
        out.push(line.slice(0, -1).trimEnd());
        line = last + tok;
      } else if (NO_END.has(line.slice(-1)) && line.length > 1) {
        out.push(line.slice(0, -1).trimEnd());
        line = line.slice(-1) + tok;
      } else {
        out.push(line.trimEnd());
        line = tok.trimStart();
      }
    }
    if (line.trim()) out.push(line.trimEnd());
  }
  return out;
}
