import { useLocation, useRoute } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import {
  BLIND,
  type BlindScore,
  GUESS_COUNTRIES,
  GUESS_REGIONS,
  PRICE_BANDS,
  type Part,
  blindVintage,
  isBlindId,
  placeName,
  scoreGuess,
} from "../shared/blind";
import { grapeName } from "../shared/grapes";
import { COLOR_WORDS, glassColor } from "../shared/guide";
import { type Board, COLORS, type Tasting, type VintageInfo, type WineColor } from "../shared/model";
import { appellationsIn, areasIn } from "../shared/place";
import { GrapePicker } from "./GrapePicker";
import { SuggestInput } from "./SuggestInput";
import { BackIcon, Field, Glass, WineName } from "./components";
import { currentLang, p, t, tm } from "./i18n";
import {
  ApiError,
  blankTasting,
  fetchBoard,
  getState,
  nextBlindLabel,
  saveTasting,
  shareList,
  startBlind,
  useStore,
} from "./store";

/**
 * 盲品 (docs/design.zh.md §12): start a glass without its wine (BlindStart), guess at the end of the
 * tasting (GuessCard), then fill in the real wine and see how close the guesses came (AnswersPage,
 * BlindResult). The scoring is src/shared/blind.ts.
 */

// ── 开一杯盲品 ────────────────────────────────────────────────────────────────────────────────

/** /blind?list=: a label and the colour in the glass, then straight into the tasting. */
export function BlindStart() {
  const { route, query } = useLocation();
  const listId = query.list ?? null;
  const list = useStore((s) => (listId ? s.lists.find((l) => l.id === listId) : undefined));
  const me = useStore((s) => s.me);
  const [label, setLabel] = useState(() => nextBlindLabel(listId));
  const [color, setColor] = useState<WineColor | null>(null);
  const notHost = !!list?.ownerId && list.ownerId !== me?.id;
  const start = (e: Event) => {
    e.preventDefault();
    if (!color || !label.trim() || notHost) return;
    const x = startBlind(list ? list.id : null, { label: label.trim().slice(0, 20), color });
    route(`/taste/${x.id}?new=1`, true);
  };
  return (
    <div class="page">
      <header class="page-head">
        <button type="button" class="icon-button" aria-label={t("返回")} onClick={() => history.back()}>
          <BackIcon />
        </button>
        <h1 class="page-head-title">{t("盲品")}</h1>
      </header>
      {list && (
        <p class="add-to-list">
          {t("属于")} <strong>{list.title}</strong>
        </p>
      )}
      {notHost ? (
        <p class="notice">{t("只有主持人能加盲品杯，这样大家喝的 #1、#2 是同一杯。")}</p>
      ) : (
        <form class="form" onSubmit={start}>
          <Field label={t("杯号（可以改）")}>
            <input
              class="blind-label-input"
              value={label}
              maxLength={20}
              onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
            />
          </Field>
          <Field label={t("杯里是什么颜色的酒？")} group>
            <div class="blind-colors" role="radiogroup" aria-label={t("杯里是什么颜色的酒？")}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  class={color === c ? "blind-color on" : "blind-color"}
                  onClick={() => setColor(c)}
                >
                  <Glass color={glassColor(c)} size={26} />
                  {p(COLOR_WORDS[c])}
                </button>
              ))}
            </div>
          </Field>
          <p class="hint">
            {t("不用填酒名、产区、年份。品完之后猜一猜，最后在「对答案」里填上真正的酒，看看猜中了多少。")}
          </p>
          <button type="submit" class="button primary block" disabled={!color || !label.trim()}>
            {t("开始品 {label}", { label: label.trim() || "#" })}
          </button>
        </form>
      )}
    </div>
  );
}

// ── 猜一猜 ───────────────────────────────────────────────────────────────────────────────────

/** At the end of a blind glass's tasting, at any depth. Every field may stay empty. */
export function GuessCard(props: { x: Tasting; color: WineColor; onChange: (g: Tasting["guesses"]) => void }) {
  const g = props.x.guesses;
  const lang = currentLang();
  const set = (c: Partial<Tasting["guesses"]>) => props.onChange({ ...g, ...c });
  const regions = g.country ? (GUESS_REGIONS[g.country] ?? []) : [];
  const subs = g.region ? [...areasIn(g.region), ...appellationsIn(g.region)] : [];
  return (
    <section class="step guess-card">
      <h2 class="step-title">{t("猜一猜这是什么酒")}</h2>
      <p class="hint">{t("都可以不填。对答案时按猜中的部分算分：品种 4 分、产地 4 分、年份 2 分。")}</p>
      <Field label={t("品种")} group>
        <GrapePicker
          label={t("品种")}
          single
          color={props.color}
          value={g.grape ? [g.grape] : []}
          onChange={(v) => set({ grape: v[0] })}
        />
      </Field>
      <Field label={t("国家")} group>
        <div class="chips">
          {GUESS_COUNTRIES.map((c) => (
            <button
              key={c}
              type="button"
              class={g.country === c ? "chip on" : "chip"}
              onClick={() =>
                set(g.country === c ? { country: undefined, region: undefined, sub: undefined } : { country: c })
              }
            >
              {placeName(c, lang)}
            </button>
          ))}
        </div>
      </Field>
      {regions.length > 0 && (
        <Field label={t("产区")} group>
          <div class="chips">
            {regions.map((r) => (
              <button
                key={r}
                type="button"
                class={g.region === r ? "chip on" : "chip"}
                onClick={() =>
                  set(g.region === r ? { region: undefined, sub: undefined } : { region: r, sub: undefined })
                }
              >
                {placeName(r, lang)}
              </button>
            ))}
          </div>
        </Field>
      )}
      {(g.region || g.sub) && (
        <Field label={t("更细的产区（可选）")}>
          <SuggestInput
            value={g.sub ?? ""}
            options={subs}
            maxLength={60}
            placeholder={t("例如 Pauillac、Napa Valley")}
            onInput={(v) => set({ sub: v.trim() ? v : undefined })}
          />
        </Field>
      )}
      <div class="field-row">
        <Field label={t("年份")}>
          <input
            inputMode="numeric"
            maxLength={4}
            value={g.vintage ?? ""}
            onInput={(e) => {
              const n = Number((e.target as HTMLInputElement).value);
              set({ vintage: (e.target as HTMLInputElement).value && Number.isInteger(n) ? n : undefined });
            }}
          />
        </Field>
      </div>
      <Field label={t("价位（一瓶）")} group>
        <div class="chips">
          {PRICE_BANDS.map((b) => (
            <button
              key={b.id}
              type="button"
              class={g.price === b.id ? "chip on" : "chip"}
              onClick={() => set({ price: g.price === b.id ? undefined : b.id })}
            >
              {b.label}
            </button>
          ))}
        </div>
      </Field>
    </section>
  );
}

// ── 对答案 ───────────────────────────────────────────────────────────────────────────────────

const mark = (part: Part) => (part.max === 0 ? "–" : part.got === part.max ? "✓" : part.got > 0 ? "≈" : "✗");
const tone = (part: Part) => (part.max === 0 ? "" : part.got === part.max ? " ok" : part.got > 0 ? " near" : " miss");

/** 我猜 / 答案 / 分, one row each for grape, place, vintage and price. */
export function ScoreTable(props: { s: BlindScore }) {
  const { s } = props;
  const lang = currentLang();
  const grape = (x: string | null) =>
    x
      ?.split(" / ")
      .map((g) => grapeName(g, lang))
      .join(" / ") ?? null;
  const place = (x: string | null) =>
    x
      ?.split(" · ")
      .map((g) => placeName(g, lang))
      .join(" · ") ?? null;
  const rows: [string, string | null, string | null, Part][] = [
    [t("品种"), grape(s.grape.guess), grape(s.grape.answer), s.grape],
    [t("产地"), place(s.place.guess), place(s.place.answer), s.place],
    [t("年份"), s.vintage.guess, s.vintage.answer, s.vintage],
  ];
  return (
    <table class="guess-table">
      <thead>
        <tr>
          <th />
          <th>{t("我猜")}</th>
          <th>{t("答案")}</th>
          <th>{t("分")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, guess, answer, part]) => (
          <tr key={name}>
            <th scope="row">{name}</th>
            <td>{guess ?? <span class="muted">{t("没猜")}</span>}</td>
            <td>{answer ?? <span class="muted">{t("不详")}</span>}</td>
            <td class={`num${tone(part)}`}>
              <span aria-hidden="true">{mark(part)} </span>
              {part.max ? `${part.got}/${part.max}` : ""}
            </td>
          </tr>
        ))}
        {(s.price.guess || s.price.answer) && (
          <tr>
            <th scope="row">{t("价位")}</th>
            <td>{s.price.guess ?? <span class="muted">{t("没猜")}</span>}</td>
            <td>{s.price.answer ?? <span class="muted">{t("不详")}</span>}</td>
            <td class={s.price.ok === null ? "" : s.price.ok ? "ok" : "miss"}>
              {s.price.ok === null ? "" : s.price.ok ? "✓" : "✗"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** A blind glass whose answer is in: the wine, the score and the table. */
export function BlindResult(props: { x: Tasting; v: VintageInfo; priceUsd?: number | null }) {
  const s = scoreGuess(props.x.guesses, props.v, props.priceUsd ?? props.x.priceUsd);
  return (
    <section class="step blind-result">
      <div class="blind-result-head">
        <span class="small muted">{t("{label} 其实是", { label: props.x.blind?.label ?? "" })}</span>
        <span class="blind-total">
          {s.total === null ? "–" : <strong class="num">{s.total}</strong>}
          <span class="muted small"> / 10</span>
        </span>
      </div>
      <WineName v={props.v} />
      <ScoreTable s={s} />
    </section>
  );
}

/** One glass of a 品鉴 on the 对答案 page. */
interface Glassful {
  itemId: string;
  label: string;
  color: WineColor;
  mine: Tasting | undefined;
  /** The wine, once revealed, or for the host the answer filled in. */
  answer: VintageInfo | undefined;
  revealed: boolean;
  priceUsd: number | null;
}

/** /answers/:id: every 盲品 glass of a 品鉴, the answers, my score, and in a group the 揭晓 and ranking. */
export function AnswersPage() {
  const { params } = useRoute();
  const { route } = useLocation();
  const list = useStore((s) => s.lists.find((l) => l.id === params.id));
  const items = useStore((s) =>
    s.items.filter((i) => i.listId === params.id && i.blind).sort((a, b) => a.position - b.position),
  );
  const vintages = useStore((s) => s.vintages);
  const tastings = useStore((s) => s.tastings);
  const me = useStore((s) => s.me);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shared = (board?.memberCount ?? list?.members ?? 1) > 1;
  useEffect(() => {
    if (!list || navigator.onLine === false) return;
    fetchBoard(list.id).then(setBoard, () => {});
  }, [list?.id]);
  if (!list)
    return (
      <div class="page">
        <p class="empty">{t("找不到这次品鉴")}</p>
        <a href="/">{t("回到品鉴")}</a>
      </div>
    );
  const host = !list.ownerId || list.ownerId === me?.id;
  const vById = new Map(vintages.map((v) => [v.id, v]));
  const glasses: Glassful[] = items.map((i) => {
    const revealed = !isBlindId(i.vintageId);
    return {
      itemId: i.id,
      label: i.blind!.label,
      color: i.blind!.color,
      mine: tastings.find((x) => x.listItemId === i.id),
      answer: vById.get(revealed ? i.vintageId : (i.answerVintageId ?? "")),
      revealed,
      priceUsd: i.priceUsd,
    };
  });
  const scored = glasses.flatMap((g) => (g.mine && g.answer ? [scoreGuess(g.mine.guesses, g.answer, g.priceUsd)] : []));
  const total = scored.reduce((n, s) => n + (s.total ?? 0), 0);
  const waiting = glasses.filter((g) => !g.revealed);
  const ready = waiting.filter((g) => g.answer).length;
  const reveal = async () => {
    setBusy(true);
    setError("");
    try {
      setBoard(await shareList(list.id, { revealed: true }));
    } catch (e) {
      setError(e instanceof ApiError ? tm(e.message) : t("没有网络，揭晓要联网"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="page">
      <header class="page-head">
        <a href={`/lists/${list.id}`} class="icon-button" aria-label={t("返回")}>
          <BackIcon />
        </a>
        <div class="page-head-title">
          <h1 class="list-title">{t("对答案")}</h1>
          <span class="muted small">{list.title}</span>
        </div>
      </header>
      {glasses.length === 0 ? (
        <p class="empty">{t("这次品鉴还没有盲品杯。")}</p>
      ) : (
        <p class="blind-summary">
          {t("{n} 杯盲品", { n: glasses.length })}
          {scored.length > 0 && (
            <>
              {" · "}
              {t("我对了 {k} 杯，共 {got} / {max} 分", { k: scored.length, got: total, max: scored.length * 10 })}
            </>
          )}
        </p>
      )}
      {host && shared && waiting.length > 0 && (
        <section class="step">
          <h2 class="step-title">{t("主持人：先把答案填好")}</h2>
          <p class="hint">
            {t("答案只有你看得到。大家看到的一直是杯号，等你点「揭晓」，才看到答案、彼此的猜测和得分。")}
          </p>
          <p class="small">{t("已填答案 {k} / {n}", { k: ready, n: waiting.length })}</p>
          {error && (
            <p class="notice" role="alert">
              {error}
            </p>
          )}
          {ready > 0 && (
            <button type="button" class="button primary block" disabled={busy} onClick={reveal}>
              {ready < waiting.length ? t("揭晓已填答案的 {k} 杯", { k: ready }) : t("揭晓答案")}
            </button>
          )}
        </section>
      )}
      {!host && waiting.length > 0 && <p class="notice">{t("等主持人揭晓答案。先把每杯的「猜一猜」填好吧。")}</p>}
      <ol class="blind-glasses">
        {glasses.map((g) => (
          <li key={g.itemId} class="card blind-glass">
            <div class="blind-glass-head">
              <Glass color={glassColor(g.color, g.mine?.appearance)} size={26} />
              <strong class="blind-label">{g.label}</strong>
              {g.mine ? (
                <a class="link small" href={`/taste/${g.mine.id}`}>
                  {t("我的品鉴")}
                </a>
              ) : (
                <button type="button" class="link small" onClick={() => openBlindItem(route, g.itemId)}>
                  {t("去品这杯")}
                </button>
              )}
            </div>
            {g.answer ? (
              <>
                <WineName v={g.answer} />
                {!g.revealed && <p class="muted small">{t("还没揭晓：只有你看得到这个答案")}</p>}
                {g.mine ? (
                  <BlindScoreLine x={g.mine} v={g.answer} priceUsd={g.priceUsd} />
                ) : (
                  <p class="muted small">{t("你没有品这杯")}</p>
                )}
              </>
            ) : (
              <p class="muted small">{host ? t("还没填答案") : t("等主持人揭晓")}</p>
            )}
            {host && (
              <a
                class="button small"
                href={`/add?answerItem=${g.itemId}${shared && !list.revealedAt && !board?.list.revealedAt ? "&wait=1" : ""}`}
              >
                {g.answer ? t("改答案") : t("填答案")}
              </a>
            )}
          </li>
        ))}
      </ol>
      {shared && board && <Ranking board={board} />}
    </div>
  );
}

/** My guesses on one glass against its answer, folded open on tap. */
function BlindScoreLine(props: { x: Tasting; v: VintageInfo; priceUsd: number | null }) {
  const [open, setOpen] = useState(false);
  const s = scoreGuess(props.x.guesses, props.v, props.priceUsd ?? props.x.priceUsd);
  return (
    <div class="blind-score">
      <button type="button" class="link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t("这杯 {got} / 10 分", { got: s.total ?? "–" })} {open ? "▴" : "▾"}
      </button>
      {open && <ScoreTable s={s} />}
    </div>
  );
}

/** 猜酒排行: everyone's points over the revealed glasses, from the board (it hides guesses until then). */
function Ranking(props: { board: Board }) {
  const people = new Map<string, { name: string; mine: boolean; got: number; glasses: number }>();
  let revealed = 0;
  for (const i of props.board.items) {
    if (!i.blind || !i.vintage) continue;
    revealed++;
    for (const n of i.notes) {
      if (!n.guesses) continue;
      const s = scoreGuess(n.guesses, i.vintage, n.priceUsd ?? null);
      const p = people.get(n.userId) ?? { name: n.name, mine: n.mine, got: 0, glasses: 0 };
      p.got += s.total ?? 0;
      p.glasses++;
      people.set(n.userId, p);
    }
  }
  if (!revealed || !people.size) return null;
  const rows = [...people.values()].sort((a, b) => b.got - a.got);
  return (
    <section class="step">
      <h2 class="step-title">{t("猜酒排行")}</h2>
      <ol class="rows ranking">
        {rows.map((r, n) => (
          <li key={r.name + n} class="row static">
            <span class="row-n num">{n + 1}</span>
            <span class="grow">{r.mine ? t("我") : r.name}</span>
            <span class="muted small">{t("{n} 杯", { n: r.glasses })}</span>
            <span class="row-score num">{r.got}</span>
          </li>
        ))}
      </ol>
      <p class="muted small">{t("每杯 10 分，只算猜过的杯。")}</p>
    </section>
  );
}

/** Opens my note on a blind glass of a 品鉴, starting one (with the glass's label) the first time. */
export function openBlindItem(route: (url: string) => void, itemId: string) {
  const s = getState();
  const item = s.items.find((i) => i.id === itemId);
  if (!item?.blind) return;
  const mine = s.tastings.find((x) => x.listItemId === itemId);
  if (mine) return route(`/taste/${mine.id}`);
  const x = startBlindOn(item.id, item.vintageId, item.blind);
  route(`/taste/${x.id}?new=1`);
}

const startBlindOn = (itemId: string, vintageId: string, blind: { label: string; color: WineColor }) => {
  const x = { ...blankTasting(vintageId, itemId, getState().me?.depth ?? "quick"), blind };
  saveTasting(x);
  return x;
};

/** The stand-in wine a blind note is shown with until its answer is in. */
export const blindShown = (x: Tasting, v: VintageInfo | undefined): VintageInfo | undefined =>
  v ?? (x.blind && x.vintageId === BLIND ? blindVintage(x.blind) : undefined);
