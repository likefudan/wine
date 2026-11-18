import { useLocation, useRoute } from "preact-iso";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  BEGINNER_GROUPS,
  type DESCRIPTORS,
  type Level,
  DESCRIPTOR_BY_ID,
  FAMILIES,
  type Tri,
  wordsOf,
} from "../../shared/descriptors";
import {
  BODY_WORDS,
  DEPTH_WORDS,
  DEVELOPMENT_WORDS,
  FINISH_WORDS,
  type GuideQuestion,
  HUE_WORDS,
  LEVEL_WORDS,
  MOUSSE_WORDS,
  QUALITY_WORDS,
  READINESS_WORDS,
  REASON_WORDS,
  SWEETNESS_WORDS,
  beginnerQuestions,
  glassColor,
  INTENSITY_WORDS,
  L2_SWEETNESS,
  l2SweetnessOf,
  l2Three,
  l2ThreeOf,
  huesFor,
  swatch,
  tastingNote,
} from "../../shared/guide";
import { COMPARABLE, compareLine, isComparable, nudge, previousTasting, scaleValue } from "../../shared/compare";
import { aromasInNote } from "../../shared/notewords";
import {
  DEPTHS,
  type Depth,
  type Tasting,
  type TastingDescriptor,
  type VintageInfo,
  toDepth,
} from "../../shared/model";
import { BackIcon, BottleIcon, Choice, Field, Glass, ScoreSlider, WineName } from "../components";
import { ask } from "../confirm";
import { DEPTH_INFO } from "../depths";
import { currentLang, p, t, tk } from "../i18n";
import { deleteTasting, flushPending, getState, saveTasting as saveAll, updateMe, useStore } from "../store";
import { ShareIcon, TastingShareSheet } from "../TastingCard";
import { TastingPlace } from "../TastingPlace";
import { AddToCellarSheet, BoughtToCellar, TastingFromCellar } from "./Cellar";
import { BlindResult, GuessCard, blindShown } from "../Blind";
import { isBlindId } from "../../shared/blind";

/**
 * 品鉴: one sheet, four depths over the same fields (docs/design.zh.md §3.3, §3.4). Switching depth
 * applies to this wine only and keeps what was answered; after three switches it offers to change
 * the default. Every change is saved on the phone at once.
 */

type Patch = (change: Partial<Tasting>) => void;
/** The place is set by TastingPlace straight in the store: this page's copy of it may be stale. */
// The place and the 酒窖 bottle are set elsewhere (TastingPlace, TastingFromCellar): never overwritten from here.
const saveTasting = (x: Tasting) => saveAll({ ...x, location: undefined, cellarId: undefined });
const redLike = (v: VintageInfo, x: Tasting): "red" | "white" =>
  v.color === "red" || huesFor(v.color, x.appearance.hue)[0] === "purple" ? "red" : "white";

export function Taste() {
  const { params } = useRoute();
  const { route, query } = useLocation();
  const saved = useStore((s) => s.tastings.find((x) => x.id === params.id));
  const vintage = useStore((s) => (saved ? s.vintages.find((v) => v.id === saved.vintageId) : undefined));
  const defaultDepth = useStore((s) => s.me?.depth ?? "quick");
  /** The tasting (酒单) this note belongs to, named at the top so it is clear which series it is in. */
  /** 盲品 in a 品鉴: the price is on the glass. */
  const itemPrice = useStore((s) =>
    saved?.listItemId ? (s.items.find((i) => i.id === saved.listItemId)?.priceUsd ?? null) : null,
  );
  const list = useStore((s) => {
    const item = saved?.listItemId ? s.items.find((i) => i.id === saved.listItemId) : undefined;
    return item ? s.lists.find((l) => l.id === item.listId) : undefined;
  });
  const prevTasting = useStore((s) => (saved ? previousTasting(saved, s.items, s.tastings) : null));
  const prevVintage = useStore((s) =>
    prevTasting ? s.vintages.find((v) => v.id === prevTasting.vintageId) : undefined,
  );
  const prev: Prev | null = prevTasting ? { t: prevTasting, v: blindShown(prevTasting, prevVintage) } : null;
  const [x, setX] = useState<Tasting | undefined>(saved);
  const [switches, setSwitches] = useState(0);
  const [offer, setOffer] = useState<Depth | null>(null);
  const [sharing, setSharing] = useState(false);
  const [buying, setBuying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(x);

  useEffect(() => {
    if (!x && saved) setX(saved);
    // The server kept another id for this wine while the page was open.
    else if (x && saved && saved.vintageId !== x.vintageId) setX({ ...x, vintageId: saved.vintageId });
  }, [saved?.id, saved?.vintageId]);
  // Leaving the page sends the last change at once.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (latest.current) saveTasting(latest.current);
      }
      flushPending();
    },
    [],
  );

  /** 盲品 before its answer: the forms get a stand-in with the colour seen in the glass. */
  const v = x ? blindShown(x, vintage) : undefined;
  const blindOpen = !!x && isBlindId(x.vintageId);
  if (!x || !v)
    return (
      <div class="page">
        <p class="empty">{t("找不到这条记录")}</p>
        <a href="/">{t("回到品鉴")}</a>
      </div>
    );

  // A note saved as 专业 before it merged into 进阶 opens as 进阶.
  const depth = toDepth(x.depth) ?? "quick";
  const patch: Patch = (change) => {
    const next = { ...x, ...change };
    setX(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      saveTasting(next);
    }, 400);
  };
  const switchDepth = (d: Depth) => {
    if (d === depth) return;
    patch({ depth: d });
    const n = switches + 1;
    setSwitches(n);
    if (n >= 3 && d !== defaultDepth) setOffer(d);
  };
  const done = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      saveTasting(x);
    }
    // 完成 uploads now: in a shared list friends see it, and nothing waits on the phone.
    flushPending();
    route(backOf(x), true);
  };

  return (
    <div class="page taste">
      <header class="page-head sticky">
        {list && (
          <p class="belongs">
            {t("属于")} <strong>{list.title}</strong>
          </p>
        )}
        <button type="button" class="icon-button" aria-label={t("返回")} onClick={done}>
          <BackIcon />
        </button>
        <div class="page-head-title taste-wine">
          <Glass color={glassColor(v.color, x.appearance, v.year)} size={30} />
          <WineName v={v} sub={blindOpen} />
        </div>
        <button type="button" class="button primary small" onClick={done}>
          {t("完成")}
        </button>
      </header>
      <div class="depth-tabs" role="tablist" aria-label={t("品鉴深度")}>
        {DEPTHS.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={depth === d}
            class={depth === d ? "on" : ""}
            onClick={() => switchDepth(d)}
          >
            {t(DEPTH_INFO[d].name)}
          </button>
        ))}
      </div>
      {offer && (
        <div class="notice row-notice">
          <span>{t("以后默认用「{d}」吗？", { d: t(DEPTH_INFO[offer].name) })}</span>
          <button
            type="button"
            class="link"
            onClick={() => {
              updateMe({ depth: offer });
              setOffer(null);
            }}
          >
            {t("好")}
          </button>
          <button type="button" class="link" onClick={() => setOffer(null)}>
            {t("不用")}
          </button>
        </div>
      )}
      {x.blind && !blindOpen && <BlindResult x={x} v={v} priceUsd={itemPrice} />}
      <TastingPlace id={x.id} fresh={query.new === "1"} />
      {saved && !blindOpen && <TastingFromCellar x={saved} fresh={query.new === "1"} />}
      {depth === "quick" && <Quick x={x} v={v} patch={patch} />}
      {depth === "beginner" && <Beginner x={x} v={v} patch={patch} prev={prev} />}
      {depth === "standard" && <Systematic x={x} v={v} patch={patch} prev={prev} />}
      {blindOpen && <GuessCard x={x} color={v.color} onChange={(guesses) => patch({ guesses })} />}
      <div class="taste-foot">
        {blindOpen ? (
          <a
            class="button primary block"
            href={list ? `/answers/${list.id}` : `/add?answer=${x.id}`}
            onClick={() => {
              if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
                saveTasting(x);
              }
            }}
          >
            {t("对答案")}
          </a>
        ) : (
          <>
            <button type="button" class="button block" onClick={() => setSharing(true)}>
              <ShareIcon /> {t("生成分享图")}
            </button>
            <button type="button" class="button block" onClick={() => setBuying(true)}>
              <BottleIcon /> {t("买了这款酒？放进酒窖")}
            </button>
          </>
        )}
        <button
          type="button"
          class="link danger small"
          onClick={async () => {
            if (!(await ask(t("删除这条品鉴记录？"), { ok: t("删除") }))) return;
            // A bottle opened from the 酒窖 by mistake goes back on the shelf.
            const putBack =
              !!saved?.cellarId &&
              getState().cellar.some((l) => l.id === saved.cellarId) &&
              (await ask(t("这瓶是从酒窖开的，要放回酒窖吗？"), { ok: t("放回酒窖") }));
            if (timer.current) clearTimeout(timer.current);
            timer.current = null;
            latest.current = undefined;
            deleteTasting(x.id, putBack);
            route(backOf(x), true);
          }}
        >
          {t("删除这条记录")}
        </button>
      </div>
      {buying && saved && !blindOpen && <AddToCellarSheet x={saved} onClose={() => setBuying(false)} />}
      {sharing && vintage && (
        <TastingShareSheet
          v={vintage}
          x={x}
          onClose={() => setSharing(false)}
          onPhoto={(photoId) => patch({ photoId })}
        />
      )}
    </div>
  );
}

/** Back to the list the wine is in, else the wine's page in the library. */
function backOf(x: Tasting): string {
  const listId = x.listItemId ? getState().items.find((i) => i.id === x.listItemId)?.listId : undefined;
  return listId ? `/lists/${listId}` : isBlindId(x.vintageId) ? "/" : `/wine/${x.vintageId}`;
}

// ── Shared pieces ────────────────────────────────────────────────────────────────────────────

function Conclusion(props: { x: Tasting; patch: Patch; standard?: boolean }) {
  const { x, patch } = props;
  return (
    <section class="step">
      <ScoreSlider value={x.score} onChange={(score) => patch({ score })} />
      <Field label={t("还会买吗？")} group>
        <Choice
          label={t("还会买吗？")}
          value={x.buyAgain === null ? undefined : x.buyAgain ? "yes" : "no"}
          options={[
            { value: "yes", label: t("会") },
            { value: "no", label: t("不会") },
          ]}
          onChange={(v) => patch({ buyAgain: v === undefined ? null : v === "yes" })}
        />
      </Field>
      {props.standard && (
        <>
          <Field label={t("品质等级")} hint={t("「我的分」记你有多喜欢，这里记客观判断")} group>
            <Choice
              label={t("品质等级")}
              value={x.quality ?? undefined}
              options={Object.entries(QUALITY_WORDS).map(([k, w]) => ({ value: k, label: p(w) }))}
              onChange={(v) => patch({ quality: v ?? null })}
            />
          </Field>
          <div class="field-row">
            <Field label={t("买了几瓶")}>
              <input
                inputMode="numeric"
                value={x.boughtQty ?? ""}
                onInput={(e) => {
                  const n = Number((e.target as HTMLInputElement).value);
                  patch({
                    boughtQty:
                      (e.target as HTMLInputElement).value === "" || !Number.isFinite(n)
                        ? null
                        : Math.max(0, Math.round(n)),
                  });
                }}
              />
            </Field>
            <Field label={t("价格 $")}>
              <input
                inputMode="decimal"
                value={x.priceUsd ?? ""}
                onInput={(e) => {
                  const n = Number((e.target as HTMLInputElement).value);
                  patch({
                    priceUsd:
                      (e.target as HTMLInputElement).value === "" || !Number.isFinite(n) ? null : Math.max(0, n),
                  });
                }}
              />
            </Field>
          </div>
          {!isBlindId(x.vintageId) && <BoughtToCellar x={x} />}
        </>
      )}
      <NoteField x={x} patch={patch} rows={props.standard ? 5 : 2} />
    </section>
  );
}

/**
 * 一句话, and under it the vocabulary words the note mentions that aren't tags yet (自由文字转香气标签,
 * src/shared/notewords.ts): one tap adds them, so「很多黑樱桃和雪茄盒」becomes two tags.
 */
function NoteField(props: { x: Tasting; patch: Patch; rows: number }) {
  const { x, patch } = props;
  const have = new Set(x.descriptors.map((d) => d.id));
  const found = aromasInNote(x.note, currentLang()).filter((id) => !have.has(id));
  const add = (ids: string[]) => patch({ descriptors: [...x.descriptors, ...ids.map((id) => ({ id, intensity: 2 }))] });
  return (
    <Field label={t("一句话")}>
      <textarea
        rows={props.rows}
        maxLength={4000}
        value={x.note ?? ""}
        placeholder={t("可以用键盘上的话筒说")}
        onInput={(e) => patch({ note: (e.target as HTMLTextAreaElement).value || null })}
      />
      {found.length > 0 && (
        <div class="note-words">
          <span class="small muted">{t("笔记里提到的香气，点一下加为标签：")}</span>
          <div class="chips">
            {found.map((id) => (
              <button key={id} type="button" class="chip suggest" onClick={() => add([id])}>
                + {p(DESCRIPTOR_BY_ID.get(id)!.name)}
              </button>
            ))}
            {found.length > 1 && (
              <button type="button" class="link small" onClick={() => add(found)}>
                {t("全部加上")}
              </button>
            )}
          </div>
        </div>
      )}
    </Field>
  );
}

/** A list of chosen words and how to change it: the nose's aromas, or the palate's flavours. */
interface Words {
  value: TastingDescriptor[];
  set: (d: TastingDescriptor[]) => void;
}
const aromasOf = (x: Tasting, patch: Patch): Words => ({
  value: x.descriptors,
  set: (descriptors) => patch({ descriptors }),
});
const flavoursOf = (x: Tasting, patch: Patch): Words => ({
  value: (x.palate.flavours ?? []).map((id) => ({ id, intensity: 2 })),
  set: (d) => patch({ palate: { ...x.palate, flavours: d.map((s) => s.id) } }),
});

/** Chips for aroma words; tap to add, tap again to remove (专业: tap cycles the strength). */
function AromaChips(props: { ids: string[]; w: Words; strength?: boolean; row?: boolean }) {
  const { value, set } = props.w;
  const toggle = (id: string) => {
    const has = value.find((d) => d.id === id);
    if (!has) return set([...value, { id, intensity: 2 }]);
    if (props.strength && has.intensity < 3)
      return set(value.map((d) => (d.id === id ? { ...d, intensity: d.intensity + 1 } : d)));
    set(value.filter((d) => d.id !== id));
  };
  return (
    <div class={props.row ? "chips family-row" : "chips"}>
      {props.ids.map((id) => {
        const d = DESCRIPTOR_BY_ID.get(id)!;
        const on = value.find((s) => s.id === id);
        return (
          <button
            key={id}
            type="button"
            class={on ? `chip on s${on.intensity}` : "chip"}
            aria-pressed={!!on}
            title={d.hint ? p(d.hint) : undefined}
            onClick={() => toggle(id)}
          >
            {p(d.name)}
            {props.strength && on ? <span class="dots">{"•".repeat(on.intensity)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The whole vocabulary, by family, with a search box. */
function AromaPicker(props: {
  x: Tasting;
  v: VintageInfo;
  w: Words;
  strength?: boolean;
  placeholder?: string;
  /** Whose word list: 入门 offers WSET Level 2's, 进阶 Level 3's. */
  level?: Level;
}) {
  const [q, setQ] = useState("");
  const color = redLike(props.v, props.x);
  const ql = q.trim().toLowerCase();
  const hit = (d: (typeof DESCRIPTORS)[number]) =>
    !ql ||
    [
      d.name.zh,
      d.name.tw,
      d.name.en.toLowerCase(),
      ...(d.hint ? [d.hint.zh, d.hint.tw, d.hint.en.toLowerCase()] : []),
    ].some((s) => s.includes(ql));
  const chosen = props.w.value.map((d) => d.id);
  // Every family is open, one row each, its words scrolling sideways. Nothing needs a tap to open, so
  // nothing on the page moves: a chosen word stays where it is and only lights up, and the summary
  // of what is chosen sits below the families, where growing only pushes down what comes after.
  return (
    <div class="aroma-picker">
      <input
        type="search"
        class="search small"
        placeholder={props.placeholder ?? t("找香气，例如 雪松")}
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />
      {[1, 2, 3].map((tier) => (
        <div key={tier} class="aroma-tier">
          <span class="tier-label">
            {t(tier === 1 ? tk("一类：来自葡萄") : tier === 2 ? tk("二类：来自酿造") : tk("三类：来自陈年"))}
          </span>
          {FAMILIES.filter((f) => f.tier === tier).map((f) => {
            const all = wordsOf([f.id], color, props.level ?? "L3");
            const words = all.filter(hit);
            if (!words.length) return null;
            const picked = all.filter((d) => chosen.includes(d.id)).length;
            return (
              <div key={f.id} class="aroma-family">
                <span class="family-name">
                  {p(f.name)}
                  {picked > 0 && <span class="family-count">{picked}</span>}
                </span>
                <AromaChips ids={words.map((d) => d.id)} w={props.w} strength={props.strength} row />
              </div>
            );
          })}
        </div>
      ))}
      <ChosenAromas w={props.w} strength={props.strength} />
    </div>
  );
}

/** What is chosen so far, under the word lists so that it never pushes them around. */
function ChosenAromas(props: { w: Words; strength?: boolean; hideEmpty?: boolean }) {
  const ids = props.w.value.map((d) => d.id);
  if (props.hideEmpty && !ids.length) return null;
  return (
    <div class="aroma-chosen">
      <span class="tier-label">{t("已选 {n}", { n: ids.length })}</span>
      {ids.length > 0 ? (
        <AromaChips ids={ids} w={props.w} strength={props.strength} />
      ) : (
        <span class="field-hint">{t("点上面的词，选中的会亮起来")}</span>
      )}
      {props.strength && ids.length > 0 && <span class="field-hint">{t("再点一下加强，点到第三下后移除")}</span>}
    </div>
  );
}

const levels = (words: Tri[]) => words.map((w, i) => ({ value: i + 1, label: p(w) }));

function Hues(props: { x: Tasting; v: VintageInfo; patch: Patch }) {
  const { x, v, patch } = props;
  return (
    <div class="hues">
      {huesFor(v.color, x.appearance.hue).map((h) => (
        <button
          key={h}
          type="button"
          class={x.appearance.hue === h ? "hue on" : "hue"}
          aria-pressed={x.appearance.hue === h}
          onClick={() => patch({ appearance: { ...x.appearance, hue: x.appearance.hue === h ? undefined : h } })}
        >
          <Glass color={swatch(h, x.appearance.intensity ?? 2)} size={40} />
          <span>{p(HUE_WORDS[h]!)}</span>
        </button>
      ))}
    </div>
  );
}

/** 和上一款比: one step less, the same, or one step more than the last wine, on this question's scale. */
function CompareAnswers(props: {
  prev: Prev;
  field: keyof typeof COMPARABLE;
  current: number | undefined;
  onPick: (value: number) => void;
}) {
  const { prev, field } = props;
  const base = scaleValue(prev.t, field)!;
  const words = COMPARABLE[field];
  const opts: { dir: -1 | 0 | 1; label: string }[] = [
    { dir: -1, label: p(words.less) },
    { dir: 0, label: t("差不多") },
    { dir: 1, label: p(words.more) },
  ];
  const name = !prev.v
    ? t("上一款")
    : prev.v.wine.toLowerCase().includes(prev.v.producer.toLowerCase())
      ? prev.v.wine
      : `${prev.v.producer} ${prev.v.wine}`;
  return (
    <div class="compare-prev">
      <p class="small muted">{t("说不准的话，和上一款（{wine}）比：", { wine: name })}</p>
      <div class="chips">
        {opts.map((o) => (
          <button
            key={o.dir}
            type="button"
            class={props.current !== undefined && props.current === nudge(field, base, o.dir) ? "chip on" : "chip"}
            onClick={() => props.onPick(nudge(field, base, o.dir))}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 入门's table, item by item as on the WSET Level 2 grid. The questions are one way to fill it in;
 * here every item can be changed directly. Three steps (four for sweetness) where 进阶 has five.
 */
function LevelTwoTable(props: { x: Tasting; v: VintageInfo; patch: Patch; prev: Prev | null }) {
  const { x, v, patch } = props;
  const a = x.appearance,
    n = x.nose,
    pl = x.palate;
  const setA = (c: Partial<Tasting["appearance"]>) => patch({ appearance: { ...a, ...c } });
  const setN = (c: Partial<Tasting["nose"]>) => patch({ nose: { ...n, ...c } });
  const setP = (c: Partial<Tasting["palate"]>) => patch({ palate: { ...pl, ...c } });
  const steps = (s: { value: number; label: Tri }[]) => s.map((o) => ({ value: o.value, label: p(o.label) }));
  const three = (label: string, words: Tri[], value: number | undefined, set: (v: 1 | 3 | 5 | undefined) => void) => (
    <Field label={label} group>
      <Choice
        label={label}
        value={l2ThreeOf(value)}
        options={steps(l2Three(words))}
        onChange={(val) => set(val as 1 | 3 | 5 | undefined)}
      />
    </Field>
  );
  const flavours: Words = {
    value: (pl.flavours ?? []).map((id) => ({ id, intensity: 2 })),
    set: (d) => setP({ flavours: d.map((s) => s.id) }),
  };
  return (
    <div class="steps level-two">
      <section class="step">
        <h2 class="step-title">1 · {t("外观")}</h2>
        <Field label={t("澄清度")} group>
          <Choice
            label={t("澄清度")}
            value={a.clarity}
            options={[
              { value: "clear" as const, label: t("清澈") },
              { value: "hazy" as const, label: t("浑浊") },
            ]}
            onChange={(val) => setA({ clarity: val })}
          />
        </Field>
        <Field label={t("颜色深浅")} group>
          <Choice
            label={t("颜色深浅")}
            value={a.intensity}
            options={levels(DEPTH_WORDS) as { value: 1 | 2 | 3; label: string }[]}
            onChange={(val) => setA({ intensity: val })}
          />
        </Field>
        <span class="field-label">{t("颜色")}</span>
        <Hues x={x} v={v} patch={patch} />
      </section>

      <section class="step">
        <h2 class="step-title">2 · {t("闻香")}</h2>
        <Field label={t("状态")} group>
          <Choice
            label={t("状态")}
            value={n.condition}
            options={[
              { value: "clean" as const, label: t("干净") },
              { value: "unclean" as const, label: t("不干净") },
            ]}
            onChange={(val) => setN({ condition: val })}
          />
        </Field>
        {three(t("香气强度"), INTENSITY_WORDS, n.intensity, (val) => setN({ intensity: val }))}
        <span class="field-label">{t("香气特征")}</span>
        <AromaPicker x={x} v={v} w={aromasOf(x, patch)} level="L2" />
      </section>

      <section class="step">
        <h2 class="step-title">3 · {t("入口")}</h2>
        <Field label={t("甜度")} group>
          <Choice
            label={t("甜度")}
            value={l2SweetnessOf(pl.sweetness)}
            options={steps(L2_SWEETNESS)}
            onChange={(val) => setP({ sweetness: val as 1 | 2 | 3 | 5 | undefined })}
          />
        </Field>
        {three(t("酸度"), LEVEL_WORDS, pl.acidity, (val) => setP({ acidity: val }))}
        {(v.color === "red" || pl.tannin) && three(t("单宁"), LEVEL_WORDS, pl.tannin, (val) => setP({ tannin: val }))}
        {three(t("酒精"), LEVEL_WORDS, pl.alcohol, (val) => setP({ alcohol: val }))}
        {three(t("酒体"), BODY_WORDS, pl.body, (val) => setP({ body: val }))}
        {(v.color === "sparkling" || pl.mousse) && (
          <Field label={t("气泡")} group>
            <Choice
              label={t("气泡")}
              value={pl.mousse}
              options={Object.entries(MOUSSE_WORDS).map(([k, w]) => ({
                value: k as NonNullable<typeof pl.mousse>,
                label: p(w),
              }))}
              onChange={(val) => setP({ mousse: val })}
            />
          </Field>
        )}
        {three(t("风味强度"), INTENSITY_WORDS, pl.flavour, (val) => setP({ flavour: val }))}
        <span class="field-label">{t("风味特征")}</span>
        <button
          type="button"
          class="button small same-as-nose"
          disabled={!x.descriptors.length}
          onClick={() => setP({ flavours: [...new Set([...(pl.flavours ?? []), ...x.descriptors.map((d) => d.id)])] })}
        >
          {t("和闻到的一样")}
        </button>
        <AromaPicker x={x} v={v} w={flavours} level="L2" placeholder={t("找风味，例如 黑醋栗")} />
        {three(t("余味"), FINISH_WORDS, pl.finish, (val) => setP({ finish: val }))}
      </section>

      <Note x={x} v={v} prev={props.prev} />

      <section class="step">
        <h2 class="step-title">4 · {t("结论")}</h2>
        <Field label={t("品质等级")} hint={t("「我的分」记你有多喜欢，这里记客观判断")} group>
          <Choice
            label={t("品质等级")}
            value={x.quality ?? undefined}
            options={Object.entries(QUALITY_WORDS).map(([k, w]) => ({ value: k, label: p(w) }))}
            onChange={(val) => patch({ quality: val ?? null })}
          />
        </Field>
      </section>
    </div>
  );
}

function Note(props: { x: Tasting; v: VintageInfo; prev?: Prev | null }) {
  const { x, v } = props;
  const vs = props.prev ? compareLine(currentLang(), x, props.prev.t) : "";
  const text = tastingNote(
    currentLang(),
    v.color,
    x.appearance,
    x.nose,
    x.palate,
    x.descriptors.map((d) => d.id),
  );
  if (!text && !vs) return null;
  return (
    <div class="tasting-note">
      {text && (
        <>
          <span class="tier-label">{t("你描述的是")}</span>
          <p>{text}</p>
        </>
      )}
      {vs && <p class="small compare-line">{vs}</p>}
    </div>
  );
}

// ── 快记 ─────────────────────────────────────────────────────────────────────────────────────

const QUICK_WORDS: Record<"red" | "white", string[]> = {
  red: [
    "blackcurrant",
    "black-cherry",
    "red-cherry",
    "raspberry",
    "blackberry",
    "black-plum",
    "vanilla",
    "cedar",
    "chocolate",
    "black-pepper",
    "tobacco",
    "leather",
  ],
  white: [
    "lemon",
    "green-apple",
    "pear",
    "peach",
    "pineapple",
    "grapefruit",
    "white-flowers",
    "butter",
    "vanilla",
    "toast",
    "honey",
    "wet-stone",
  ],
};

function Quick(props: { x: Tasting; v: VintageInfo; patch: Patch }) {
  const { x, v, patch } = props;
  const [more, setMore] = useState(false);
  const color = redLike(v, x);
  const ids = QUICK_WORDS[color].filter((id) => DESCRIPTOR_BY_ID.has(id));
  const extra = x.descriptors.map((d) => d.id).filter((id) => !ids.includes(id));
  return (
    <div class="steps">
      <section class="step">
        <ScoreSlider value={x.score} onChange={(score) => patch({ score })} />
      </section>
      <section class="step">
        <h2 class="step-title">{t("香气")}</h2>
        {more ? (
          <AromaPicker x={x} v={v} w={aromasOf(x, patch)} />
        ) : (
          <>
            <AromaChips ids={[...ids, ...extra]} w={aromasOf(x, patch)} />
            <button type="button" class="link small" onClick={() => setMore(true)}>
              {t("更多香气")}
            </button>
          </>
        )}
      </section>
      <section class="step">
        <NoteField x={x} patch={patch} rows={2} />
        <Field label={t("还会买吗？")} group>
          <Choice
            label={t("还会买吗？")}
            value={x.buyAgain === null ? undefined : x.buyAgain ? "yes" : "no"}
            options={[
              { value: "yes", label: t("会") },
              { value: "no", label: t("不会") },
            ]}
            onChange={(val) => patch({ buyAgain: val === undefined ? null : val === "yes" })}
          />
        </Field>
      </section>
    </div>
  );
}

// ── 入门 ─────────────────────────────────────────────────────────────────────────────────────

function answerOf(q: GuideQuestion, x: Tasting): number | string | undefined {
  if (q.field === "quality") return x.quality ?? undefined;
  const [part, key] = q.field.split(".") as [string, string];
  if (part === "appearance") return (x.appearance as Record<string, string | number | undefined>)[key];
  if (part === "nose") return (x.nose as Record<string, number | undefined>)[key];
  if (part === "palate") return (x.palate as Record<string, number | string | undefined>)[key];
  return undefined;
}

/** The option nearest to what 进阶 wrote, so a switch back shows it chosen. */
function chosenOption(q: GuideQuestion, x: Tasting) {
  const a = answerOf(q, x);
  if (a === undefined) return undefined;
  if (typeof a === "string") return q.options.find((o) => o.value === a)?.value;
  let best = q.options[0]!;
  for (const o of q.options) if (Math.abs(Number(o.value) - a) < Math.abs(Number(best.value) - a)) best = o;
  return best.value;
}

/** My note on the wine before this one in the same list (和上一款比), and that wine. */
interface Prev {
  t: Tasting;
  v: VintageInfo | undefined;
}

/** 入门's way to words: a broad question, for fruit a second one, then the WSET Level 2 words. */
function GuideWords(props: { w: Words; color: "red" | "white"; nose?: TastingDescriptor[] }) {
  const { value, set } = props.w;
  const color = props.color;
  const [group, setGroup] = useState<string | null>(null);
  const [branch, setBranch] = useState<number | null>(null);
  const g = BEGINNER_GROUPS.find((b) => b.id === group);
  return (
    <div class="aroma-guide">
      {props.nose && (
        <button
          type="button"
          class="button small same-as-nose"
          disabled={!props.nose.length}
          onClick={() => {
            const have = new Set(value.map((d) => d.id));
            set([...value, ...props.nose!.filter((d) => !have.has(d.id)).map((d) => ({ id: d.id, intensity: 2 }))]);
          }}
        >
          {t("和闻到的一样")}
        </button>
      )}
      {!g && (
        <div class="answers">
          {BEGINNER_GROUPS.map((b) => (
            <button key={b.id} type="button" class="answer" onClick={() => setGroup(b.id)}>
              <strong>{p(b.name)}</strong>
              <span>{p(b.sub)}</span>
            </button>
          ))}
        </div>
      )}
      {g?.branches && branch === null && (
        <div class="answers">
          {g.branches.map((b, i) => (
            <button key={i} type="button" class="answer" onClick={() => setBranch(i)}>
              <strong>{p(b.name)}</strong>
            </button>
          ))}
        </div>
      )}
      {g && (g.families || branch !== null) && (
        <div class="aroma-words">
          {wordsOf(g.families ?? g.branches![branch!]!.families, color, "L2").map((d) => {
            const on = value.some((s) => s.id === d.id);
            return (
              <button
                key={d.id}
                type="button"
                class={on ? "answer word on" : "answer word"}
                aria-pressed={on}
                onClick={() => set(on ? value.filter((s) => s.id !== d.id) : [...value, { id: d.id, intensity: 2 }])}
              >
                <strong>{p(d.name)}</strong>
                {d.hint && <span>{p(d.hint)}</span>}
              </button>
            );
          })}
        </div>
      )}
      {g && (
        <button
          type="button"
          class="link small"
          onClick={() => {
            setGroup(null);
            setBranch(null);
          }}
        >
          {t("换个方向再找")}
        </button>
      )}
      <ChosenAromas w={props.w} hideEmpty />
    </div>
  );
}

/** Whether anything the questions ask is already written. */
const filled = (x: Tasting) =>
  !!(
    x.appearance.clarity ||
    x.appearance.intensity ||
    x.appearance.hue ||
    x.nose.condition ||
    x.nose.intensity ||
    x.descriptors.length ||
    x.quality ||
    (["sweetness", "acidity", "tannin", "alcohol", "body", "mousse", "flavour", "finish"] as const).some(
      (k) => x.palate[k] !== undefined,
    ) ||
    x.palate.flavours?.length
  );

/** The tasting with every item the questions ask cleared, ready to be answered again. */
const clearedForQuestions = (x: Tasting): Partial<Tasting> => ({
  appearance: { ...x.appearance, clarity: undefined, intensity: undefined, hue: undefined },
  nose: { ...x.nose, condition: undefined, intensity: undefined },
  descriptors: [],
  palate: {
    ...x.palate,
    sweetness: undefined,
    acidity: undefined,
    tannin: undefined,
    alcohol: undefined,
    body: undefined,
    mousse: undefined,
    flavour: undefined,
    flavours: undefined,
    finish: undefined,
  },
  quality: null,
});

function Beginner(props: { x: Tasting; v: VintageInfo; patch: Patch; prev: Prev | null }) {
  const { x, v, patch } = props;
  const questions = beginnerQuestions(v.color);
  // The table first, as in 进阶; the questions are a way to fill it in.
  const [step, setStep] = useState(questions.length);
  const [why, setWhy] = useState(false);
  const go = (n: number) => {
    setStep(n);
    setWhy(false);
    scrollTo({ top: 0 });
  };
  // Going through the questions again writes the table afresh: what they ask is cleared first.
  const again = async () => {
    if (filled(x) && !(await ask(t("重新回答会清空表格里的内容，从第一题开始。"), { ok: t("重新回答") }))) return;
    patch(clearedForQuestions(x));
    go(0);
  };
  if (step >= questions.length)
    return (
      <div class="steps">
        <section class="step by-questions">
          <button type="button" class="button primary" onClick={again}>
            {filled(x) ? t("用问答重新填表") : t("一题一题帮我填")}
          </button>
          <p class="hint">{t("不知道怎么填？用大白话一题一题问你，答完自动填进下面的表格")}</p>
        </section>
        <LevelTwoTable x={x} v={v} patch={patch} prev={props.prev} />
        <Conclusion x={x} patch={patch} />
      </div>
    );

  const q = questions[step]!;
  const setAnswer = (value: number | string) => {
    if (q.field === "quality") patch({ quality: String(value) });
    else {
      const [part, key] = q.field.split(".") as ["appearance" | "nose" | "palate", string];
      patch({ [part]: { ...x[part], [key]: value } } as Partial<Tasting>);
    }
    go(step + 1);
  };
  const color = redLike(v, x);
  return (
    <div class="steps">
      <button type="button" class="link small to-table" onClick={() => go(questions.length)}>
        {t("回到表格")}
      </button>
      <div class="progress" role="img" aria-label={t("第 {n} 题，共 {all} 题", { n: step + 1, all: questions.length })}>
        {questions.map((_, i) => (
          <span key={i} class={i < step ? "done" : i === step ? "now" : ""} />
        ))}
      </div>
      <section class="step question">
        <h2 class="q-ask">{p(q.ask)}</h2>
        <p class="q-how">{p(q.how)}</p>
        {q.field === "appearance" && (
          <>
            <Hues x={x} v={v} patch={patch} />
            <Field label={t("颜色深浅")} group>
              <Choice
                label={t("颜色深浅")}
                value={x.appearance.intensity}
                options={levels(DEPTH_WORDS) as { value: 1 | 2 | 3; label: string }[]}
                onChange={(val) => patch({ appearance: { ...x.appearance, intensity: val } })}
              />
            </Field>
          </>
        )}
        {(q.field === "aromas" || q.field === "flavours") && (
          <GuideWords
            key={q.field}
            w={q.field === "aromas" ? aromasOf(x, patch) : flavoursOf(x, patch)}
            color={color}
            nose={q.field === "flavours" ? x.descriptors : undefined}
          />
        )}
        {q.options.length > 0 && (
          <div class="answers">
            {q.options.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                class={chosenOption(q, x) === o.value ? "answer on" : "answer"}
                onClick={() => setAnswer(o.value)}
              >
                <strong>{p(o.label)}</strong>
              </button>
            ))}
          </div>
        )}
        {props.prev && isComparable(q.field) && scaleValue(props.prev.t, q.field) !== undefined && (
          <CompareAnswers
            prev={props.prev}
            field={q.field}
            current={scaleValue(x, q.field)}
            onPick={(value) => setAnswer(value)}
          />
        )}
        <button type="button" class="why-toggle" aria-expanded={why} onClick={() => setWhy(!why)}>
          {t("为什么问这个？")}
        </button>
        {why && <p class="why">{p(q.why)}</p>}
      </section>
      <div class="q-nav">
        <button type="button" class="button" disabled={step === 0} onClick={() => go(step - 1)}>
          {t("上一题")}
        </button>
        {q.options.length > 0 ? (
          <button type="button" class="button" onClick={() => go(step + 1)}>
            {t("说不上来")}
          </button>
        ) : (
          <button type="button" class="button primary" onClick={() => go(step + 1)}>
            {t("下一题")}
          </button>
        )}
      </div>
    </div>
  );
}

// ── 进阶 ──────────────────────────────────────────────────────────────────────────────────

function Systematic(props: { x: Tasting; v: VintageInfo; patch: Patch; prev: Prev | null }) {
  const { x, v, patch } = props;
  const a = x.appearance,
    n = x.nose,
    pl = x.palate,
    ex = x.extra;
  const setA = (c: Partial<Tasting["appearance"]>) => patch({ appearance: { ...a, ...c } });
  const setN = (c: Partial<Tasting["nose"]>) => patch({ nose: { ...n, ...c } });
  const setP = (c: Partial<Tasting["palate"]>) => patch({ palate: { ...pl, ...c } });
  const setE = (c: Partial<Tasting["extra"]>) => patch({ extra: { ...ex, ...c } });
  const toggleIn = (list: string[] | undefined, k: string) =>
    list?.includes(k) ? list.filter((s) => s !== k) : [...(list ?? []), k];
  const red = v.color === "red";
  const num = (val: string) => (val === "" || !Number.isFinite(Number(val)) ? undefined : Number(val));
  const flavours: Words = {
    value: (pl.flavours ?? []).map((id) => ({ id, intensity: 2 })),
    set: (d) => setP({ flavours: d.map((s) => s.id) }),
  };

  return (
    <div class="steps">
      <section class="step">
        <h2 class="step-title">1 · {t("外观")}</h2>
        <p class="hint">{t("把杯子斜放在白纸前，看杯沿的颜色")}</p>
        <Field label={t("颜色深浅")} group>
          <Choice
            label={t("颜色深浅")}
            value={a.intensity}
            options={levels(DEPTH_WORDS) as { value: 1 | 2 | 3; label: string }[]}
            onChange={(val) => setA({ intensity: val })}
          />
        </Field>
        <Hues x={x} v={v} patch={patch} />
        <Field label={t("澄清度")} group>
          <Choice
            label={t("澄清度")}
            value={a.clarity}
            options={[
              { value: "clear" as const, label: t("清澈") },
              { value: "hazy" as const, label: t("浑浊") },
            ]}
            onChange={(val) => setA({ clarity: val })}
          />
        </Field>
        <div class="checks">
          <label class="check">
            <input
              type="checkbox"
              checked={!!a.legs}
              onChange={(e) => setA({ legs: (e.target as HTMLInputElement).checked || undefined })}
            />
            {t("挂杯明显")}
          </label>
          <label class="check">
            <input
              type="checkbox"
              checked={!!a.sediment}
              onChange={(e) => setA({ sediment: (e.target as HTMLInputElement).checked || undefined })}
            />
            {t("有沉淀")}
          </label>
        </div>
      </section>

      <section class="step">
        <h2 class="step-title">2 · {t("闻香")}</h2>
        <p class="hint">{t("先不摇杯闻一次，再摇杯闻一次；先判断是红色果还是黑色果")}</p>
        <Field label={t("状态")} hint={t("闻到湿纸板、发霉或醋味，就是不干净")} group>
          <Choice
            label={t("状态")}
            value={n.condition}
            options={[
              { value: "clean" as const, label: t("干净") },
              { value: "unclean" as const, label: t("不干净") },
            ]}
            onChange={(val) => setN({ condition: val })}
          />
        </Field>
        <Field label={t("香气强度")} group>
          <Choice
            label={t("香气强度")}
            value={n.intensity}
            options={levels(LEVEL_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
            onChange={(val) => setN({ intensity: val })}
          />
        </Field>
        <Field label={t("发展阶段")} group>
          <Choice
            label={t("发展阶段")}
            value={n.development}
            options={Object.entries(DEVELOPMENT_WORDS).map(([k, w]) => ({
              value: k as NonNullable<typeof n.development>,
              label: p(w),
            }))}
            onChange={(val) => setN({ development: val })}
          />
        </Field>
        <AromaPicker x={x} v={v} w={aromasOf(x, patch)} />
      </section>

      <section class="step">
        <h2 class="step-title">3 · {t("入口")}</h2>
        <p class="hint">
          {red ? t("单宁看牙龈发不发干；余味从吞下开始数秒") : t("酸度看咽下后流不流口水；余味从吞下开始数秒")}
        </p>
        <Field label={t("甜度")} group>
          <Choice
            label={t("甜度")}
            value={pl.sweetness}
            options={levels(SWEETNESS_WORDS) as { value: 1 | 2 | 3 | 4 | 5 | 6; label: string }[]}
            onChange={(val) => setP({ sweetness: val })}
          />
        </Field>
        <Field label={t("酸度")} group>
          <Choice
            label={t("酸度")}
            value={pl.acidity}
            options={levels(LEVEL_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
            onChange={(val) => setP({ acidity: val })}
          />
        </Field>
        {(red || pl.tannin) && (
          <Field label={t("单宁")} group>
            <Choice
              label={t("单宁")}
              value={pl.tannin}
              options={levels(LEVEL_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
              onChange={(val) => setP({ tannin: val })}
            />
          </Field>
        )}
        <Field label={t("酒精")} group>
          <Choice
            label={t("酒精")}
            value={pl.alcohol}
            options={levels(LEVEL_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
            onChange={(val) => setP({ alcohol: val })}
          />
        </Field>
        <Field label={t("酒体")} group>
          <Choice
            label={t("酒体")}
            value={pl.body}
            options={levels(BODY_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
            onChange={(val) => setP({ body: val })}
          />
        </Field>
        {(v.color === "sparkling" || pl.mousse) && (
          <Field label={t("气泡")} group>
            <Choice
              label={t("气泡")}
              value={pl.mousse}
              options={Object.entries(MOUSSE_WORDS).map(([k, w]) => ({
                value: k as NonNullable<typeof pl.mousse>,
                label: p(w),
              }))}
              onChange={(val) => setP({ mousse: val })}
            />
          </Field>
        )}
        <Field label={t("风味强度")} group>
          <Choice
            label={t("风味强度")}
            value={pl.flavour}
            options={levels(LEVEL_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
            onChange={(val) => setP({ flavour: val })}
          />
        </Field>
        <Field label={t("风味特征")} group>
          <span class="field-hint">{t("嘴里尝到的味道，和闻到的常常一样，也会多出或少了几样")}</span>
          <button
            type="button"
            class="button small same-as-nose"
            disabled={!x.descriptors.length}
            onClick={() =>
              setP({ flavours: [...new Set([...(pl.flavours ?? []), ...x.descriptors.map((d) => d.id)])] })
            }
          >
            {t("和闻到的一样")}
          </button>
          <AromaPicker x={x} v={v} w={flavours} placeholder={t("找风味，例如 黑醋栗")} />
        </Field>
        <Field label={t("余味")} group>
          <Choice
            label={t("余味")}
            value={pl.finish}
            options={levels(FINISH_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
            onChange={(val) => setP({ finish: val })}
          />
        </Field>
      </section>

      <Note x={x} v={v} prev={props.prev} />

      <section class="step">
        <h2 class="step-title">4 · {t("结论")}</h2>
      </section>
      <Conclusion x={x} patch={patch} standard />

      <section class="step">
        <Field label={t("品质的理由")} hint={t("平衡、余味长度、强度、复杂度，哪几样做得好")} group>
          <div class="chips">
            {Object.entries(REASON_WORDS).map(([k, w]) => (
              <button
                key={k}
                type="button"
                class={ex.reasons?.includes(k) ? "chip on" : "chip"}
                aria-pressed={!!ex.reasons?.includes(k)}
                onClick={() => setE({ reasons: toggleIn(ex.reasons, k) })}
              >
                {p(w)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("适饮程度")} group>
          <Choice
            label={t("适饮程度")}
            value={ex.readiness}
            options={Object.entries(READINESS_WORDS).map(([k, w]) => ({
              value: k as NonNullable<typeof ex.readiness>,
              label: p(w),
            }))}
            onChange={(val) => setE({ readiness: val })}
          />
        </Field>
      </section>

      <section class="step">
        <span class="field-label">{t("陈年潜力")}</span>
        <div class="field-row">
          <Field label={t("适饮期从")}>
            <input
              inputMode="numeric"
              maxLength={4}
              value={ex.drinkFrom ?? ""}
              onInput={(e) => setE({ drinkFrom: num((e.target as HTMLInputElement).value) })}
            />
          </Field>
          <Field label={t("到")}>
            <input
              inputMode="numeric"
              maxLength={4}
              value={ex.drinkTo ?? ""}
              onInput={(e) => setE({ drinkTo: num((e.target as HTMLInputElement).value) })}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}
