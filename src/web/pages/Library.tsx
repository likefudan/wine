import { useLocation } from "preact-iso";
import { useState } from "preact/hooks";
import { bottleCount } from "../../shared/cellar";
import { DESCRIPTOR_BY_ID } from "../../shared/descriptors";
import { GRAPES } from "../../shared/grapes";
import { COLOR_WORDS, glassColor } from "../../shared/guide";
import { COLORS, type Tasting, type VintageInfo, type WineColor, nameKey, yearLabel } from "../../shared/model";
import { areaOf } from "../../shared/place";
import { Glass, WineName } from "../components";
import { fmtDate, p, t } from "../i18n";
import { useStore } from "../store";
import { CellarView } from "./Cellar";

type View = "all" | "cellar";
const VIEW_KEY = "wine.libraryView";
const savedView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "cellar" ? "cellar" : "all";
  } catch {
    return "all";
  }
};

/**
 * 酒库 (Ke Li 2026-11-18: one place, not a separate 酒窖 tab): 全部 = every wine I've tasted or bought;
 * 酒窖 = only what I have in stock (pages/Cellar.tsx CellarView). ?view=cellar opens the second; the
 * last one chosen is remembered on the phone.
 */
export function Library() {
  const { query, route } = useLocation();
  const view: View = query.view === "cellar" || query.view === "all" ? query.view : savedView();
  const stock = useStore((s) => bottleCount(s.cellar.filter((l) => l.qty > 0)));
  const pick = (v: View) => {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // private mode: remembered for this visit only
    }
    route(`/library?view=${v}`, true);
  };
  return (
    <div class="page">
      <h1 class="visually-hidden">{t("酒库")}</h1>
      <div class="library-head">
        <div class="segmented" role="tablist" aria-label={t("酒库")}>
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            class={view === "all" ? "on" : ""}
            onClick={() => pick("all")}
          >
            {t("全部")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "cellar"}
            class={view === "cellar" ? "on" : ""}
            onClick={() => pick("cellar")}
          >
            {t("酒窖")}
            {stock > 0 && <span class="seg-count num">{stock}</span>}
          </button>
        </div>
        <a href="/cellar/add" class="button small primary">
          ＋ {t("放进酒窖")}
        </a>
      </div>
      {view === "cellar" ? <CellarView /> : <AllWines />}
    </div>
  );
}

/**
 * 酒库 → 全部: everything I've tasted or bought, searched on the phone (docs/design.zh.md §3.7): wine, producer,
 * region, grape (in any language), list title, my note and aroma words. Works offline.
 */

function haystack(v: VintageInfo, tastings: Tasting[], listTitles: string[]): string {
  const grapes = v.grapes.flatMap((g) => {
    const known = GRAPES.find((x) => x.en === g);
    return known ? [known.en, known.zh, known.tw, ...(known.alt ?? [])] : [g];
  });
  const aromas = tastings.flatMap((x) =>
    [...x.descriptors.map((d) => d.id), ...(x.palate.flavours ?? [])].flatMap((id) => {
      const w = DESCRIPTOR_BY_ID.get(id);
      return w ? [w.name.zh, w.name.tw, w.name.en] : [];
    }),
  );
  return nameKey(
    [
      v.producer,
      v.wine,
      yearLabel(v.year),
      v.region,
      v.area || areaOf(v.appellation),
      v.appellation,
      v.country,
      ...grapes,
      ...listTitles,
      ...aromas,
      ...tastings.map((x) => x.note ?? ""),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function AllWines() {
  const vintages = useStore((s) => s.vintages);
  const tastings = useStore((s) => s.tastings);
  const items = useStore((s) => s.items);
  const lists = useStore((s) => s.lists);
  const cellar = useStore((s) => s.cellar);
  const [q, setQ] = useState("");
  const [color, setColor] = useState<WineColor | null>(null);
  const [minScore, setMinScore] = useState<number | null>(null);
  const [again, setAgain] = useState(false);

  const listTitle = new Map(lists.map((l) => [l.id, l.title]));
  const itemList = new Map(items.map((i) => [i.id, i.listId]));
  const byVintage = new Map<string, Tasting[]>();
  for (const x of tastings) byVintage.set(x.vintageId, [...(byVintage.get(x.vintageId) ?? []), x]);
  const words = nameKey(q).split(" ").filter(Boolean);
  // Bought counts too: a wine only in the cellar is in the 酒库 before it is ever opened.
  const bought = new Map<string, { qty: number; at: string }>();
  for (const l of cellar) {
    const b = bought.get(l.vintageId);
    bought.set(l.vintageId, {
      qty: (b?.qty ?? 0) + Math.max(0, l.qty),
      at: b && b.at > (l.boughtOn ?? l.createdAt) ? b.at : (l.boughtOn ?? l.createdAt),
    });
  }

  const rows = vintages
    .filter((v) => byVintage.has(v.id) || bought.has(v.id))
    .map((v) => {
      const ts = byVintage.get(v.id) ?? [];
      const titles = ts.flatMap((x) =>
        x.listItemId && itemList.get(x.listItemId) ? [listTitle.get(itemList.get(x.listItemId)!) ?? ""] : [],
      );
      const scores = ts.map((x) => x.score).filter((n): n is number => n !== null);
      const last = ts.length ? ts.reduce((a, b) => (a.tastedAt > b.tastedAt ? a : b)) : null;
      const b = bought.get(v.id);
      return {
        v,
        ts,
        last,
        stock: b?.qty ?? 0,
        // Newest first, whether tasted or bought.
        at: [last?.tastedAt ?? "", b?.at ?? ""].sort().pop()!,
        best: scores.length ? Math.max(...scores) : null,
        hay: words.length ? haystack(v, ts, titles) : "",
      };
    })
    .filter((r) => words.every((w) => r.hay.includes(w)))
    .filter((r) => !color || r.v.color === color)
    .filter((r) => minScore === null || (r.best ?? 0) >= minScore)
    .filter((r) => !again || r.ts.some((x) => x.buyAgain))
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <input
        type="search"
        class="search"
        placeholder={t("搜酒名、酒庄、产区、品种、香气、笔记")}
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />
      <div class="chips scroll filters">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            class={color === c ? "chip on" : "chip"}
            onClick={() => setColor(color === c ? null : c)}
          >
            {p(COLOR_WORDS[c])}
          </button>
        ))}
        {[90, 85].map((n) => (
          <button
            key={n}
            type="button"
            class={minScore === n ? "chip on" : "chip"}
            onClick={() => setMinScore(minScore === n ? null : n)}
          >
            {n}+
          </button>
        ))}
        <button type="button" class={again ? "chip on" : "chip"} onClick={() => setAgain(!again)}>
          {t("还会买")}
        </button>
      </div>
      {rows.length === 0 ? (
        <p class="empty">
          {tastings.length || cellar.length ? t("没有找到") : t("喝过的和买过的每一款酒都会出现在这里，离线也能搜。")}
        </p>
      ) : (
        <>
          <p class="muted small">{t("{n} 款酒", { n: rows.length })}</p>
          <ul class="rows">
            {rows.map(({ v, ts, last, best, stock }) => {
              const lastList = last?.listItemId ? listTitle.get(itemList.get(last.listItemId) ?? "") : undefined;
              return (
                <li key={v.id}>
                  <a class="row" href={`/wine/${v.id}`}>
                    <Glass color={glassColor(v.color, last?.appearance, v.year)} />
                    <span class="row-main">
                      <WineName v={v} />
                      {lastList && <span class="row-list">{lastList}</span>}
                      {stock > 0 && <span class="stock-tag">{t("存 {n} 瓶", { n: stock })}</span>}
                    </span>
                    <span class="row-side">
                      <span class="row-score num">{best ?? "—"}</span>
                      <span class="muted small">
                        {ts.length > 1
                          ? t("{n} 次", { n: ts.length })
                          : last
                            ? fmtDate(last.tastedAt, false)
                            : t("还没喝")}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
