import { useLocation } from "preact-iso";
import { goBack } from "../nav";
import { useEffect, useMemo, useState } from "preact/hooks";
import { bottleCount, windowLabel } from "../../shared/cellar";
import { FAMILY_BY_ID } from "../../shared/descriptors";
import { COLOR_WORDS, glassColor } from "../../shared/guide";
import { grapeName } from "../../shared/grapes";
import { placePath } from "../../shared/place";
import { searchLinks } from "../../shared/reviews";
import { STRETCHES, type Stretch, pickStretch } from "../../shared/stretch";
import {
  type Band,
  type Candidate,
  type Feature,
  OCCASIONS,
  type Occasion,
  type StructDim,
  type TasteProfile,
  type TonightPick,
  type TonightReason,
  daySeed,
  nextPicks,
  recsQuery,
  stretchWines,
  tasteProfile,
  tonightPicks,
} from "../../shared/taste";
import { useCellarAlerts } from "../CellarAlerts";
import { BackIcon, Glass, WineName } from "../components";
import { currentLang, p, t, tk } from "../i18n";
import { api, openBottle, useStore } from "../store";
import "../recs.css";

/**
 * 第四期 推荐 (docs/design.zh.md §11): 今晚开哪瓶 from my cellar, 下一款试试 from wines I have not had,
 * and one 进阶 step. The profile and the ranking run on the phone (src/shared/taste.ts); only the
 * candidates for 下一款 come from the server. No AI call anywhere, so it costs nothing.
 */

export function useProfile(): TasteProfile {
  const tastings = useStore((s) => s.tastings);
  const vintages = useStore((s) => s.vintages);
  const pro = useStore((s) => s.proScores);
  return useMemo(() => tasteProfile(tastings, vintages, pro), [tastings, vintages, pro]);
}

/** A feature as words: 赤霞珠, 红色水果, Napa Valley. */
export function featureName(f: Pick<Feature, "kind" | "key">): string {
  const lang = currentLang();
  if (f.kind === "grape") return grapeName(f.key, lang);
  if (f.kind === "family") {
    const fam = FAMILY_BY_ID.get(f.key);
    return fam ? p(fam.name) : f.key;
  }
  if (f.kind === "color") return p(COLOR_WORDS[f.key as keyof typeof COLOR_WORDS]);
  return f.key;
}

const OCCASION_NAME: Record<Occasion, string> = {
  any: tk("随便"),
  weeknight: tk("日常小酌"),
  special: tk("值得庆祝"),
  light: tk("清爽一点"),
  rich: tk("浓郁一点"),
};

function reasonText(r: TonightReason): string {
  switch (r.k) {
    case "past":
      return t("已过适饮期，别再等了");
    case "last":
      return t("今年是适饮期最后一年");
    case "entering":
      return t("今年刚进入适饮期");
    case "ready":
      return t("正在适饮期");
    case "wait":
      return t("还没到适饮期，可以再放放");
    case "mine":
      return t("你以前给这款酒 {s} 分", { s: r.score });
    case "like":
      return t("你给{name}的酒平均 {s} 分", { name: featureName(r.f), s: Math.round(r.f.avg) });
    case "many":
      return t("还有 {n} 瓶，开一瓶不心疼", { n: r.qty });
    case "everyday":
      return t("在你的酒窖里算日常价位");
    case "treat":
      return t("是你酒窖里比较贵的一瓶");
    case "light":
      return t("清爽，不压菜");
    case "rich":
      return t("红酒，够浓郁");
  }
}

/** /recs */
export function RecsPage() {
  const { route } = useLocation();
  const profile = useProfile();
  const lots = useStore((s) => s.cellar);
  const full = lots.filter((l) => l.qty > 0);
  return (
    <div class="page recs">
      <header class="page-head pin">
        <button type="button" class="icon-button" aria-label={t("返回")} onClick={() => goBack(route, "/")}>
          <BackIcon />
        </button>
        <h1 class="page-head-title">{t("为你推荐")}</h1>
      </header>
      <ConfidenceNote profile={profile} />
      {full.length > 0 && <Tonight profile={profile} />}
      <NextToTry profile={profile} />
    </div>
  );
}

function ConfidenceNote(props: { profile: TasteProfile }) {
  const { profile } = props;
  return (
    <p class="muted small">
      {profile.confidence === "none"
        ? t("给至少 3 款酒打了分，推荐才会按你的口味来。记得越多越准，大约 50 款之后最准。")
        : profile.confidence === "solid"
          ? t("根据你打过分的 {n} 款酒。", { n: profile.scored })
          : t("根据你打过分的 {n} 款酒。记得越多越准，大约 50 款之后最准。", { n: profile.scored })}{" "}
      <a href="/me">{t("我的口味")}</a>
    </p>
  );
}

// ── 今晚开哪瓶 ──

function Tonight(props: { profile: TasteProfile }) {
  const { route } = useLocation();
  const lots = useStore((s) => s.cellar);
  const vintages = useStore((s) => s.vintages);
  const tastings = useStore((s) => s.tastings);
  const proWindows = useStore((s) => s.proWindows);
  const [occasion, setOccasion] = useState<Occasion>("any");
  const lang = currentLang();
  const picks = tonightPicks(lots, vintages, tastings, proWindows, props.profile, occasion);
  const open = (pick: TonightPick) => {
    const x = openBottle(pick.lot.id, true);
    if (x) route(`/taste/${x.id}?new=1`);
  };
  return (
    <section class="group">
      <h2 class="group-title">{t("今晚开哪瓶")}</h2>
      <p class="small muted">
        {t("从酒窖里 {n} 瓶中挑：先看适饮期，再看你的口味。", { n: bottleCount(lots.filter((l) => l.qty > 0)) })}
      </p>
      <div class="chips scroll" role="radiogroup" aria-label={t("场合")}>
        {OCCASIONS.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={occasion === o}
            class={occasion === o ? "chip on" : "chip"}
            onClick={() => setOccasion(o)}
          >
            {t(OCCASION_NAME[o])}
          </button>
        ))}
      </div>
      <ol class="rec-list">
        {picks.map((pick, i) => (
          <li key={pick.lot.id} class="rec-card">
            <a class="rec-head" href={`/cellar/${pick.lot.id}`}>
              <Glass color={glassColor(pick.v.color, undefined, pick.v.year)} size={30} />
              <WineName v={pick.v} />
              <span class="row-score num">×{pick.lot.qty}</span>
            </a>
            <ul class="rec-why">
              {pick.reasons.map((r) => (
                <li key={r.k}>{reasonText(r)}</li>
              ))}
              {pick.window && (pick.window.from !== null || pick.window.to !== null) && (
                <li class="muted">
                  {t("适饮期")} {windowLabel(pick.window, lang)}
                </li>
              )}
              {pick.lot.location && <li class="muted">{pick.lot.location}</li>}
            </ul>
            <button type="button" class={i === 0 ? "button small primary" : "button small"} onClick={() => open(pick)}>
              {t("开一瓶，品一款")}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── 下一款试试 ──

type Loaded =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "error" }
  | { status: "done"; list: Candidate[] };

function NextToTry(props: { profile: TasteProfile }) {
  const { profile } = props;
  const [seed, setSeed] = useState(daySeed());
  const [skip, setSkip] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const liked = profile.features.filter((f) => f.kind === "grape" && f.delta > 0).map((f) => f.key);
  const stretch = pickStretch(liked, profile.triedGrapes, skip);
  const ready = profile.confidence !== "none";
  const query = ready
    ? recsQuery(profile, stretch, seed)
    : { ...recsQuery(profile, stretch, seed), grapes: [], regions: [], areas: [], producers: [] };
  const key = JSON.stringify(query);
  useEffect(() => {
    if (navigator.onLine === false) {
      setLoaded({ status: "offline" });
      return;
    }
    const ctl = new AbortController();
    setLoaded({ status: "loading" });
    api<{ candidates: Candidate[] }>("/api/recs", { body: query, signal: ctl.signal })
      .then((r) => setLoaded({ status: "done", list: r.candidates }))
      .catch(() => !ctl.signal.aborted && setLoaded({ status: "error" }));
    return () => ctl.abort();
  }, [key]);

  const list = loaded.status === "done" ? loaded.list : [];
  const picks = ready ? nextPicks(profile, list) : [];
  return (
    <>
      <section class="group">
        <h2 class="group-title">{t("下一款试试")}</h2>
        {!ready ? (
          <p class="small muted">{t("先给几款酒打分，这里会按你喜欢的品种、产区和酒庄，找你还没喝过的酒。")}</p>
        ) : loaded.status === "loading" ? (
          <p class="small muted" aria-busy="true">
            {t("正在找…")}
          </p>
        ) : loaded.status === "offline" ? (
          <p class="small muted">{t("没有网络，联网后再看。")}</p>
        ) : loaded.status === "error" ? (
          <p class="small muted">{t("没能加载，稍后再试。")}</p>
        ) : picks.length === 0 ? (
          <p class="small muted">{t("暂时没找到合适的。多记几款、多打几次分，就会有了。")}</p>
        ) : (
          <>
            <p class="small muted">{t("和你打高分的酒同品种、同产区或同酒庄，你还没喝过。")}</p>
            <ul class="rec-list">
              {picks.map((x) => (
                <CandidateCard key={x.c.key} c={x.c} why={x.why} />
              ))}
            </ul>
            <button type="button" class="link small" onClick={() => setSeed(seed + 1)}>
              {t("换一批")}
            </button>
          </>
        )}
      </section>
      {stretch && (
        <StretchCard
          s={stretch}
          liked={liked}
          wines={stretchWines(list)}
          loading={loaded.status === "loading"}
          onNext={STRETCHES.length > 1 ? () => setSkip(skip + 1) : undefined}
        />
      )}
    </>
  );
}

function CandidateCard(props: { c: Candidate; why?: Feature[] }) {
  const { c } = props;
  const lang = currentLang();
  const sameName = c.wine.trim().toLowerCase() === c.producer.trim().toLowerCase();
  const sub = [
    c.color ? p(COLOR_WORDS[c.color]) : null,
    c.grapes.length ? c.grapes.map((g) => grapeName(g, lang)).join(" / ") : null,
    placePath(c).slice(-2).join(" › ") || null,
  ].filter(Boolean);
  const links = searchLinks(c.producer, sameName ? "" : c.wine, 0);
  const critic =
    c.critic !== null
      ? t("评论家平均 {s} 分", { s: Math.round(c.critic) })
      : c.community !== null
        ? t("CellarTracker 均分 {s}", { s: Math.round(c.community) })
        : null;
  return (
    <li class="rec-card">
      <div class="rec-head">
        <Glass color={glassColor(c.color ?? "red", undefined, c.year ?? undefined)} size={30} />
        <span class="wine-name">
          <span class="wine-producer">{c.producer}</span>
          {!sameName && <span class="wine-title">{c.wine}</span>}
          {sub.length > 0 && <span class="wine-sub">{sub.join(" · ")}</span>}
        </span>
      </div>
      <ul class="rec-why">
        {(props.why ?? []).slice(0, 2).map((f) => (
          <li key={`${f.kind}:${f.key}`}>
            {t("你给{name}的酒平均 {s} 分", { name: featureName(f), s: Math.round(f.avg) })}
          </li>
        ))}
        {critic && (
          <li class="muted">
            {critic}
            {c.year ? ` (${c.year})` : ""}
          </li>
        )}
      </ul>
      <a class="small" href={links.wineSearcher} target="_blank" rel="noreferrer">
        {t("在 Wine-Searcher 上找")}
      </a>
    </li>
  );
}

function StretchCard(props: {
  s: Stretch;
  liked: string[];
  wines: Candidate[];
  loading: boolean;
  onNext?: () => void;
}) {
  const { s } = props;
  const lang = currentLang();
  const from = s.from.find((g) => props.liked.includes(g));
  return (
    <section class="group stretch">
      <h2 class="group-title">{t("进阶一款")}</h2>
      <p class="stretch-grape">
        <strong>{grapeName(s.grape, lang)}</strong>
        {lang !== "en" && <span class="muted small"> {s.grape}</span>}
      </p>
      {from && <p class="small muted">{t("从你喜欢的{name}往前走一步。", { name: grapeName(from, lang) })}</p>}
      <p>{p(s.text)}</p>
      {props.wines.length > 0 && (
        <>
          <p class="small muted">{t("可以找这样的酒：")}</p>
          <ul class="rec-list">
            {props.wines.map((c) => (
              <CandidateCard key={c.key} c={c} />
            ))}
          </ul>
        </>
      )}
      {props.onNext && (
        <button type="button" class="link small" onClick={props.onNext}>
          {t("换一个")}
        </button>
      )}
    </section>
  );
}

// ── 我的 → 口味 ──

const STRUCT_TEXT: Record<StructDim, Record<Band, string>> = {
  sweetness: { low: tk("干型"), mid: tk("微甜"), high: tk("甜型") },
  acidity: { low: tk("酸度低"), mid: tk("酸度中等"), high: tk("酸度高") },
  tannin: { low: tk("单宁轻"), mid: tk("单宁中等"), high: tk("单宁重") },
  body: { low: tk("酒体轻"), mid: tk("酒体中等"), high: tk("酒体饱满") },
};

const signed = (x: number) => (x > 0 ? `+${x}` : String(x));

/** 我的 → 口味: what my scores say I like, and how I differ from the critics. */
/** What I like, inside 我 → 我的品酒 (Growth.tsx): the sections only, between the numbers and the months. */
export function TasteSections() {
  const profile = useProfile();
  if (profile.confidence === "none")
    return (
      <section class="group">
        <h2 class="group-title">{t("你偏爱")}</h2>
        <p class="muted small">
          {t("给至少 3 款酒打了分，这里会显示你偏爱的品种、产区和风格，以及你和评论家的差别。")}
        </p>
      </section>
    );
  const gapAll = profile.gaps.find((g) => g.kind === "all");
  const gapsBy = profile.gaps.filter((g) => g.kind !== "all" && Math.abs(g.gap) >= 2).slice(0, 4);
  return (
    <>
      <section class="group">
        <h2 class="group-title">{t("你偏爱")}</h2>
        {profile.likes.length === 0 ? (
          <p class="small muted">{t("还看不出明显的偏好。同一个品种或产区多记几款就看得出来了。")}</p>
        ) : (
          <FeatureList list={profile.likes} />
        )}
        {profile.structure.length > 0 && (
          <p class="small">
            {t("口感上，你给分更高的是：")}
            {profile.structure.map((s) => t(STRUCT_TEXT[s.dim][s.band])).join(t("、"))}
          </p>
        )}
        <p class="small muted">
          {t("打过分的 {n} 款，平均 {s} 分。", { n: profile.scored, s: profile.baseline })}{" "}
          {profile.confidence === "solid"
            ? t("数字是和你自己的平均分比：+3 表示这类酒你平均多给 3 分。")
            : t("数字是和你自己的平均分比：+3 表示这类酒你平均多给 3 分。现在记得还不多，只能当参考。")}
        </p>
      </section>

      {profile.dislikes.length > 0 && (
        <section class="group">
          <h2 class="group-title">{t("不太对你胃口")}</h2>
          <FeatureList list={profile.dislikes} />
        </section>
      )}

      <section class="group">
        <h2 class="group-title">{t("我与评论家")}</h2>
        {!gapAll ? (
          <p class="small muted">{t("查过专业评价的酒多了，这里会显示同一款酒上你和评论家打分的差别。")}</p>
        ) : (
          <>
            <p>
              {Math.abs(gapAll.gap) < 1
                ? t("同样的酒，你和评论家的打分差不多（{n} 款）。", { n: gapAll.n })
                : gapAll.gap > 0
                  ? t("同样的酒，你平均比评论家高 {d} 分（{n} 款）。", { d: gapAll.gap, n: gapAll.n })
                  : t("同样的酒，你平均比评论家低 {d} 分（{n} 款）。", { d: -gapAll.gap, n: gapAll.n })}
            </p>
            {gapsBy.length > 0 && (
              <ul class="taste-gaps small">
                {gapsBy.map((g) => (
                  <li key={`${g.kind}:${g.key}`}>
                    {featureName(g as Pick<Feature, "kind" | "key">)} <span class="num">{signed(g.gap)}</span>
                    <span class="muted"> · {t("{n} 款", { n: g.n })}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <a class="button" href="/recs">
          {t("看看为你推荐的酒")}
        </a>
      </section>
    </>
  );
}

function FeatureList(props: { list: Feature[] }) {
  return (
    <ul class="chips taste-features">
      {props.list.map((f) => (
        <li key={`${f.kind}:${f.key}`} class="chip static">
          {featureName(f)}
          <span class={f.delta > 0 ? "num taste-up" : "num taste-down"}>{signed(f.delta)}</span>
          <span class="muted small">{t("{n} 款", { n: f.n })}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Home ──

/** The home page's line: tonight's bottle, or a pointer to 下一款试试 once there is a profile. */
export function RecsHomeCard() {
  const profile = useProfile();
  const lots = useStore((s) => s.cellar);
  const vintages = useStore((s) => s.vintages);
  const tastings = useStore((s) => s.tastings);
  const proWindows = useStore((s) => s.proWindows);
  // The 酒窖提醒 line already says what is due: one line at a time.
  const alerts = useCellarAlerts();
  const top = lots.some((l) => l.qty > 0)
    ? tonightPicks(lots, vintages, tastings, proWindows, profile, "any", undefined, 1)[0]
    : undefined;
  if (alerts.length || (!top && profile.confidence === "none")) return null;
  const sameName = top && top.v.wine.trim().toLowerCase() === top.v.producer.trim().toLowerCase();
  return (
    <a href="/recs" class="notice recs-home">
      <strong>{top ? t("今晚开哪瓶") : t("为你推荐")}</strong>{" "}
      {top ? `${top.v.producer}${sameName ? "" : ` ${top.v.wine}`}` : t("下一款试什么？按你的口味挑")}
      <span class="recs-home-go" aria-hidden="true">
        ›
      </span>
    </a>
  );
}
