import { useLocation, useRoute } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import {
  BOTTLE_SIZES,
  CURRENCIES,
  type CellarLot,
  type DrinkWindow,
  type ProWindow,
  STATUS_ORDER,
  type WindowStatus,
  bottleCount,
  defaultCurrency,
  fmtPrice,
  parseWindow,
  windowLabel,
  windowOf,
  windowStatus,
} from "../../shared/cellar";
import { glassColor } from "../../shared/guide";
import { type Tasting, type VintageInfo, nameKey, yearLabel } from "../../shared/model";
import type { ReviewsView } from "../../shared/reviews";
import { BackIcon, Field, Glass, WineName } from "../components";
import { ask } from "../confirm";
import { currentLang, fmtDate, t, tk } from "../i18n";
import { SuggestInput } from "../SuggestInput";
import {
  addVintage,
  api,
  blankLot,
  deleteLot,
  getState,
  openBottle,
  putBackBottle,
  saveLot,
  takeFromLot,
  useStore,
} from "../store";
import { markCellarSeen } from "../CellarAlerts";

/**
 * 酒窖 (docs/design.zh.md §6 第三期): what I have, grouped by what to drink first. Each row is one
 * purchase of one wine; opening a bottle there takes one off and starts a note on it.
 */

const STATUS_TITLE: Record<WindowStatus, string> = {
  past: tk("已过适饮期"),
  last: tk("今年是适饮期最后一年"),
  ready: tk("正当时"),
  wait: tk("再等等"),
  unknown: tk("没有适饮期"),
};
const STATUS_HINT: Partial<Record<WindowStatus, string>> = {
  past: tk("别再等了，找个机会开了吧。"),
  last: tk("今年内喝掉最好。"),
  unknown: tk("点进去填上适饮期，到时候就会提醒你。"),
};
const SOURCE_NAME: Record<DrinkWindow["source"], string> = {
  mine: tk("我定的"),
  critics: tk("酒评"),
  notes: tk("我的笔记"),
};

export const sizeLabel = (ml: number) => (ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`);

/** The window a lot goes by and where it stands this year. */
function useWindows() {
  const pro = useStore((s) => s.proWindows);
  const tastings = useStore((s) => s.tastings);
  const byVintage = new Map(pro.map((w) => [w.vintageId, w]));
  return (lot: CellarLot) => {
    const w = windowOf(lot, byVintage.get(lot.vintageId), tastings);
    return { w, status: windowStatus(w) };
  };
}

export function CellarPage() {
  const lots = useStore((s) => s.cellar);
  const vintages = useStore((s) => s.vintages);
  const [q, setQ] = useState("");
  const [place, setPlace] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const windows = useWindows();
  const lang = currentLang();
  const vById = new Map(vintages.map((v) => [v.id, v]));
  // Opening the page counts as having seen this year's reminders.
  useEffect(() => markCellarSeen(), [lots.length]);

  const full = lots.filter((l) => l.qty > 0);
  const empty = lots.filter((l) => l.qty <= 0);
  const places = [...new Set(full.map((l) => l.location).filter((x): x is string => !!x))].sort();
  const words = nameKey(q).split(" ").filter(Boolean);
  const hay = (l: CellarLot) => {
    const v = vById.get(l.vintageId);
    return nameKey(
      [
        v?.producer,
        v?.wine,
        v ? yearLabel(v.year) : "",
        v?.region,
        v?.area,
        v?.appellation,
        l.location,
        l.source,
        l.note,
      ]
        .filter(Boolean)
        .join(" "),
    );
  };
  const shown = full
    .filter((l) => !place || l.location === place)
    .filter((l) => !words.length || words.every((w) => hay(l).includes(w)));
  const groups = STATUS_ORDER.map((status) => ({
    status,
    rows: shown
      .map((l) => ({ l, ...windows(l) }))
      .filter((r) => r.status === status)
      .sort((a, b) => (a.w?.to ?? 9999) - (b.w?.to ?? 9999) || (a.w?.from ?? 0) - (b.w?.from ?? 0)),
  })).filter((g) => g.rows.length > 0);
  const wines = new Set(full.map((l) => l.vintageId)).size;

  return (
    <div class="page">
      <div class="section-head">
        <h1 class="section-head-title">{t("酒窖")}</h1>
        <span class="section-head-actions">
          {full.length > 0 && (
            <a href="/recs" class="button small">
              {t("今晚开哪瓶")}
            </a>
          )}
          <a href="/cellar/add" class="button small primary">
            ＋ {t("放进酒窖")}
          </a>
        </span>
      </div>
      {full.length === 0 ? (
        <div class="empty">
          <p>{t("买了酒就放进来：放在哪、花了多少、什么时候喝。到了适饮期会提醒你，开一瓶就顺手记一杯。")}</p>
        </div>
      ) : (
        <>
          <p class="cellar-sum">
            {t("{n} 瓶 · {k} 款", { n: bottleCount(full), k: wines })}
            <TotalValue lots={full} />
          </p>
          {full.length > 4 && (
            <input
              type="search"
              class="search"
              placeholder={t("搜酒名、酒庄、产区、位置")}
              value={q}
              onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            />
          )}
          {places.length > 1 && (
            <div class="chips scroll filters">
              {places.map((x) => (
                <button
                  key={x}
                  type="button"
                  class={place === x ? "chip on" : "chip"}
                  onClick={() => setPlace(place === x ? null : x)}
                >
                  {x}
                </button>
              ))}
            </div>
          )}
          {groups.length === 0 && <p class="empty">{t("没有找到")}</p>}
          {groups.map((g) => (
            <section key={g.status} class={`cellar-group ${g.status}`}>
              <h2 class="section-title">
                {t(STATUS_TITLE[g.status])}
                <span class="muted"> · {bottleCount(g.rows.map((r) => r.l))}</span>
              </h2>
              {STATUS_HINT[g.status] && <p class="field-hint">{t(STATUS_HINT[g.status]!)}</p>}
              <ul class="rows">
                {g.rows.map(({ l, w }) => (
                  <LotRow key={l.id} l={l} v={vById.get(l.vintageId)} w={w} lang={lang} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {empty.length > 0 && (
        <section>
          <button type="button" class="link small" onClick={() => setShowEmpty(!showEmpty)}>
            {showEmpty ? t("收起喝完的") : t("喝完的 {n} 款", { n: empty.length })}
          </button>
          {showEmpty && (
            <ul class="rows done-lots">
              {empty.map((l) => (
                <LotRow key={l.id} l={l} v={vById.get(l.vintageId)} w={windows(l).w} lang={lang} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** What the bottles cost, per currency: "¥4,800 · $320". */
function TotalValue(props: { lots: CellarLot[] }) {
  const sums = new Map<string, number>();
  for (const l of props.lots)
    if (l.price !== null && l.currency) sums.set(l.currency, (sums.get(l.currency) ?? 0) + l.price * l.qty);
  if (!sums.size) return null;
  const lang = currentLang();
  return (
    <span class="muted">
      {" · "}
      {t("买入共 {sum}", {
        sum: [...sums]
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => fmtPrice(Math.round(n), c, lang))
          .join(" + "),
      })}
    </span>
  );
}

function LotRow(props: {
  l: CellarLot;
  v: VintageInfo | undefined;
  w: DrinkWindow | null;
  lang: ReturnType<typeof currentLang>;
}) {
  const { l, v, w } = props;
  if (!v) return null;
  const sub = [l.location, w ? `${t("适饮期")} ${windowLabel(w, props.lang)}` : null].filter(Boolean).join(" · ");
  return (
    <li>
      <a class="row" href={`/cellar/${l.id}`}>
        <Glass color={glassColor(v.color, undefined, v.year)} />
        <span class="row-main">
          <WineName v={v} sub={false} />
          {sub && <span class="row-list">{sub}</span>}
        </span>
        <span class="row-side">
          <span class="row-score num">×{l.qty}</span>
          {l.sizeMl !== 750 && <span class="muted small">{sizeLabel(l.sizeMl)}</span>}
        </span>
      </a>
    </li>
  );
}

// ── One lot ───────────────────────────────────────────────────────────────────────────────────

/** /cellar/new?v=<vintage>[&qty=&from=<tasting>]: a new lot. /cellar/:id: one lot, to open or change. */
export function CellarLotPage() {
  const { params } = useRoute();
  const { route, query } = useLocation();
  const isNew = !params.id || params.id === "new";
  const saved = useStore((s) => (isNew ? undefined : s.cellar.find((l) => l.id === params.id)));
  const vintageId = saved?.vintageId ?? query.v ?? "";
  const live = useStore((s) => s.vintages.find((x) => x.id === vintageId));
  // A wine just picked is only in my copy until something of mine points at it: the next sync drops it
  // while this form is open. Keep it here, and send it again with the lot.
  const [kept] = useState(live);
  const v = live ?? kept;
  const [lot, setLot] = useState<CellarLot | null>(() => saved ?? (vintageId ? newLot(vintageId, query) : null));
  const [dirty, setDirty] = useState(false);
  const windows = useWindows();
  // Opened or changed on another screen (a bottle taken from a note): follow it unless I'm editing.
  useEffect(() => {
    if (saved && !dirty) setLot(saved);
  }, [saved]);

  if (!lot || !v)
    return (
      <div class="page">
        <p class="empty">{t("找不到这瓶酒")}</p>
        <a href="/cellar">{t("回到酒窖")}</a>
      </div>
    );

  const shown = saved ? windows(saved) : null;
  const change = (c: Partial<CellarLot>) => {
    setLot({ ...lot, ...c });
    setDirty(true);
  };
  const save = () => {
    if (!live && v) addVintage(v);
    saveLot(lot);
    setDirty(false);
    if (isNew) route(`/cellar/${lot.id}`, true);
  };
  const open = (note: boolean) => {
    if (dirty) saveLot(lot);
    setDirty(false);
    const x = openBottle(lot.id, note);
    if (x) route(`/taste/${x.id}?new=1`);
  };

  return (
    <div class="page">
      <header class="page-head">
        <button type="button" class="icon-button" aria-label={t("返回")} onClick={() => history.back()}>
          <BackIcon />
        </button>
        <div class="page-head-title taste-wine">
          <Glass color={glassColor(v.color, undefined, v.year)} size={34} />
          <WineName v={v} />
        </div>
      </header>
      <Before v={v} lotId={isNew ? null : lot.id} />
      {!isNew && (
        <div class="open-bottle">
          <p class="open-left">
            <strong class="num">{saved?.qty ?? lot.qty}</strong> {t("瓶")}
            {lot.sizeMl !== 750 && <span class="muted"> · {sizeLabel(lot.sizeMl)}</span>}
            {lot.location && <span class="muted"> · {lot.location}</span>}
          </p>
          {shown && (
            <p class={`open-window ${shown.status}`}>
              {shown.w
                ? `${t("适饮期")} ${windowLabel(shown.w, currentLang())} · ${t(SOURCE_NAME[shown.w.source])} · `
                : ""}
              {t(STATUS_TITLE[shown.status])}
            </p>
          )}
          {(saved?.qty ?? 0) > 0 && (
            <>
              <button type="button" class="button primary block" onClick={() => open(true)}>
                {t("开一瓶，记一杯")}
              </button>
              <button
                type="button"
                class="link small"
                onClick={async () => {
                  if (await ask(t("不记录，只把数量减一瓶？"), { ok: t("减一瓶") })) open(false);
                }}
              >
                {t("只减一瓶，不记录")}
              </button>
            </>
          )}
        </div>
      )}
      <LotForm lot={lot} change={change} />
      <button type="button" class="button primary block" disabled={!isNew && !dirty} onClick={save}>
        {isNew ? t("放进酒窖") : dirty ? t("保存") : t("已保存")}
      </button>
      {!isNew && (
        <button
          type="button"
          class="link danger small"
          onClick={async () => {
            if (!(await ask(t("删除这条酒窖记录？喝过的笔记会留着。"), { ok: t("删除"), danger: true }))) return;
            deleteLot(lot.id);
            route("/cellar", true);
          }}
        >
          {t("删除这条记录")}
        </button>
      )}
    </div>
  );
}

/** A new lot, filled from what I used last time and, when it comes from a note's 买了几瓶, from that note. */
function newLot(vintageId: string, query: Record<string, string>): CellarLot {
  const s = getState();
  const last = [...s.cellar].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const from = query.from ? s.tastings.find((x) => x.id === query.from) : undefined;
  const item = from?.listItemId ? s.items.find((i) => i.id === from.listItemId) : undefined;
  const list = item ? s.lists.find((l) => l.id === item.listId) : undefined;
  const qty = Math.round(Number(query.qty));
  return blankLot(vintageId, {
    qty: qty >= 1 && qty <= 9999 ? qty : 1,
    location: last?.location ?? null,
    currency: from?.priceUsd ? "USD" : (last?.currency ?? defaultCurrency(currentLang())),
    price: from?.priceUsd ?? null,
    boughtOn: from ? from.tastedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    source: list ? (list.place?.name ?? list.title) : null,
  });
}

/** 以前喝过: what I wrote about this vintage, and how many other vintages of it I know. */
function Before(props: { v: VintageInfo; lotId: string | null }) {
  const tastings = useStore((s) => s.tastings);
  const others = useStore((s) =>
    s.vintages.filter((x) => x.wineId && x.wineId === props.v.wineId && x.id !== props.v.id),
  );
  const lots = useStore((s) => s.cellar.filter((l) => l.vintageId === props.v.id && l.id !== props.lotId && l.qty > 0));
  const mine = tastings.filter((x) => x.vintageId === props.v.id).sort((a, b) => b.tastedAt.localeCompare(a.tastedAt));
  const fromHere = props.lotId ? mine.filter((x) => x.cellarId === props.lotId) : [];
  const elsewhere = mine.filter((x) => !fromHere.includes(x));
  const otherTasted = others.filter((o) => tastings.some((x) => x.vintageId === o.id));
  if (!mine.length && !otherTasted.length && !lots.length) return null;
  return (
    <section class="before">
      {lots.length > 0 && (
        <p class="notice">
          {t("酒窖里已经有 {n} 瓶这个年份：", { n: bottleCount(lots) })}
          {lots.map((l, i) => (
            <span key={l.id}>
              {i > 0 && "、"}
              <a href={`/cellar/${l.id}`}>{l.location || t("未写位置")}</a>
            </span>
          ))}
        </p>
      )}
      {elsewhere.length > 0 && (
        <>
          <h2 class="section-title">{t("以前喝过")}</h2>
          <ul class="rows">
            {elsewhere.slice(0, 5).map((x) => (
              <TastedRow key={x.id} x={x} />
            ))}
          </ul>
        </>
      )}
      {otherTasted.length > 0 && (
        <p class="muted small">
          {t("这款酒你还喝过 {n} 个年份", { n: otherTasted.length })}:{" "}
          {otherTasted.map((o) => (
            <a key={o.id} href={`/wine/${o.id}`} class="year-link num">
              {yearLabel(o.year)}
            </a>
          ))}
        </p>
      )}
      {fromHere.length > 0 && (
        <>
          <h2 class="section-title">{t("从这里开过的")}</h2>
          <ul class="rows">
            {fromHere.map((x) => (
              <TastedRow key={x.id} x={x} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TastedRow(props: { x: Tasting }) {
  const { x } = props;
  const place = x.location?.name || x.location?.address;
  return (
    <li>
      <a class="row compact" href={`/taste/${x.id}`}>
        <span class="row-main">
          <span>{fmtDate(x.tastedAt)}</span>
          {(place || x.note) && <span class="row-list">{[place, x.note].filter(Boolean).join(" · ")}</span>}
        </span>
        <span class="row-score num">{x.score ?? "—"}</span>
      </a>
    </li>
  );
}

function LotForm(props: { lot: CellarLot; change: (c: Partial<CellarLot>) => void }) {
  const { lot, change } = props;
  const lots = useStore((s) => s.cellar);
  const lists = useStore((s) => s.lists);
  const locations = [...new Set(lots.map((l) => l.location).filter((x): x is string => !!x))];
  const sources = [
    ...new Set([
      ...lots.map((l) => l.source),
      ...lists.filter((l) => l.kind === "winery").map((l) => l.place?.name ?? l.title),
    ]),
  ].filter((x): x is string => !!x);
  const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
  const yearOf = (s: string) => {
    const n = num(s);
    return n !== null && Number.isInteger(n) && n >= 1900 && n <= 2200 ? n : null;
  };
  return (
    <div class="form">
      <Field label={t("瓶数")} group>
        <div class="stepper">
          <button
            type="button"
            class="button"
            aria-label={t("少一瓶")}
            disabled={lot.qty <= 0}
            onClick={() => change({ qty: Math.max(0, lot.qty - 1) })}
          >
            −
          </button>
          <input
            inputMode="numeric"
            aria-label={t("瓶数")}
            value={lot.qty}
            onInput={(e) => {
              const n = num((e.target as HTMLInputElement).value);
              if (n !== null && Number.isInteger(n) && n >= 0 && n <= 9999) change({ qty: n });
            }}
          />
          <button
            type="button"
            class="button"
            aria-label={t("多一瓶")}
            onClick={() => change({ qty: Math.min(9999, lot.qty + 1) })}
          >
            ＋
          </button>
        </div>
      </Field>
      <Field label={t("瓶子大小")} group>
        <div class="chips">
          {BOTTLE_SIZES.map((ml) => (
            <button
              key={ml}
              type="button"
              class={lot.sizeMl === ml ? "chip on" : "chip"}
              aria-pressed={lot.sizeMl === ml}
              onClick={() => change({ sizeMl: ml })}
            >
              {sizeLabel(ml)}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t("放在哪里")} hint={t("例如：家里酒柜第 3 层、公司、存酒仓库")}>
        <SuggestInput
          name="location"
          value={lot.location ?? ""}
          options={locations}
          onInput={(x) => change({ location: x || null })}
          placeholder={t("家里酒柜")}
        />
      </Field>
      <Field label={t("在哪买的")}>
        <SuggestInput
          name="source"
          value={lot.source ?? ""}
          options={sources}
          maxLength={120}
          onInput={(x) => change({ source: x || null })}
          placeholder={t("酒庄、酒铺、网店或朋友")}
        />
      </Field>
      <div class="field-row">
        <Field label={t("买入日期")}>
          <input
            type="date"
            value={lot.boughtOn ?? ""}
            onInput={(e) => change({ boughtOn: (e.target as HTMLInputElement).value || null })}
          />
        </Field>
        <Field label={t("每瓶价格")}>
          <span class="price-input">
            <input
              inputMode="decimal"
              value={lot.price ?? ""}
              onInput={(e) => {
                const n = num((e.target as HTMLInputElement).value);
                change({ price: n !== null && n >= 0 ? n : null });
              }}
            />
            <select
              aria-label={t("币种")}
              value={lot.currency ?? defaultCurrency(currentLang())}
              onChange={(e) => change({ currency: (e.target as HTMLSelectElement).value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </span>
        </Field>
      </div>
      <Field label={t("适饮期")} group hint={t("不填的话，按酒评或你笔记里写的适饮期提醒")}>
        <div class="window-row">
          <input
            inputMode="numeric"
            aria-label={t("从哪一年")}
            maxLength={4}
            placeholder={t("从")}
            value={lot.drinkFrom ?? ""}
            onInput={(e) => change({ drinkFrom: yearOf((e.target as HTMLInputElement).value) })}
          />
          <span class="muted">–</span>
          <input
            inputMode="numeric"
            aria-label={t("到哪一年")}
            maxLength={4}
            placeholder={t("到")}
            value={lot.drinkTo ?? ""}
            onInput={(e) => change({ drinkTo: yearOf((e.target as HTMLInputElement).value) })}
          />
        </div>
        <WindowHints lot={lot} change={change} />
      </Field>
      <Field label={t("备注")}>
        <textarea
          rows={2}
          maxLength={1000}
          value={lot.note ?? ""}
          onInput={(e) => change({ note: (e.target as HTMLTextAreaElement).value || null })}
        />
      </Field>
    </div>
  );
}

/**
 * Windows I could take: the critics' (from the shared pro-review lookup, fetched when not in my copy
 * yet) and the one I wrote in a note. Never looks anything up that costs money.
 */
function WindowHints(props: { lot: CellarLot; change: (c: Partial<CellarLot>) => void }) {
  const { lot } = props;
  const synced = useStore((s) => s.proWindows.find((w) => w.vintageId === lot.vintageId));
  const tastings = useStore((s) => s.tastings);
  const [fetched, setFetched] = useState<ProWindow | null>(null);
  useEffect(() => {
    if (synced || !navigator.onLine) return;
    let live = true;
    api<ReviewsView>(`/api/reviews/${lot.vintageId}`)
      .then((r) => {
        const text =
          (r.shared?.status === "done" ? r.shared.review.drinkWindow : null) ?? r.mine?.review.drinkWindow ?? null;
        const w = parseWindow(text);
        if (live && w && text) setFetched({ vintageId: lot.vintageId, ...w, text });
      })
      .catch(() => {
        // a wine not uploaded yet, or offline: no hint
      });
    return () => {
      live = false;
    };
  }, [lot.vintageId, !!synced]);
  const pro = synced ?? fetched;
  const noted = windowOf({ drinkFrom: null, drinkTo: null, vintageId: lot.vintageId }, undefined, tastings);
  const lang = currentLang();
  type Hint = { name: string; w: { from: number | null; to: number | null } };
  const hints: Hint[] = [];
  if (pro) hints.push({ name: SOURCE_NAME.critics, w: pro });
  if (noted) hints.push({ name: SOURCE_NAME.notes, w: noted });
  if (!hints.length) return null;
  return (
    <div class="window-hints">
      {hints.map((h) => {
        const same = h.w.from === lot.drinkFrom && h.w.to === lot.drinkTo;
        return (
          <button
            key={h.name}
            type="button"
            class={same ? "chip on" : "chip"}
            onClick={() => props.change({ drinkFrom: h.w.from, drinkTo: h.w.to })}
          >
            {t(h.name)}: {windowLabel(h.w, lang)}
          </button>
        );
      })}
    </div>
  );
}

/** The 酒窖 status of one lot, for other pages (the wine page). */
export function useLotStatus() {
  return useWindows();
}

export const statusTitle = (s: WindowStatus) => t(STATUS_TITLE[s]);

// ── On a note ─────────────────────────────────────────────────────────────────────────────────

/**
 * On a note just started: 酒窖里还有这款酒 → "这瓶是从酒窖拿的" takes one off (喝掉一瓶 = 记一杯).
 * On a note from the cellar: where it came from, and, while fresh, 放回去 in case it was a mistake.
 */
export function TastingFromCellar(props: { x: Tasting; fresh: boolean }) {
  const { x } = props;
  const lots = useStore((s) => s.cellar.filter((l) => l.vintageId === x.vintageId));
  const from = x.cellarId ? lots.find((l) => l.id === x.cellarId) : undefined;
  if (from)
    return (
      <p class="notice row-notice cellar-line">
        <span>
          {t("从酒窖开的")}
          {from.location ? ` · ${from.location}` : ""} · {t("还剩 {n} 瓶", { n: from.qty })}
        </span>
        {props.fresh && (
          <button type="button" class="link" onClick={() => putBackBottle(x.id)}>
            {t("放回去")}
          </button>
        )}
      </p>
    );
  const full = lots.filter((l) => l.qty > 0);
  if (!props.fresh || x.cellarId || !full.length) return null;
  return (
    <div class="notice cellar-line">
      <p>{t("酒窖里还有 {n} 瓶这款酒。这瓶是从酒窖拿的吗？", { n: bottleCount(full) })}</p>
      <div class="chips">
        {full.map((l) => (
          <button key={l.id} type="button" class="chip" onClick={() => takeFromLot(x.id, l.id)}>
            {full.length > 1 ? t("是，从「{place}」拿的", { place: l.location || t("未写位置") }) : t("是，酒窖减一瓶")}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Under 买了几瓶: put those bottles in the cellar, filled from the note. */
export function BoughtToCellar(props: { x: Tasting }) {
  const { x } = props;
  const added = useStore((s) => s.cellar.some((l) => l.vintageId === x.vintageId && l.createdAt >= x.tastedAt));
  if (!x.boughtQty) return null;
  return added ? (
    <a class="small" href="/cellar">
      {t("已放进酒窖")} ›
    </a>
  ) : (
    <a class="button small" href={`/cellar/new?v=${x.vintageId}&qty=${x.boughtQty}&from=${x.id}`}>
      ＋ {t("把这 {n} 瓶放进酒窖", { n: x.boughtQty })}
    </a>
  );
}
