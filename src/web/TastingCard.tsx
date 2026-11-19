import { useEffect, useRef, useState } from "preact/hooks";
import { glassColor, tastingNote } from "../shared/guide";
import { grapeName } from "../shared/grapes";
import { type Lang, type Tasting, type VintageInfo, yearLabel } from "../shared/model";
import { placePath } from "../shared/place";
import { PROSE_MAX, tastingFacts, wineFacts, wrap } from "../shared/prose";
import { RING_PATH } from "./Logo";
import { drawLogo } from "./Sharing";
import { Field, Sheet } from "./components";
import { currentLang, fmtDate, t, tm } from "./i18n";
import { shrink } from "./photo";
import { ApiError, api, useStore } from "./store";

/**
 * 分享图: one tasting as a picture to post — the wine, where it comes from, the note written up in a
 * critic's voice (by Claude, from what was recorded; the person can edit it) and the score. Drawn on
 * a canvas in the phone, so it works for any wine and the words are exactly what the person approved.
 */

export type CardTheme = "paper" | "cellar";
export type CardSize = "4:5" | "9:16";
/** 酒标 on the card: none, one of the drawn designs, or a photo of the bottle. */
export type LabelChoice = "none" | "classic" | "modern" | "photo";

export interface CardData {
  v: VintageInfo;
  x: Tasting;
  /** The note on the card. */
  prose: string;
  /** Country, 产区, 大区, 子产区, in the reader's language. */
  places: string[];
  taster: string | null;
  lang: Lang;
  theme: CardTheme;
  size: CardSize;
  label: LabelChoice;
  /** The photo when `label` is "photo" (decoded); without it no label is drawn. */
  photo?: ImageBitmap | HTMLImageElement | null;
}

const W = 1080;
const PAD = 96;

const THEMES = {
  paper: {
    bg: ["#f8f2ea", "#efe4d8"],
    ink: "#2a1a1d",
    ink2: "#4a383c",
    muted: "rgba(42,26,29,0.55)",
    brass: "#8a6a33",
    accent: "#6d1a2a",
    grain: "42,26,29",
    stain: 0.2,
  },
  cellar: {
    bg: ["#3a0f1a", "#170e10"],
    ink: "#fff7f2",
    ink2: "rgba(255,247,242,0.86)",
    muted: "rgba(255,247,242,0.55)",
    brass: "#d1ad6c",
    accent: "#d1ad6c",
    grain: "255,247,242",
    stain: 0.3,
  },
} as const;

/** A little random that is the same every time, so the paper does not shimmer between redraws. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** The 杯痕 ring, large and faint, in the colour of this wine: the glass that stood on the page. */
function drawStain(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number) {
  const ring = new Path2D(RING_PATH);
  const ghost = new Path2D();
  ghost.addPath(
    ring,
    new DOMMatrix().translate(6.5, -5.5).translate(32, 32).rotate(140).scale(0.93).translate(-32, -32),
  );
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.4;
  ctx.fill(ghost, "evenodd");
  ctx.globalAlpha = alpha;
  ctx.fill(ring, "evenodd");
  ctx.beginPath();
  ctx.ellipse(54.5, 54, 2.3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

type Fonts = { sans: string; serif: string };

/** A soft shadow under whatever is drawn next, as if the label sat on the page. */
function lift(ctx: CanvasRenderingContext2D, dark: boolean) {
  ctx.shadowColor = dark ? "rgba(0,0,0,0.55)" : "rgba(42,26,29,0.28)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;
}
function unlift(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Text centred at (cx, y), shrunk from `size` until it fits `max` px wide (at most `lines` lines). */
function centred(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  max: number,
  font: (size: number) => string,
  size: number,
  lines = 2,
  lh = 1.15,
): number {
  let out: string[] = [];
  let s = size;
  for (; s >= size * 0.55; s -= 2) {
    ctx.font = font(s);
    out = wrap((t) => ctx.measureText(t).width, text, max);
    if (out.length <= lines) break;
  }
  out = out.slice(0, lines);
  ctx.textAlign = "center";
  for (const line of out) {
    ctx.fillText(line, cx, y);
    y += Math.round(s * lh);
  }
  ctx.textAlign = "left";
  return y;
}

/** 经典: a cream paper label with a double rule, set like an old Bordeaux label — only the wine's own facts. */
function drawClassicLabel(ctx: CanvasRenderingContext2D, d: CardData, w: number, h: number, f: Fonts) {
  const { v } = d;
  const ink = "#2b1d18";
  const gold = "#9a7a3c";
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#f7efdc");
  bg.addColorStop(1, "#eadcbc");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(22, 22, w - 44, h - 44);
  const cx = w / 2;
  const inner = w - 76;
  ctx.fillStyle = gold;
  // A small crest: two leaves and a stem, drawn, not a font glyph.
  ctx.save();
  ctx.translate(cx, h * 0.17);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 15, 0, 15, 7, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(-1.2, -2, 2.4, 22);
  ctx.restore();
  const same = v.wine.trim().toLowerCase() === v.producer.trim().toLowerCase();
  ctx.fillStyle = ink;
  let y = h * 0.32;
  y = centred(ctx, v.producer.toUpperCase(), cx, y, inner, (s) => `600 ${s}px ${f.serif}`, w * 0.085, 2, 1.12);
  ctx.fillStyle = gold;
  ctx.fillRect(cx - 30, y - w * 0.04, 60, 1.5);
  y += w * 0.05;
  if (!same) {
    ctx.fillStyle = ink;
    y = centred(ctx, v.wine, cx, y, inner, (s) => `italic 500 ${s}px ${f.serif}`, w * 0.1, 2, 1.1);
  }
  ctx.fillStyle = "#6d1a2a";
  ctx.font = `600 ${Math.round(w * 0.16)}px ${f.serif}`;
  ctx.textAlign = "center";
  ctx.fillText(yearLabel(v.year), cx, h * 0.8);
  ctx.textAlign = "left";
  const where = d.places.slice(-1)[0];
  if (where) {
    ctx.fillStyle = ink;
    centred(ctx, where.toUpperCase(), cx, h * 0.89, inner, (s) => `500 ${s}px ${f.sans}`, w * 0.045, 1);
  }
}

/** 现代: a block of the wine's own colour, big numerals, small caps. */
function drawModernLabel(ctx: CanvasRenderingContext2D, d: CardData, w: number, h: number, f: Fonts, color: string) {
  const { v } = d;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  const shade = ctx.createLinearGradient(0, 0, w, h);
  shade.addColorStop(0, "rgba(255,255,255,0.10)");
  shade.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  const light = /^#(?:[a-f0-9]{6})$/i.test(color) && luminance(color) > 0.55;
  const ink = light ? "#2a1a1d" : "#fff7f2";
  const pad = w * 0.1;
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.85;
  let y = pad + w * 0.06;
  ctx.font = `600 ${Math.round(w * 0.05)}px ${f.sans}`;
  for (const line of wrap((t) => ctx.measureText(t).width, v.producer.toUpperCase(), w - 2 * pad).slice(0, 2)) {
    ctx.fillText(line, pad, y);
    y += w * 0.065;
  }
  ctx.globalAlpha = 1;
  ctx.fillRect(pad, y - w * 0.02, w * 0.12, 2);
  y += w * 0.07;
  const same = v.wine.trim().toLowerCase() === v.producer.trim().toLowerCase();
  if (!same) {
    ctx.font = `600 ${Math.round(w * 0.105)}px ${f.serif}`;
    for (const line of wrap((t) => ctx.measureText(t).width, v.wine, w - 2 * pad).slice(0, 3)) {
      ctx.fillText(line, pad, y);
      y += w * 0.115;
    }
  }
  ctx.font = `700 ${Math.round(w * 0.3)}px ${f.sans}`;
  ctx.globalAlpha = 0.95;
  ctx.fillText(yearLabel(v.year), pad - w * 0.02, h - pad - w * 0.06);
  ctx.globalAlpha = 0.75;
  ctx.font = `500 ${Math.round(w * 0.042)}px ${f.sans}`;
  const where = d.places.slice(-2).join(" · ");
  if (where) ctx.fillText(wrap((t) => ctx.measureText(t).width, where, w - 2 * pad)[0] ?? "", pad, h - pad + w * 0.02);
  ctx.globalAlpha = 1;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The photo as a print taped onto the page: cropped to fill, with a white border and a strip of tape. */
function drawPhotoLabel(ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement, w: number, h: number) {
  ctx.fillStyle = "#fbf8f3";
  ctx.fillRect(0, 0, w, h);
  const b = Math.round(w * 0.05);
  const iw = w - 2 * b;
  const ih = h - 2 * b;
  const sw = img.width;
  const sh = img.height;
  const scale = Math.max(iw / sw, ih / sh);
  const cw = iw / scale;
  const ch = ih / scale;
  ctx.drawImage(img, (sw - cw) / 2, (sh - ch) / 2, cw, ch, b, b, iw, ih);
}

/** Draws the chosen label at (x, y), w × h, turned a little, and says whether it drew one. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  d: CardData,
  x: number,
  y: number,
  w: number,
  h: number,
  f: Fonts,
  color: string,
): boolean {
  if (d.label === "none" || (d.label === "photo" && !d.photo)) return false;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(((d.label === "photo" ? 3.5 : 2.5) * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  lift(ctx, d.theme === "cellar");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  unlift(ctx);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  if (d.label === "photo") drawPhotoLabel(ctx, d.photo!, w, h);
  else if (d.label === "classic") drawClassicLabel(ctx, d, w, h, f);
  else drawModernLabel(ctx, d, w, h, f, color);
  ctx.restore();
  if (d.label === "photo") {
    // A strip of washi tape across the top edge.
    ctx.save();
    ctx.translate(x + w / 2, y + 6);
    ctx.rotate((-4 * Math.PI) / 180);
    ctx.fillStyle = d.theme === "cellar" ? "rgba(209,173,108,0.55)" : "rgba(214,190,150,0.62)";
    ctx.fillRect(-w * 0.22, -18, w * 0.44, 36);
    ctx.restore();
  }
  return true;
}

export async function drawTastingCard(d: CardData): Promise<HTMLCanvasElement> {
  const H = d.size === "9:16" ? 1920 : 1350;
  const th = THEMES[d.theme];
  const zhTw = d.lang === "zh-TW";
  const sans = `-apple-system, "PingFang ${zhTw ? "TC" : "SC"}", "Noto Sans ${zhTw ? "TC" : "SC"}", "Noto Sans CJK ${zhTw ? "TC" : "SC"}", sans-serif`;
  const serif = `"Cormorant Garamond", "Songti ${zhTw ? "TC" : "SC"}", "Noto Serif ${zhTw ? "TC" : "SC"}", "Noto Serif CJK ${zhTw ? "TC" : "SC"}", Georgia, serif`;
  try {
    await Promise.all([
      document.fonts?.load(`600 64px "Cormorant Garamond"`),
      document.fonts?.load(`500 64px "Cormorant Garamond"`),
    ]);
  } catch {}
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const { v, x } = d;
  const wineColor = glassColor(v.color, x.appearance, v.year);

  // Paper (or the cellar wall), with a little grain.
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, th.bg[0]);
  bg.addColorStop(1, th.bg[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const rnd = seeded(x.id.split("").reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${th.grain},${(rnd() * 0.05).toFixed(3)})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
  }
  drawStain(ctx, W - 600, -170, 820, wineColor, th.stain);

  // Masthead: 杯痕 and the date.
  drawLogo(ctx, PAD, 78, 46, th.brass);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = th.brass;
  ctx.font = `600 30px ${sans}`;
  ctx.textAlign = "left";
  ctx.fillText(t("品酒日记"), PAD + 60, 112);
  ctx.textAlign = "right";
  ctx.font = `400 28px ${sans}`;
  ctx.fillStyle = th.muted;
  ctx.fillText(fmtDate(x.tastedAt), W - PAD, 112);
  ctx.textAlign = "left";

  // The label, top right, and the wine's name beside it.
  const tall = d.size === "9:16";
  const LW = tall ? 380 : 330;
  const LH = Math.round((LW * 4) / 3);
  const LY = tall ? 200 : 168;
  const hasLabel = drawLabel(ctx, d, W - PAD - LW + 8, LY, LW, LH, { sans, serif }, wineColor);
  const textMax = hasLabel ? W - 2 * PAD - LW - 36 : W - 2 * PAD;
  let y = tall ? 470 : 360;
  ctx.fillStyle = d.theme === "paper" ? th.accent : th.brass;
  ctx.font = `600 ${tall ? 200 : 168}px ${serif}`;
  ctx.fillText(yearLabel(v.year), PAD - 6, y);
  y += 70;
  const same = v.wine.trim().toLowerCase() === v.producer.trim().toLowerCase();
  if (!same) {
    ctx.fillStyle = th.ink2;
    ctx.font = `500 32px ${sans}`;
    for (const line of wrap((s) => ctx.measureText(s).width, v.producer, textMax).slice(0, 2)) {
      ctx.fillText(line, PAD, y);
      y += 44;
    }
    y += 34;
  } else y += 10;
  ctx.fillStyle = th.ink;
  ctx.font = `600 ${hasLabel ? 58 : 66}px ${serif}`;
  const nameLines = wrap((s) => ctx.measureText(s).width, same ? v.producer : v.wine, textMax).slice(
    0,
    hasLabel ? 3 : 2,
  );
  for (const line of nameLines) {
    ctx.fillText(line, PAD, y);
    y += hasLabel ? 66 : 74;
  }
  y += 4;
  if (d.places.length) {
    ctx.fillStyle = th.brass;
    ctx.font = `500 30px ${sans}`;
    for (const line of wrap((s) => ctx.measureText(s).width, d.places.join("  ·  "), textMax).slice(
      0,
      hasLabel ? 3 : 2,
    )) {
      ctx.fillText(line, PAD, y);
      y += 42;
    }
  }
  const grapes = v.grapes.map((g) => grapeName(g, d.lang)).join(" / ");
  if (grapes) {
    ctx.fillStyle = th.muted;
    ctx.font = `400 28px ${sans}`;
    ctx.fillText(wrap((s) => ctx.measureText(s).width, grapes, textMax)[0] ?? "", PAD, y);
    y += 40;
  }

  // A brass rule with the glass's colour on it, below the label too.
  y += 30;
  if (hasLabel) y = Math.max(y, LY + LH + 46);
  ctx.strokeStyle = th.brass;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(PAD + 90, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = wineColor;
  ctx.beginPath();
  ctx.arc(PAD + 116, y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = d.theme === "paper" ? "rgba(42,26,29,0.2)" : "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  y += 50;

  // The note, as large as fits.
  const footTop = H - (tall ? 300 : 240);
  const room = footTop - y - 30;
  const text = d.prose.trim();
  const cjk = /[㐀-鿿]/.test(text);
  let size = 44;
  let lines: string[] = [];
  let lh = 0;
  for (; size >= 26; size -= 2) {
    ctx.font = `${cjk ? 400 : 500} ${size}px ${serif}`;
    lh = Math.round(size * (cjk ? 1.78 : 1.45));
    lines = wrap((s) => ctx.measureText(s).width, text, W - 2 * PAD - 20);
    if (lines.length * lh <= room) break;
  }
  const maxLines = Math.max(1, Math.floor(room / lh));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/.$/u, "")}…`;
  }
  ctx.fillStyle = th.brass;
  ctx.globalAlpha = lines.length ? 0.45 : 0;
  ctx.font = `600 150px ${serif}`;
  ctx.fillText("“", PAD - 46, y + 80);
  ctx.globalAlpha = 1;
  ctx.fillStyle = th.ink2;
  ctx.font = `${cjk ? 400 : 500} ${size}px ${serif}`;
  y += Math.round(size * 1.05);
  for (const line of lines) {
    ctx.fillText(line, PAD + 20, y);
    y += lh;
  }

  // Foot: who tasted it, where, and the score.
  ctx.strokeStyle = th.brass;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, footTop);
  ctx.lineTo(W - PAD, footTop);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const base = footTop + 120;
  if (x.score !== null) {
    ctx.textAlign = "right";
    ctx.fillStyle = th.muted;
    ctx.font = `400 30px ${sans}`;
    const outOf = "/100";
    ctx.fillText(outOf, W - PAD, base);
    const ow = ctx.measureText(outOf).width;
    ctx.fillStyle = d.theme === "paper" ? th.accent : th.brass;
    ctx.font = `600 132px ${serif}`;
    ctx.fillText(String(x.score), W - PAD - ow - 10, base);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = th.ink;
  ctx.font = `500 32px ${sans}`;
  const by = d.taster ? t("{name} 品鉴", { name: d.taster }) : t("品鉴笔记");
  const left = W - 2 * PAD - (x.score !== null ? 300 : 0);
  ctx.fillText(wrap((s) => ctx.measureText(s).width, `— ${by}`, left)[0] ?? "", PAD, base - 44);
  const where = x.location?.name || null;
  if (where) {
    ctx.fillStyle = th.muted;
    ctx.font = `400 26px ${sans}`;
    ctx.fillText(wrap((s) => ctx.measureText(s).width, `📍 ${where}`, left)[0] ?? "", PAD, base + 2);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = th.muted;
  ctx.font = `400 22px ${sans}`;
  ctx.fillText(location.host, W / 2, H - 46);
  ctx.textAlign = "left";
  return canvas;
}

// ── The sheet ─────────────────────────────────────────────────────────────────────────────────

/** What a note was written from: when the tasting changes, an unedited note is written again. */
const signature = (v: VintageInfo, x: Tasting, lang: Lang) => JSON.stringify([lang, wineFacts(v), tastingFacts(x)]);

interface Saved {
  sig: string;
  prose: string;
  places: string[];
  edited: boolean;
  theme?: CardTheme;
  size?: CardSize;
  label?: LabelChoice;
}
const key = (id: string, lang: Lang) => `wine.prose.${id}.${lang}`;
function load(id: string, lang: Lang): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(key(id, lang)) ?? "null");
  } catch {
    return null;
  }
}
function keep(id: string, lang: Lang, s: Saved) {
  try {
    localStorage.setItem(key(id, lang), JSON.stringify(s));
  } catch {}
}

/** The note without AI: the sentence the answers add up to, and the person's own words. */
const plainNote = (v: VintageInfo, x: Tasting, lang: Lang) =>
  [
    tastingNote(
      lang,
      v.color,
      x.appearance,
      x.nose,
      x.palate,
      x.descriptors.map((d) => d.id),
    ),
    x.note?.trim(),
  ]
    .filter(Boolean)
    .join(lang === "en" ? ". " : "。")
    .replace(/([^。.!?！？])$/u, lang === "en" ? "$1." : "$1。");

export function TastingShareSheet(props: {
  v: VintageInfo;
  x: Tasting;
  onClose: () => void;
  /** A photo taken or picked here becomes the tasting's photo. */
  onPhoto: (photoId: string) => void;
}) {
  const { v, x } = props;
  const lang = currentLang();
  const me = useStore((s) => s.me);
  const sig = signature(v, x, lang);
  const first = load(x.id, lang);
  const ownPlaces = [v.country, ...placePath(v)].filter((p): p is string => !!p);
  const [prose, setProse] = useState(first?.prose ?? "");
  const [places, setPlaces] = useState<string[]>(first?.places?.length === ownPlaces.length ? first.places : ownPlaces);
  const [edited, setEdited] = useState(first?.edited ?? false);
  const [theme, setTheme] = useState<CardTheme>(first?.theme ?? "paper");
  const [size, setSize] = useState<CardSize>(first?.size ?? "4:5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [img, setImg] = useState("");
  const blob = useRef<Blob | null>(null);
  const [stale, setStale] = useState(!!first && first.sig !== sig);
  const [label, setLabel] = useState<LabelChoice>(first?.label ?? (x.photoId ? "photo" : "none"));
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // The tasting's own photo (拍酒标 or taken here before), fetched once.
  useEffect(() => {
    if (!x.photoId || photo) return;
    let off = false;
    fetch(`/api/photos/${x.photoId}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => createImageBitmap(b))
      .then((bm) => !off && setPhoto(bm))
      .catch(() => !off && setPhotoNote(t("这张照片现在打不开，可以重拍一张")));
    return () => {
      off = true;
    };
  }, [x.photoId]);

  const takePhoto = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    setPhotoNote("");
    try {
      const image = await shrink(f);
      const bm = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${image}`)).blob());
      setPhoto(bm);
      setLabel("photo");
      try {
        const r = await api<{ photoId: string }>("/api/photos", { body: { image } });
        props.onPhoto(r.photoId);
      } catch (e) {
        setPhotoNote(e instanceof ApiError ? tm(e.message) : t("照片先用在这张图上，没能存进笔记（需要联网）"));
      }
    } catch {
      setPhotoNote(t("这张照片打不开，换一张试试"));
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const write = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ note: string; places: string[] }>("/api/prose", {
        body: { wine: v, tasting: x, lang },
      });
      setProse(r.note);
      setPlaces(r.places.length === ownPlaces.length ? r.places : ownPlaces);
      setEdited(false);
      setStale(false);
    } catch (e) {
      setError(e instanceof ApiError ? tm(e.message) : t("没有网络，先用笔记里的文字"));
      setProse((p) => p || plainNote(v, x, lang));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    // Written before for this same note: show it. Otherwise ask Claude once (approved members only).
    if (first && (first.sig === sig || first.edited)) return;
    // Nothing recorded yet: there is nothing to write up, and the card goes without a note.
    if (me?.approved && tastingFacts(x).length) write();
    else setProse(plainNote(v, x, lang));
  }, []);

  useEffect(() => {
    if (prose || label !== "none") keep(x.id, lang, { sig, prose, places, edited, theme, size, label });
  }, [prose, places, edited, theme, size, label]);

  useEffect(() => {
    if (busy && !prose) return;
    let off = false;
    const id = setTimeout(async () => {
      const canvas = await drawTastingCard({
        v,
        x,
        prose,
        places,
        taster: me?.name ?? null,
        lang,
        theme,
        size,
        label,
        photo,
      });
      if (off) return;
      setImg(canvas.toDataURL("image/png"));
      canvas.toBlob((b) => {
        blob.current = b;
      }, "image/png");
    }, 250);
    return () => {
      off = true;
      clearTimeout(id);
    };
  }, [prose, places, theme, size, label, photo, busy]);

  const fileName = `${v.producer}${v.wine === v.producer ? "" : ` ${v.wine}`} ${yearLabel(v.year)}.png`.replace(
    /[\\/:*?"<>|]/g,
    "",
  );
  const file = () => (blob.current ? new File([blob.current], fileName, { type: "image/png" }) : null);
  const canShare = (() => {
    try {
      const f = new File([new Blob()], "x.png", { type: "image/png" });
      return !!navigator.canShare?.({ files: [f] });
    } catch {
      return false;
    }
  })();

  return (
    <Sheet title={t("分享这条笔记")} onClose={props.onClose}>
      <div class="form share-card">
        {img ? (
          <img class="list-card-img" src={img} alt={`${v.producer} ${yearLabel(v.year)}`} />
        ) : (
          <div class={`share-card-wait ${size === "9:16" ? "tall" : ""}`}>
            <span class="muted">{busy ? t("正在把你的笔记写成酒评…") : ""}</span>
          </div>
        )}
        <div class="share-card-opts">
          <div class="segmented" role="radiogroup" aria-label={t("样式")}>
            {(["paper", "cellar"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={theme === k}
                class={theme === k ? "on" : ""}
                onClick={() => setTheme(k)}
              >
                {k === "paper" ? t("浅色") : t("深色")}
              </button>
            ))}
          </div>
          <div class="segmented" role="radiogroup" aria-label={t("尺寸")}>
            {(["4:5", "9:16"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={size === k}
                class={size === k ? "on" : ""}
                onClick={() => setSize(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div class="segmented" role="radiogroup" aria-label={t("酒标")}>
          {(
            [
              ["none", t("不放酒标")],
              ["classic", t("经典")],
              ["modern", t("现代")],
              ["photo", t("照片")],
            ] as const
          ).map(([k, name]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={label === k}
              class={label === k ? "on" : ""}
              onClick={() => {
                setLabel(k);
                if (k === "photo" && !photo && !x.photoId) fileRef.current?.click();
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {label === "photo" && (
          <button type="button" class="link small" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
            {photoBusy ? t("处理中…") : photo || x.photoId ? t("换一张照片") : t("拍一张酒标，或从相册选")}
          </button>
        )}
        {(label === "classic" || label === "modern") && (
          <p class="muted small">{t("设计款酒标按这款酒的信息画出来，不是酒庄的真实酒标")}</p>
        )}
        {photoNote && <p class="small danger">{photoNote}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => takePhoto((e.target as HTMLInputElement).files?.[0])}
        />
        <Field label={t("酒评文字（可以改）")}>
          <textarea
            rows={6}
            maxLength={PROSE_MAX}
            value={prose}
            disabled={busy}
            placeholder={busy ? t("正在把你的笔记写成酒评…") : ""}
            onInput={(e) => {
              setProse((e.target as HTMLTextAreaElement).value);
              setEdited(true);
            }}
          />
        </Field>
        {error && <p class="small danger">{error}</p>}
        {stale && !busy && <p class="small muted">{t("这条笔记改过了，可以重新生成文字")}</p>}
        {me?.approved && (
          <button type="button" class="link small" disabled={busy} onClick={write}>
            {busy ? t("生成中…") : t("重新生成文字")}
          </button>
        )}
        <p class="muted small">{t("文字由 AI 根据你的笔记改写，只用你记下的内容，发出前请看一遍")}</p>
        {canShare && (
          <button
            type="button"
            class="button primary block"
            disabled={!img}
            onClick={() => {
              const f = file();
              if (f) navigator.share({ files: [f] }).catch(() => {});
            }}
          >
            {t("分享图片")}
          </button>
        )}
        <a class={`button block ${canShare ? "" : "primary"}`} href={img || undefined} download={fileName}>
          {t("保存图片")}
        </a>
        <p class="muted small center">{t("也可以长按图片保存")}</p>
      </div>
    </Sheet>
  );
}
