import { useLocation, useRoute } from "preact-iso";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  BEGINNER_GROUPS,
  type DESCRIPTORS,
  DESCRIPTOR_BY_ID,
  FAMILIES,
  type Tri,
  wordsOf,
} from "../../shared/descriptors";
import {
  BODY_WORDS,
  DEPTH_WORDS,
  DEVELOPMENT_WORDS,
  FAULT_WORDS,
  FINISH_WORDS,
  type GuideQuestion,
  HUE_WORDS,
  LEVEL_WORDS,
  MOUSSE_WORDS,
  QUALITY_WORDS,
  REASON_WORDS,
  SWEETNESS_WORDS,
  TEXTURE_WORDS,
  beginnerQuestions,
  glassColor,
  huesFor,
  swatch,
  tastingNote,
} from "../../shared/guide";
import { DEPTHS, type Depth, type Tasting, type VintageInfo } from "../../shared/model";
import { BackIcon, Choice, Field, Glass, ScoreSlider, WineName } from "../components";
import { DEPTH_INFO } from "../depths";
import { currentLang, p, t, tk } from "../i18n";
import { deleteTasting, getState, saveTasting, updateMe, useStore } from "../store";

/**
 * 品鉴: one sheet, four depths over the same fields (docs/design.zh.md §3.3, §3.4). Switching depth
 * applies to this wine only and keeps what was answered; after three switches it offers to change
 * the default. Every change is saved on the phone at once.
 */

type Patch = (change: Partial<Tasting>) => void;
const redLike = (v: VintageInfo, x: Tasting): "red" | "white" =>
  v.color === "red" || huesFor(v.color, x.appearance.hue)[0] === "purple" ? "red" : "white";

export function Taste() {
  const { params } = useRoute();
  const { route, query } = useLocation();
  const saved = useStore((s) => s.tastings.find((x) => x.id === params.id));
  const vintage = useStore((s) => (saved ? s.vintages.find((v) => v.id === saved.vintageId) : undefined));
  const defaultDepth = useStore((s) => s.me?.depth ?? "quick");
  const [x, setX] = useState<Tasting | undefined>(saved);
  const [switches, setSwitches] = useState(0);
  const [offer, setOffer] = useState<Depth | null>(null);
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
    },
    [],
  );

  if (!x || !vintage)
    return (
      <div class="page">
        <p class="empty">{t("找不到这条记录")}</p>
        <a href="/">{t("回到酒单")}</a>
      </div>
    );

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
    if (d === x.depth) return;
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
    route(backOf(x), true);
  };

  return (
    <div class="page taste">
      <header class="page-head sticky">
        <button type="button" class="icon-button" aria-label={t("返回")} onClick={done}>
          <BackIcon />
        </button>
        <div class="page-head-title taste-wine">
          <Glass color={glassColor(vintage.color, x.appearance, vintage.year)} size={30} />
          <WineName v={vintage} sub={false} />
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
            aria-selected={x.depth === d}
            class={x.depth === d ? "on" : ""}
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
      {x.depth === "quick" && <Quick x={x} v={vintage} patch={patch} />}
      {x.depth === "beginner" && <Beginner x={x} v={vintage} patch={patch} fresh={query.new === "1"} />}
      {(x.depth === "standard" || x.depth === "expert") && (
        <Systematic x={x} v={vintage} patch={patch} expert={x.depth === "expert"} />
      )}
      <div class="taste-foot">
        <button
          type="button"
          class="link danger small"
          onClick={() => {
            if (!confirm(t("删除这条品鉴记录？"))) return;
            if (timer.current) clearTimeout(timer.current);
            timer.current = null;
            latest.current = undefined;
            deleteTasting(x.id);
            route(backOf(x), true);
          }}
        >
          {t("删除这条记录")}
        </button>
      </div>
    </div>
  );
}

/** Back to the list the wine is in, else the wine's page in the library. */
function backOf(x: Tasting): string {
  const listId = x.listItemId ? getState().items.find((i) => i.id === x.listItemId)?.listId : undefined;
  return listId ? `/lists/${listId}` : `/wine/${x.vintageId}`;
}

// ── Shared pieces ────────────────────────────────────────────────────────────────────────────

function Conclusion(props: { x: Tasting; patch: Patch; expert?: boolean; standard?: boolean }) {
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
        </>
      )}
      <Field label={t("一句话")}>
        <textarea
          rows={props.expert ? 5 : 2}
          maxLength={4000}
          value={x.note ?? ""}
          placeholder={t("可以用键盘上的话筒说")}
          onInput={(e) => patch({ note: (e.target as HTMLTextAreaElement).value || null })}
        />
      </Field>
    </section>
  );
}

/** Chips for aroma words; tap to add, tap again to remove (专业: tap cycles the strength). */
function AromaChips(props: { ids: string[]; x: Tasting; patch: Patch; strength?: boolean }) {
  const { x, patch } = props;
  const toggle = (id: string) => {
    const has = x.descriptors.find((d) => d.id === id);
    if (!has) return patch({ descriptors: [...x.descriptors, { id, intensity: 2 }] });
    if (props.strength && has.intensity < 3)
      return patch({ descriptors: x.descriptors.map((d) => (d.id === id ? { ...d, intensity: d.intensity + 1 } : d)) });
    patch({ descriptors: x.descriptors.filter((d) => d.id !== id) });
  };
  return (
    <div class="chips">
      {props.ids.map((id) => {
        const d = DESCRIPTOR_BY_ID.get(id)!;
        const on = x.descriptors.find((s) => s.id === id);
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
function AromaPicker(props: { x: Tasting; v: VintageInfo; patch: Patch; strength?: boolean }) {
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
  const chosen = props.x.descriptors.map((d) => d.id);
  // Families start closed: the whole vocabulary at once is a wall of words.
  const [open, setOpen] = useState<string[]>([]);
  return (
    <div class="aroma-picker">
      {chosen.length > 0 && (
        <div class="aroma-chosen">
          <AromaChips ids={chosen} x={props.x} patch={props.patch} strength={props.strength} />
          {props.strength && <span class="field-hint">{t("再点一下加强，点到第三下后移除")}</span>}
        </div>
      )}
      <input
        type="search"
        class="search small"
        placeholder={t("找香气，例如 雪松")}
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />
      {[1, 2, 3].map((tier) => (
        <div key={tier} class="aroma-tier">
          <span class="tier-label">
            {t(tier === 1 ? tk("一类：来自葡萄") : tier === 2 ? tk("二类：来自酿造") : tk("三类：来自陈年"))}
          </span>
          {FAMILIES.filter((f) => f.tier === tier).map((f) => {
            const words = wordsOf([f.id], color).filter((d) => hit(d) && !chosen.includes(d.id));
            if (!words.length) return null;
            const shown = !!ql || open.includes(f.id);
            return (
              <div key={f.id} class="aroma-family">
                <button
                  type="button"
                  class="family-name"
                  aria-expanded={shown}
                  onClick={() => setOpen(shown ? open.filter((o) => o !== f.id) : [...open, f.id])}
                >
                  {shown ? "▾" : "▸"} {p(f.name)}
                </button>
                {shown && (
                  <AromaChips ids={words.map((d) => d.id)} x={props.x} patch={props.patch} strength={props.strength} />
                )}
              </div>
            );
          })}
        </div>
      ))}
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

function Note(props: { x: Tasting; v: VintageInfo }) {
  const { x, v } = props;
  const text = tastingNote(
    currentLang(),
    v.color,
    x.appearance,
    x.nose,
    x.palate,
    x.descriptors.map((d) => d.id),
  );
  if (!text) return null;
  return (
    <div class="tasting-note">
      <span class="tier-label">{t("你描述的是")}</span>
      <p>{text}</p>
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
          <AromaPicker x={x} v={v} patch={patch} />
        ) : (
          <>
            <AromaChips ids={[...ids, ...extra]} x={x} patch={patch} />
            <button type="button" class="link small" onClick={() => setMore(true)}>
              {t("更多香气")}
            </button>
          </>
        )}
      </section>
      <section class="step">
        <Field label={t("一句话")}>
          <textarea
            rows={2}
            maxLength={4000}
            value={x.note ?? ""}
            placeholder={t("可以用键盘上的话筒说")}
            onInput={(e) => patch({ note: (e.target as HTMLTextAreaElement).value || null })}
          />
        </Field>
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
  const [part, key] = q.field.split(".") as [string, string];
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

function Beginner(props: { x: Tasting; v: VintageInfo; patch: Patch; fresh: boolean }) {
  const { x, v, patch } = props;
  const questions = beginnerQuestions(v.color);
  const [step, setStep] = useState(props.fresh ? 0 : questions.length);
  const [why, setWhy] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [branch, setBranch] = useState<number | null>(null);
  const go = (n: number) => {
    setStep(n);
    setWhy(false);
    setGroup(null);
    setBranch(null);
    scrollTo({ top: 0 });
  };
  if (step >= questions.length)
    return (
      <div class="steps">
        <Note x={x} v={v} />
        <div class="beginner-done">
          <button type="button" class="link small" onClick={() => go(0)}>
            {t("重新走一遍问题")}
          </button>
        </div>
        <Conclusion x={x} patch={patch} />
      </div>
    );

  const q = questions[step]!;
  const setAnswer = (value: number | string) => {
    const [part, key] = q.field.split(".") as ["nose" | "palate", string];
    patch({ [part]: { ...x[part], [key]: value } } as Partial<Tasting>);
    go(step + 1);
  };
  const g = BEGINNER_GROUPS.find((b) => b.id === group);
  const color = redLike(v, x);
  return (
    <div class="steps">
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
        {q.field === "aromas" && (
          <div class="aroma-guide">
            {x.descriptors.length > 0 && <AromaChips ids={x.descriptors.map((d) => d.id)} x={x} patch={patch} />}
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
                {wordsOf(g.families ?? g.branches![branch!]!.families, color)
                  .slice(0, 8)
                  .map((d) => {
                    const on = x.descriptors.some((s) => s.id === d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        class={on ? "answer word on" : "answer word"}
                        aria-pressed={on}
                        onClick={() =>
                          patch({
                            descriptors: on
                              ? x.descriptors.filter((s) => s.id !== d.id)
                              : [...x.descriptors, { id: d.id, intensity: 2 }],
                          })
                        }
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
          </div>
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

// ── 进阶 / 专业 ──────────────────────────────────────────────────────────────────────────────

function Systematic(props: { x: Tasting; v: VintageInfo; patch: Patch; expert: boolean }) {
  const { x, v, patch, expert } = props;
  const a = x.appearance,
    n = x.nose,
    pl = x.palate,
    ex = x.extra,
    gs = x.guesses;
  const setA = (c: Partial<Tasting["appearance"]>) => patch({ appearance: { ...a, ...c } });
  const setN = (c: Partial<Tasting["nose"]>) => patch({ nose: { ...n, ...c } });
  const setP = (c: Partial<Tasting["palate"]>) => patch({ palate: { ...pl, ...c } });
  const setE = (c: Partial<Tasting["extra"]>) => patch({ extra: { ...ex, ...c } });
  const setG = (c: Partial<Tasting["guesses"]>) => patch({ guesses: { ...gs, ...c } });
  const toggleIn = (list: string[] | undefined, k: string) =>
    list?.includes(k) ? list.filter((s) => s !== k) : [...(list ?? []), k];
  const red = v.color === "red";
  const num = (val: string) => (val === "" || !Number.isFinite(Number(val)) ? undefined : Number(val));
  const [custom, setCustom] = useState("");

  return (
    <div class="steps">
      {expert && (
        <section class="step">
          <h2 class="step-title">{t("盲品猜酒")}</h2>
          <p class="hint">{t("先猜再看答案。猜过的会统计命中率。")}</p>
          <div class="field-row">
            <Field label={t("品种")}>
              <input
                value={gs.grape ?? ""}
                maxLength={60}
                onInput={(e) => setG({ grape: (e.target as HTMLInputElement).value || undefined })}
              />
            </Field>
            <Field label={t("产区")}>
              <input
                value={gs.region ?? ""}
                maxLength={60}
                onInput={(e) => setG({ region: (e.target as HTMLInputElement).value || undefined })}
              />
            </Field>
            <Field label={t("年份")}>
              <input
                inputMode="numeric"
                maxLength={4}
                value={gs.vintage ?? ""}
                onInput={(e) => setG({ vintage: num((e.target as HTMLInputElement).value) })}
              />
            </Field>
          </div>
        </section>
      )}
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
        {expert && (
          <>
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
                  checked={!!a.rim}
                  onChange={(e) => setA({ rim: (e.target as HTMLInputElement).checked || undefined })}
                />
                {t("杯沿颜色变化明显")}
              </label>
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
          </>
        )}
      </section>

      <section class="step">
        <h2 class="step-title">2 · {t("闻香")}</h2>
        <p class="hint">{t("先不摇杯闻一次，再摇杯闻一次；先判断是红色果还是黑色果")}</p>
        <Field label={t("香气强度")} group>
          <Choice
            label={t("香气强度")}
            value={n.intensity}
            options={levels(LEVEL_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
            onChange={(val) => setN({ intensity: val })}
          />
        </Field>
        {expert && (
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
        )}
        <AromaPicker x={x} v={v} patch={patch} strength={expert} />
        {expert && (
          <div class="custom-words">
            <div class="chips">
              {(n.custom ?? []).map((w) => (
                <button
                  key={w}
                  type="button"
                  class="chip on"
                  onClick={() => setN({ custom: (n.custom ?? []).filter((s) => s !== w) })}
                >
                  {w} ✕
                </button>
              ))}
            </div>
            <form
              class="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const w = custom.trim();
                if (w && !(n.custom ?? []).includes(w) && (n.custom ?? []).length < 20)
                  setN({ custom: [...(n.custom ?? []), w.slice(0, 40)] });
                setCustom("");
              }}
            >
              <input
                placeholder={t("词表里没有的香气")}
                value={custom}
                onInput={(e) => setCustom((e.target as HTMLInputElement).value)}
              />
              <button type="submit" class="button small">
                {t("添加")}
              </button>
            </form>
          </div>
        )}
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
        {expert && (red || pl.tanninTexture) && (
          <Field label={t("单宁质感")} group>
            <Choice
              label={t("单宁质感")}
              value={pl.tanninTexture}
              options={Object.entries(TEXTURE_WORDS).map(([k, w]) => ({
                value: k as NonNullable<typeof pl.tanninTexture>,
                label: p(w),
              }))}
              onChange={(val) => setP({ tanninTexture: val })}
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
        {expert && v.color === "sparkling" && (
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
        {expert && (
          <Field label={t("风味强度")} group>
            <Choice
              label={t("风味强度")}
              value={pl.flavour}
              options={levels(LEVEL_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
              onChange={(val) => setP({ flavour: val })}
            />
          </Field>
        )}
        <Field label={t("余味")} group>
          <Choice
            label={t("余味")}
            value={pl.finish}
            options={levels(FINISH_WORDS) as { value: 1 | 2 | 3 | 4 | 5; label: string }[]}
            onChange={(val) => setP({ finish: val })}
          />
        </Field>
        {expert && <FinishTimer value={pl.finishSeconds} onChange={(s) => setP({ finishSeconds: s })} />}
      </section>

      <Note x={x} v={v} />

      <section class="step">
        <h2 class="step-title">4 · {t("结论")}</h2>
      </section>
      <Conclusion x={x} patch={patch} standard expert={expert} />

      {expert && (
        <section class="step">
          <Field label={t("品质的理由")} group>
            <div class="chips">
              {Object.entries(REASON_WORDS).map(([k, w]) => (
                <button
                  key={k}
                  type="button"
                  class={ex.reasons?.includes(k) ? "chip on" : "chip"}
                  onClick={() => setE({ reasons: toggleIn(ex.reasons, k) })}
                >
                  {p(w)}
                </button>
              ))}
            </div>
          </Field>
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
          <Field label={t("缺陷")} group>
            <div class="chips">
              {Object.entries(FAULT_WORDS).map(([k, w]) => (
                <button
                  key={k}
                  type="button"
                  class={ex.faults?.includes(k) ? "chip on warn" : "chip"}
                  onClick={() => setE({ faults: toggleIn(ex.faults, k) })}
                >
                  {p(w)}
                </button>
              ))}
            </div>
          </Field>
          <h3 class="sub-title">{t("侍酒条件")}</h3>
          <div class="field-row">
            <Field label={t("醒酒（分钟）")}>
              <input
                inputMode="numeric"
                value={ex.decantMinutes ?? ""}
                onInput={(e) => setE({ decantMinutes: num((e.target as HTMLInputElement).value) })}
              />
            </Field>
            <Field label={t("酒温 °C")}>
              <input
                inputMode="numeric"
                value={ex.tempC ?? ""}
                onInput={(e) => setE({ tempC: num((e.target as HTMLInputElement).value) })}
              />
            </Field>
          </div>
          <div class="field-row">
            <Field label={t("杯型")}>
              <input
                value={ex.glass ?? ""}
                maxLength={40}
                onInput={(e) => setE({ glass: (e.target as HTMLInputElement).value || undefined })}
              />
            </Field>
            <Field label={t("开瓶第几天")}>
              <input
                inputMode="numeric"
                value={ex.dayOpen ?? ""}
                onInput={(e) => setE({ dayOpen: num((e.target as HTMLInputElement).value) })}
              />
            </Field>
          </div>
        </section>
      )}
    </div>
  );
}

/** 余味精确到秒: tap when you swallow, tap again when it fades. */
function FinishTimer(props: { value: number | undefined; onChange: (s: number | undefined) => void }) {
  const [start, setStart] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (start === null) return;
    const i = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(i);
  }, [start]);
  const running = start !== null ? Math.floor((Date.now() - start) / 1000) : null;
  return (
    <div class="finish-timer">
      <button
        type="button"
        class={start === null ? "button" : "button primary"}
        onClick={() => {
          if (start === null) setStart(Date.now());
          else {
            props.onChange(Math.round((Date.now() - start) / 1000));
            setStart(null);
          }
        }}
      >
        {start === null ? t("咽下时点这里开始计时") : t("味道消失时点这里：{n} 秒", { n: running ?? 0 })}
      </button>
      {props.value !== undefined && start === null && (
        <span class="num">
          {t("{n} 秒", { n: props.value })}{" "}
          <button type="button" class="link small" onClick={() => props.onChange(undefined)}>
            {t("清除")}
          </button>
        </span>
      )}
    </div>
  );
}
