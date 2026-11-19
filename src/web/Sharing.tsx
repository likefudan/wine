import { shownVintage } from "../shared/blind";
import { Face } from "./Profile";
import { useEffect, useState } from "preact/hooks";
import { DESCRIPTOR_BY_ID } from "../shared/descriptors";
import { glassColor, tastingNote } from "../shared/guide";
import type { Board, BoardItem, BoardNote, Visibility } from "../shared/model";
import { RING_PATH } from "./Logo";
import { Choice, Field, Glass, Sheet, WineName } from "./components";
import { ask } from "./confirm";
import { DEPTH_INFO } from "./depths";
import { currentLang, fmtDate, p, t, tm } from "./i18n";
import { ApiError, getState, removeMember, shareList } from "./store";

/**
 * 分享与共同评价 on the phone (docs/design.zh.md §3.6): the QR code and the owner's switches, everyone's
 * notes on one wine, and the 酒单卡片 picture to send on WeChat. All of it needs the network; the
 * server decides what 先评后看 lets me see.
 */

export const joinLink = (b: Board) =>
  `${location.origin}/l/${b.list.id}${b.key && b.list.joinOpen ? `?k=${encodeURIComponent(b.key)}` : ""}`;

/** Whether everyone's notes are open to everyone (先评后看 off, or revealed). */
export const notesOpen = (b: Board) => !b.list.blind || !!b.list.revealedAt;

const errorText = (e: unknown) => (e instanceof ApiError ? tm(e.message) : t("没有网络，分享要联网才能用"));

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function useQr(text: string | null): string {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!text) return setSrc("");
    // Loaded on demand: only the share sheet draws QR codes.
    import("qrcode")
      .then((QR) => QR.toDataURL(text, { width: 480, margin: 1, color: { dark: "#2a1a1d", light: "#ffffff" } }))
      .then(setSrc, () => setSrc(""));
  }, [text]);
  return src;
}

export const Initial = (props: { name: string; picture: string | null }) => (
  <Face name={props.name} picture={props.picture} class="small" />
);

/** 分享: the QR code for friends at the table, and (for the owner) who may see and when notes open. */
export function ShareSheet(props: { board: Board; onChange: (b: Board) => void; onClose: () => void }) {
  const b = props.board;
  const link = joinLink(b);
  const qr = useQr(link);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const change = async (c: Parameters<typeof shareList>[1]) => {
    setBusy(true);
    setError("");
    try {
      props.onChange(await shareList(b.list.id, c));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const setVisibility = async (v: Visibility) => {
    if (v === b.list.visibility) return;
    if (
      v === "public" &&
      !(await ask(
        t("公开后，拿到链接的人不用登录就能看到品鉴里的酒和成员的名字；揭晓后还能看到大家的评分和笔记。确定公开？"),
        { danger: false },
      ))
    )
      return;
    void change({ visibility: v });
  };
  const blindLine = !b.list.blind
    ? t("先评后看已关：大家随时能看到彼此的评分")
    : b.list.revealedAt
      ? t("已揭晓：大家都能看到所有人的评分和笔记")
      : t("先评后看：每款酒交了自己的评价后，才能看到别人的分");

  return (
    <Sheet title={t("分享品鉴")} onClose={props.onClose}>
      <div class="form share">
        {b.list.joinOpen ? (
          <>
            <p class="lead">{t("同行的朋友扫这个码，用 Google 登录后就能加入，一起记录和评分。")}</p>
            {qr && <img class="qr" src={qr} alt={t("二维码")} width={240} height={240} />}
          </>
        ) : (
          <p class="notice">{t("已停止扫码加入。")}</p>
        )}
        <div class="share-actions">
          <button
            type="button"
            class="button"
            onClick={async () => {
              if (await copy(link)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
          >
            {copied ? t("已复制") : t("复制链接")}
          </button>
          {"share" in navigator && (
            <button
              type="button"
              class="button"
              onClick={() => navigator.share({ title: b.list.title, url: link }).catch(() => {})}
            >
              {t("发送…")}
            </button>
          )}
          <button
            type="button"
            class="button"
            onClick={async () => {
              setCard(await drawListCard(b).catch(() => null));
            }}
          >
            {t("品鉴卡片")}
          </button>
        </div>
        <p class="muted small">{blindLine}</p>

        {b.owner && (
          <>
            <Field label={t("谁能看")} group>
              <Choice
                label={t("谁能看")}
                value={b.list.visibility}
                clearable={false}
                options={[
                  { value: "private" as const, label: t("私密：只有成员") },
                  { value: "public" as const, label: t("公开：有链接就能看") },
                ]}
                onChange={(v) => v && setVisibility(v)}
              />
            </Field>
            <Field label={t("先评后看")} group hint={t("开着时，每款酒要先交自己的评价才能看到别人的，避免被带偏。")}>
              <Choice
                label={t("先评后看")}
                value={b.list.blind ? "on" : "off"}
                clearable={false}
                options={[
                  { value: "on", label: t("开") },
                  { value: "off", label: t("关") },
                ]}
                onChange={(v) => v && void change({ blind: v === "on" })}
              />
            </Field>
            {b.list.blind && (
              <button
                type="button"
                class="button"
                disabled={busy}
                onClick={() => void change({ revealed: !b.list.revealedAt })}
              >
                {b.list.revealedAt ? t("取消揭晓") : t("揭晓：让大家都看到所有评分")}
              </button>
            )}
            <Field label={t("扫码加入")} group>
              <Choice
                label={t("扫码加入")}
                value={b.list.joinOpen ? "on" : "off"}
                clearable={false}
                options={[
                  { value: "on", label: t("允许") },
                  { value: "off", label: t("停止") },
                ]}
                onChange={(v) => v && void change({ joinOpen: v === "on" })}
              />
            </Field>
            <button
              type="button"
              class="link small"
              disabled={busy}
              onClick={async () =>
                (await ask(t("换一个二维码？旧的二维码和链接会立即失效。"))) && void change({ newKey: true })
              }
            >
              {t("换一个二维码")}
            </button>
          </>
        )}
        {error && (
          <p class="notice" role="alert">
            {error}
          </p>
        )}

        <h3 class="sub-title">{t("成员（{n}）", { n: b.memberCount })}</h3>
        <ul class="members">
          {b.members.map((m) => (
            <li key={m.id}>
              <Initial name={m.name || t("品鉴者")} picture={m.picture} />
              <span>
                {m.name || t("品鉴者")}
                {m.owner ? <span class="muted small"> · {t("主持人")}</span> : null}
                {m.id === getState().me?.id ? <span class="muted small"> · {t("我")}</span> : null}
              </span>
              {b.owner && !m.owner && (
                <button
                  type="button"
                  class="link danger small"
                  onClick={async () => {
                    if (!(await ask(t("把 {name} 移出这次品鉴？TA 自己的笔记不会被删除。", { name: m.name })))) return;
                    try {
                      props.onChange(await removeMember(b.list.id, m.id));
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  {t("移出")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {card && <CardSheet src={card} title={b.list.title} onClose={() => setCard(null)} />}
    </Sheet>
  );
}

function CardSheet(props: { src: string; title: string; onClose: () => void }) {
  return (
    <Sheet title={t("品鉴卡片")} onClose={props.onClose}>
      <div class="form">
        <img class="list-card-img" src={props.src} alt={props.title} />
        <p class="muted small center">{t("长按图片保存，发到微信")}</p>
        <a class="button" href={props.src} download={`${props.title}.png`}>
          {t("下载图片")}
        </a>
      </div>
    </Sheet>
  );
}

/** One person's note as the others see it. */
function NoteView(props: { n: BoardNote; item: BoardItem }) {
  const { n, item } = props;
  const lang = currentLang();
  const sentence = tastingNote(lang, shownVintage(item).color, n.appearance, n.nose, n.palate, n.descriptors);
  return (
    <li class={n.mine ? "note mine" : "note"}>
      <div class="note-head">
        <Initial name={n.name || t("品鉴者")} picture={n.picture} />
        <strong>{n.mine ? t("我") : n.name || t("品鉴者")}</strong>
        <span class="muted small">{t(DEPTH_INFO[n.depth]?.name ?? "快记")}</span>
        <span class="row-score num">{n.score ?? "–"}</span>
      </div>
      {sentence && <p class="note-sentence">{sentence}</p>}
      {n.descriptors.length > 0 && !sentence && (
        <p class="muted small">
          {n.descriptors
            .map((id) => DESCRIPTOR_BY_ID.get(id))
            .filter((d) => !!d)
            .map((d) => p(d!.name))
            .join(" · ")}
        </p>
      )}
      {n.note && <p class="note-text">“{n.note}”</p>}
      {n.buyAgain !== null && <p class="muted small">{n.buyAgain ? t("还会买") : t("不会再买")}</p>}
    </li>
  );
}

/** 大家的评价 on one wine; while 先评后看 hides them, says how to open them. */
export function EveryoneSheet(props: { item: BoardItem; onTaste: () => void; onClose: () => void }) {
  const { item } = props;
  return (
    <Sheet title={t("大家的评价")} onClose={props.onClose}>
      <div class="form">
        <div class="row static">
          <Glass color={glassColor(shownVintage(item).color, undefined, shownVintage(item).year)} />
          <WineName v={shownVintage(item)} />
          {item.avg !== null && <span class="row-score num">{item.avg}</span>}
        </div>
        {!item.open ? (
          <>
            <p class="notice">
              {t("先评后看：已有 {n} 人评了这款酒。交了你自己的评分或笔记后，就能看到大家的。", { n: item.rated })}
            </p>
            <button type="button" class="button primary" onClick={props.onTaste}>
              {t("去记这款")}
            </button>
          </>
        ) : item.notes.length === 0 ? (
          <p class="empty">{t("还没有人评这款酒。")}</p>
        ) : (
          <ul class="notes">
            {item.notes.map((n) => (
              <NoteView key={n.userId} n={n} item={item} />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/** The wine whose scores differ most (at least two scores), for 「分歧最大」. */
export function mostDebated(items: BoardItem[]): string | null {
  let best: string | null = null;
  let spread = 0;
  for (const i of items) {
    const s = i.notes.map((n) => n.score).filter((x): x is number => x !== null);
    if (s.length < 2) continue;
    const d = Math.max(...s) - Math.min(...s);
    if (d > spread) {
      spread = d;
      best = i.id;
    }
  }
  return spread >= 3 ? best : null;
}

// ── 酒单卡片 ────────────────────────────────────────────────────────────────────────────────

const W = 1080;
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/**
 * The 酒单卡片 (docs/design.zh.md §3.5): the list's wines as glasses of their colour, best first once
 * the scores are open (and marking the one people disagreed on most), and the QR code. While 先评后看
 * still hides the scores, the card shows the wines in pouring order and no score.
 */
export async function drawListCard(b: Board): Promise<string> {
  const QR = await import("qrcode");
  await document.fonts?.ready;
  const open = notesOpen(b);
  const items = open
    ? [...b.items].sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1) || x.position - y.position)
    : [...b.items].sort((x, y) => x.position - y.position);
  const shown = items.slice(0, 12);
  const debated = open ? mostDebated(b.items) : null;
  const ROW = 104;
  const H = 520 + shown.length * ROW + 420;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const lang = currentLang();
  const sans = `-apple-system, ${lang === "zh-TW" ? '"PingFang TC", "Noto Sans CJK TC"' : '"PingFang SC", "Noto Sans CJK SC"'}, sans-serif`;
  const serif = `"Cormorant Garamond", "Songti SC", "Noto Serif SC", Georgia, serif`;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#3a0f1a");
  bg.addColorStop(1, "#1a1113");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  drawLogo(ctx, 76, 70, 52, "#d1ad6c");
  ctx.fillStyle = "#d1ad6c";
  ctx.font = `600 34px ${sans}`;
  ctx.fillText(t("品酒日记"), 140, 110);
  ctx.fillStyle = "#fff7f2";
  ctx.font = `600 76px ${serif}`;
  ctx.fillText(fit(ctx, b.list.title, W - 160), 80, 210);
  ctx.fillStyle = "rgba(255,247,242,0.75)";
  ctx.font = `400 34px ${sans}`;
  const sub = [b.list.place?.name, b.list.startsOn ? fmtDate(b.list.startsOn) : null, t("{n} 人", { n: b.memberCount })]
    .filter(Boolean)
    .join(" · ");
  ctx.fillText(fit(ctx, sub, W - 160), 80, 270);
  // The glasses in pouring order, white to red.
  const glasses = [...b.items].sort((x, y) => x.position - y.position).slice(0, 14);
  glasses.forEach((i, n) =>
    drawGlass(ctx, 100 + n * 64, 350, 26, glassColor(shownVintage(i).color, undefined, shownVintage(i).year)),
  );

  let y = 460;
  ctx.font = `400 28px ${sans}`;
  ctx.fillStyle = "rgba(255,247,242,0.6)";
  ctx.fillText(open ? t("按大家的平均分排序") : t("先评后看：评分揭晓后再看"), 80, y);
  y += 30;
  shown.forEach((i, n) => {
    const top = y + n * ROW;
    ctx.fillStyle = n % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)";
    roundRect(ctx, 60, top, W - 120, ROW - 10, 20);
    ctx.fill();
    drawGlass(ctx, 120, top + 47, 24, glassColor(shownVintage(i).color, undefined, shownVintage(i).year));
    ctx.fillStyle = "#fff7f2";
    ctx.font = `600 36px ${serif}`;
    const v = shownVintage(i);
    const name = i.vintage
      ? `${v.producer}${v.wine.trim().toLowerCase() === v.producer.trim().toLowerCase() ? "" : ` ${v.wine}`}`
      : `${v.wine} · ${t("盲品")}`;
    ctx.fillText(fit(ctx, name, W - 420), 170, top + 46);
    ctx.fillStyle = "rgba(255,247,242,0.6)";
    ctx.font = `400 26px ${sans}`;
    const tags = [!i.vintage ? null : v.year === 0 ? "NV" : String(v.year), i.id === debated ? t("分歧最大") : null]
      .filter(Boolean)
      .join(" · ");
    ctx.fillText(tags, 170, top + 80);
    ctx.textAlign = "right";
    if (open && i.avg !== null) {
      ctx.fillStyle = n === 0 ? "#d1ad6c" : "#fff7f2";
      ctx.font = `600 52px ${serif}`;
      ctx.fillText(String(Math.round(i.avg)), W - 100, top + 62);
    } else if (i.rated) {
      ctx.fillStyle = "rgba(255,247,242,0.6)";
      ctx.font = `400 26px ${sans}`;
      ctx.fillText(t("{n} 人已评", { n: i.rated }), W - 100, top + 58);
    }
    ctx.textAlign = "left";
  });
  if (items.length > shown.length) {
    ctx.fillStyle = "rgba(255,247,242,0.6)";
    ctx.font = `400 28px ${sans}`;
    ctx.fillText(t("还有 {n} 款", { n: items.length - shown.length }), 80, y + shown.length * ROW + 30);
  }

  // The QR code on a white tile.
  const Q = 260;
  const qy = H - Q - 110;
  ctx.fillStyle = "#fff";
  roundRect(ctx, 80, qy - 20, Q + 40, Q + 40, 24);
  ctx.fill();
  const link = joinLink(b);
  const modules = QR.create(link, { errorCorrectionLevel: "M" }).modules;
  const cell = Q / modules.size;
  ctx.fillStyle = "#2a1a1d";
  for (let r = 0; r < modules.size; r++)
    for (let c = 0; c < modules.size; c++)
      if (modules.get(r, c)) ctx.fillRect(100 + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
  ctx.fillStyle = "#fff7f2";
  ctx.font = `600 40px ${sans}`;
  ctx.fillText(b.key && b.list.joinOpen ? t("扫码加入品鉴") : t("扫码查看品鉴"), 420, qy + 110);
  ctx.fillStyle = "rgba(255,247,242,0.6)";
  ctx.font = `400 28px ${sans}`;
  ctx.fillText(location.host, 420, qy + 160);
  return canvas.toDataURL("image/png");
}

/** The 杯痕 logo (see Logo.tsx) at (x, y), `size` px square. */
export function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const ring = new Path2D(RING_PATH);
  const ghost = new Path2D();
  // GHOST_TRANSFORM as a matrix: translate(6.5 -5.5) rotate(140 32 32), then scale(.93) about the centre.
  ghost.addPath(
    ring,
    new DOMMatrix().translate(6.5, -5.5).translate(32, 32).rotate(140).scale(0.93).translate(-32, -32),
  );
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.22;
  ctx.fill(ghost, "evenodd");
  ctx.globalAlpha = 0.88;
  ctx.fill(ring, "evenodd");
  ctx.beginPath();
  ctx.ellipse(54.5, 54, 2.3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGlass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
}
