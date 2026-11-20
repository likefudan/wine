import type { ComponentChildren } from "preact";
import { DESCRIPTORS, DESCRIPTOR_BY_ID } from "../shared/descriptors";
import { grapeName } from "../shared/grapes";
import { growthOf, suggestStandard } from "../shared/growth";
import { DEPTH_INFO } from "./depths";
import { currentLang, p, t } from "./i18n";
import { updateMe, useStore } from "./store";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 2026年11月 / Nov 2026 */
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return currentLang() === "en" ? `${MONTHS[m - 1]} ${y}` : `${y}年${m}月`;
};

/**
 * 我 → 我的品酒 (docs/design.zh.md §3.4): the aromas I can name, the grapes and countries I have tried,
 * and month by month how my notes change. Nothing here is a grade: it only shows what I wrote.
 * `taste`: what I like (Recs.tsx TasteSections), shown between the numbers and the months.
 */
export function GrowthPanel(props: { taste?: ComponentChildren }) {
  const tastings = useStore((s) => s.tastings);
  const vintages = useStore((s) => s.vintages);
  const depth = useStore((s) => s.me?.depth ?? null);
  const lang = currentLang();
  const g = growthOf(tastings, vintages);
  if (!g.wines)
    return (
      <section class="group" role="tabpanel">
        <p class="muted small">{t("记几款酒之后，这里会显示你认识了哪些香气、喝过哪些品种，以及每个月的变化。")}</p>
      </section>
    );
  const maxWords = Math.max(1, ...g.months.map((m) => m.wordsPerWine));
  return (
    <div role="tabpanel" class="growth">
      <section class="group">
        <div class="stat-row">
          <div class="stat">
            <strong>{g.wines}</strong>
            <span>{t("款酒")}</span>
          </div>
          <div class="stat">
            <strong>{g.words.length}</strong>
            <span>{t("种香气")}</span>
          </div>
          <div class="stat">
            <strong>{g.grapes.length}</strong>
            <span>{t("个品种")}</span>
          </div>
          <div class="stat">
            <strong>{g.countries.length}</strong>
            <span>{t("个国家")}</span>
          </div>
        </div>
      </section>

      {suggestStandard(g, depth) && (
        <section class="group notice-card">
          <p>
            {t("你已经用入门记了 {n} 款酒。想不想试试进阶？它按专业品酒的四步走，用滑块代替问题。", {
              n: g.byDepth.beginner,
            })}
          </p>
          <button type="button" class="button small" onClick={() => updateMe({ depth: "standard" })}>
            {t("以后默认用进阶")}
          </button>
        </section>
      )}

      {props.taste}

      <section class="group">
        <h2 class="group-title">{t("每个月")}</h2>
        <ul class="growth-months">
          {[...g.months].reverse().map((m) => (
            <li key={m.month}>
              <div class="growth-month-head">
                <strong>{monthLabel(m.month)}</strong>
                <span class="small muted">
                  {t("{n} 款", { n: m.wines })}
                  {m.avgScore !== null && ` · ${t("平均 {s} 分", { s: m.avgScore })}`}
                  {` · ${t(DEPTH_INFO[m.depth].name)}`}
                </span>
              </div>
              <div class="growth-bar" aria-hidden="true">
                <span style={{ width: `${(m.wordsPerWine / maxWords) * 100}%` }} />
              </div>
              <div class="small">{t("每款平均 {n} 个香气词", { n: m.wordsPerWine })}</div>
              {m.newWords.length > 0 && (
                <div class="small muted">
                  {t("新认识：{words}", {
                    words:
                      m.newWords
                        .slice(0, 8)
                        .map((id) => (DESCRIPTOR_BY_ID.get(id) ? p(DESCRIPTOR_BY_ID.get(id)!.name) : id))
                        .join(lang === "en" ? ", " : "、") + (m.newWords.length > 8 ? "…" : ""),
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section class="group">
        <h2 class="group-title">{t("认识的香气")}</h2>
        <p class="small muted">
          {t("词表里一共 {all} 个，你已经用过 {n} 个。", {
            all: DESCRIPTORS.filter((d) => d.wset.length).length,
            n: g.words.length,
          })}
        </p>
        <div class="chips">
          {g.words.map((w) => (
            <span key={w.id} class="chip static">
              {DESCRIPTOR_BY_ID.get(w.id) ? p(DESCRIPTOR_BY_ID.get(w.id)!.name) : w.id}
              <span class="count">{w.n}</span>
            </span>
          ))}
        </div>
      </section>

      {g.grapes.length > 0 && (
        <section class="group">
          <h2 class="group-title">{t("喝过的品种")}</h2>
          <div class="chips">
            {g.grapes.map((x) => (
              <span key={x.name} class="chip static">
                {grapeName(x.name, lang)}
                <span class="count">{x.n}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {g.countries.length > 0 && (
        <section class="group">
          <h2 class="group-title">{t("喝过的国家和产区")}</h2>
          <p class="small muted">{t("{c} 个国家，{r} 个产区", { c: g.countries.length, r: g.regions })}</p>
          <div class="chips">
            {g.countries.map((x) => (
              <span key={x.name} class="chip static">
                {x.name}
                <span class="count">{x.n}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
