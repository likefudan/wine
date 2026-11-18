import { useState } from "preact/hooks";
import { DESCRIPTOR_BY_ID } from "../../shared/descriptors";
import { GRAPES } from "../../shared/grapes";
import { COLOR_WORDS, glassColor } from "../../shared/guide";
import { COLORS, type Tasting, type VintageInfo, type WineColor, nameKey, yearLabel } from "../../shared/model";
import { areaOf } from "../../shared/place";
import { Glass, WineName } from "../components";
import { fmtDate, p, t } from "../i18n";
import { useStore } from "../store";

/**
 * 酒库: everything I've tasted, searched on the phone (docs/design.zh.md §3.7): wine, producer,
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
      areaOf(v.appellation),
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

export function Library() {
  const vintages = useStore((s) => s.vintages);
  const tastings = useStore((s) => s.tastings);
  const items = useStore((s) => s.items);
  const lists = useStore((s) => s.lists);
  const [q, setQ] = useState("");
  const [color, setColor] = useState<WineColor | null>(null);
  const [minScore, setMinScore] = useState<number | null>(null);
  const [again, setAgain] = useState(false);

  const listTitle = new Map(lists.map((l) => [l.id, l.title]));
  const itemList = new Map(items.map((i) => [i.id, i.listId]));
  const byVintage = new Map<string, Tasting[]>();
  for (const x of tastings) byVintage.set(x.vintageId, [...(byVintage.get(x.vintageId) ?? []), x]);
  const words = nameKey(q).split(" ").filter(Boolean);

  const rows = vintages
    .filter((v) => byVintage.has(v.id))
    .map((v) => {
      const ts = byVintage.get(v.id)!;
      const titles = ts.flatMap((x) =>
        x.listItemId && itemList.get(x.listItemId) ? [listTitle.get(itemList.get(x.listItemId)!) ?? ""] : [],
      );
      const scores = ts.map((x) => x.score).filter((n): n is number => n !== null);
      return {
        v,
        ts,
        last: ts.reduce((a, b) => (a.tastedAt > b.tastedAt ? a : b)),
        best: scores.length ? Math.max(...scores) : null,
        hay: words.length ? haystack(v, ts, titles) : "",
      };
    })
    .filter((r) => words.every((w) => r.hay.includes(w)))
    .filter((r) => !color || r.v.color === color)
    .filter((r) => minScore === null || (r.best ?? 0) >= minScore)
    .filter((r) => !again || r.ts.some((x) => x.buyAgain))
    .sort((a, b) => b.last.tastedAt.localeCompare(a.last.tastedAt));

  return (
    <div class="page">
      <h1 class="visually-hidden">{t("酒库")}</h1>
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
        <p class="empty">{tastings.length ? t("没有找到") : t("记下的每一款酒都会出现在这里，离线也能搜。")}</p>
      ) : (
        <>
          <p class="muted small">{t("{n} 款酒", { n: rows.length })}</p>
          <ul class="rows">
            {rows.map(({ v, ts, last, best }) => (
              <li key={v.id}>
                <a class="row" href={`/wine/${v.id}`}>
                  <Glass color={glassColor(v.color, last.appearance, v.year)} />
                  <WineName v={v} />
                  <span class="row-side">
                    <span class="row-score num">{best ?? "—"}</span>
                    <span class="muted small">
                      {ts.length > 1 ? t("{n} 次", { n: ts.length }) : fmtDate(last.tastedAt, false)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
