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
import { ApiError, api, useStore } from "./store";

/**
 * 分享图: one tasting as a picture to post — the wine, where it comes from, the note written up in a
 * critic's voice (by Claude, from what was recorded; the person can edit it) and the score. Drawn on
 * a canvas in the phone, so it works for any wine and the words are exactly what the person approved.
 */

export type CardTheme = "paper" | "cellar";
export type CardSize = "4:5" | "9:16";

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

  // The wine.
  const tall = d.size === "9:16";
  let y = tall ? 470 : 360;
  ctx.fillStyle = d.theme === "paper" ? th.accent : th.brass;
  ctx.font = `600 ${tall ? 200 : 168}px ${serif}`;
  ctx.fillText(yearLabel(v.year), PAD - 6, y);
  y += 70;
  const same = v.wine.trim().toLowerCase() === v.producer.trim().toLowerCase();
  if (!same) {
    ctx.fillStyle = th.ink2;
    ctx.font = `500 32px ${sans}`;
    for (const line of wrap((s) => ctx.measureText(s).width, v.producer, W - 2 * PAD).slice(0, 2)) {
      ctx.fillText(line, PAD, y);
      y += 44;
    }
    y += 34;
  } else y += 10;
  ctx.fillStyle = th.ink;
  ctx.font = `600 66px ${serif}`;
  const nameLines = wrap((s) => ctx.measureText(s).width, same ? v.producer : v.wine, W - 2 * PAD).slice(0, 2);
  for (const line of nameLines) {
    ctx.fillText(line, PAD, y);
    y += 74;
  }
  y += 4;
  if (d.places.length) {
    ctx.fillStyle = th.brass;
    ctx.font = `500 30px ${sans}`;
    for (const line of wrap((s) => ctx.measureText(s).width, d.places.join("  ·  "), W - 2 * PAD).slice(0, 2)) {
      ctx.fillText(line, PAD, y);
      y += 42;
    }
  }
  const grapes = v.grapes.map((g) => grapeName(g, d.lang)).join(" / ");
  if (grapes) {
    ctx.fillStyle = th.muted;
    ctx.font = `400 28px ${sans}`;
    ctx.fillText(wrap((s) => ctx.measureText(s).width, grapes, W - 2 * PAD)[0] ?? "", PAD, y);
    y += 40;
  }

  // A brass rule with the glass's colour on it.
  y += 30;
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
  ctx.globalAlpha = 0.45;
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

export const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M12 15V4m0 0L8 8m4-4 4 4M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

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

export function TastingShareSheet(props: { v: VintageInfo; x: Tasting; onClose: () => void }) {
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
      setError(e instanceof ApiError ? tm(e.message) : t("没有网络，先用记录里的文字"));
      setProse((p) => p || plainNote(v, x, lang));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    // Written before for this same note: show it. Otherwise ask Claude once (approved members only).
    if (first && (first.sig === sig || first.edited)) return;
    if (me?.approved) write();
    else setProse(plainNote(v, x, lang));
  }, []);

  useEffect(() => {
    if (prose) keep(x.id, lang, { sig, prose, places, edited, theme, size });
  }, [prose, places, edited, theme, size]);

  useEffect(() => {
    if (!prose) return;
    let off = false;
    const id = setTimeout(async () => {
      const canvas = await drawTastingCard({ v, x, prose, places, taster: me?.name ?? null, lang, theme, size });
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
  }, [prose, places, theme, size]);

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
    <Sheet title={t("分享这条记录")} onClose={props.onClose}>
      <div class="form share-card">
        {img ? (
          <img class="list-card-img" src={img} alt={`${v.producer} ${yearLabel(v.year)}`} />
        ) : (
          <div class={`share-card-wait ${size === "9:16" ? "tall" : ""}`}>
            <span class="muted">{busy ? t("正在把你的记录写成酒评…") : ""}</span>
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
        <Field label={t("酒评文字（可以改）")}>
          <textarea
            rows={6}
            maxLength={PROSE_MAX}
            value={prose}
            disabled={busy}
            placeholder={busy ? t("正在把你的记录写成酒评…") : ""}
            onInput={(e) => {
              setProse((e.target as HTMLTextAreaElement).value);
              setEdited(true);
            }}
          />
        </Field>
        {error && <p class="small danger">{error}</p>}
        {stale && !busy && <p class="small muted">{t("这条记录改过了，可以重新生成文字")}</p>}
        {me?.approved && (
          <button type="button" class="link small" disabled={busy} onClick={write}>
            {busy ? t("生成中…") : t("重新生成文字")}
          </button>
        )}
        <p class="muted small">{t("文字由 AI 根据你的记录改写，只用你记下的内容，发出前请看一遍")}</p>
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
