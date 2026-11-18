import { useEffect, useMemo, useState } from "preact/hooks";
import "./costs.css";
import { type Bucket, type CostDay, type ModelPrice, PERIODS, type Period, fmtUsd, rollUp } from "../shared/costs";
import { ask } from "./confirm";
import { fmtDate, t, tk, tm } from "./i18n";
import { ApiError, api } from "./store";

/** 我的 → 管理 → 开销 (owners): what the AI features cost, by 日 / 月 / 季 / 年, feature and model. */

const PERIOD_NAME: Record<Period, string> = {
  day: tk("按日"),
  month: tk("按月"),
  quarter: tk("按季度"),
  year: tk("按年"),
};
const FEATURE_NAME: Record<string, string> = {
  label: tk("拍酒标识别"),
  review: tk("专业评价查询"),
  prose: tk("分享图文字"),
};
const featureName = (f: string) => (FEATURE_NAME[f] ? t(FEATURE_NAME[f]) : f);

/** Today in this phone's time zone, YYYY-MM-DD. */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function bucketName(key: string, period: Period): string {
  if (period === "day") return fmtDate(key, false);
  const y = key.slice(0, 4);
  if (period === "month") return t("{y}年{m}月", { y, m: Number(key.slice(5, 7)) });
  if (period === "quarter") return t("{y}年第{q}季度", { y, q: key.slice(6) });
  return t("{y}年", { y });
}

/** Short label under a bar. */
function tickName(key: string, period: Period): string {
  if (period === "day") return String(Number(key.slice(8, 10)));
  if (period === "month") return String(Number(key.slice(5, 7)));
  if (period === "quarter") return key.slice(5);
  return key;
}

const tokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);

export function CostsPanel() {
  const [days, setDays] = useState<CostDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const [picked, setPicked] = useState<string | null>(null);
  const load = () =>
    api<{ days: CostDay[] }>(`/api/admin/costs?tz=${-new Date().getTimezoneOffset()}`)
      .then((r) => setDays(r.days))
      .catch((e) => setError(e instanceof ApiError ? tm(e.message) : t("没有网络")));
  useEffect(() => void load(), []);
  const buckets = useMemo(() => (days ? rollUp(days, period, localToday()) : []), [days, period]);
  const shown = buckets.find((b) => b.key === picked) ?? buckets[buckets.length - 1];
  const total = useMemo(() => (days ?? []).reduce((s, d) => s + d.cost, 0), [days]);

  return (
    <div class="costs">
      <div class="segmented" role="tablist" aria-label={t("开销周期")}>
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            class={period === p ? "on" : ""}
            onClick={() => {
              setPeriod(p);
              setPicked(null);
            }}
          >
            {t(PERIOD_NAME[p])}
          </button>
        ))}
      </div>
      {error && <p class="notice">{error}</p>}
      {!days && !error && <p class="muted small">{t("加载中…")}</p>}
      {days && shown && (
        <>
          <section class="group cost-head" aria-live="polite">
            <span class="muted small">{bucketName(shown.key, period)}</span>
            <strong class="cost-big">{fmtUsd(shown.cost)}</strong>
            <span class="muted small">
              {t("{n} 次调用", { n: shown.calls })}
              {shown.failed > 0 && ` · ${t("{n} 次没用上", { n: shown.failed })}`}
              {` · ${t("输入 {i} / 输出 {o} token", { i: tokens(shown.input), o: tokens(shown.output) })}`}
              {shown.searches > 0 && ` · ${t("{n} 次联网搜索", { n: shown.searches })}`}
            </span>
            <Bars buckets={buckets} period={period} picked={shown.key} onPick={setPicked} />
          </section>
          <Breakdown title={t("按功能")} rows={shown.byFeature} name={featureName} total={shown.cost} />
          <Breakdown title={t("按模型")} rows={shown.byModel} name={(m) => m} total={shown.cost} />
          <p class="muted small">
            {t("累计 {usd}。金额按价格表算出，单位美元，以 Azure 账单为准。", { usd: fmtUsd(total) })}
          </p>
        </>
      )}
      <Prices onRepriced={load} />
    </div>
  );
}

/** One bar per bucket; tap one to see it above. */
function Bars(props: { buckets: Bucket[]; period: Period; picked: string; onPick: (k: string) => void }) {
  const max = Math.max(...props.buckets.map((b) => b.cost), 0);
  const every = props.buckets.length > 12 ? 5 : 1;
  return (
    <div class="cost-bars" role="group" aria-label={t("开销周期")}>
      {props.buckets.map((b, i) => {
        const on = b.key === props.picked;
        const label = `${bucketName(b.key, props.period)}: ${fmtUsd(b.cost)}`;
        return (
          <button
            key={b.key}
            type="button"
            class={on ? "cost-bar on" : "cost-bar"}
            aria-label={label}
            aria-pressed={on}
            title={label}
            onClick={() => props.onPick(b.key)}
          >
            <span
              class="cost-bar-fill"
              style={{ height: max > 0 && b.cost > 0 ? `max(3px, ${(b.cost / max) * 100}%)` : "0" }}
            />
            <span class="cost-bar-tick">
              {(props.buckets.length - 1 - i) % every === 0 || on ? tickName(b.key, props.period) : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Breakdown(props: {
  title: string;
  rows: Record<string, { cost: number; calls: number }>;
  name: (k: string) => string;
  total: number;
}) {
  const rows = Object.entries(props.rows).sort((a, b) => b[1].cost - a[1].cost);
  return (
    <section class="group">
      <h3 class="group-title">{props.title}</h3>
      {rows.length === 0 && <p class="muted small">{t("这段时间没有调用")}</p>}
      <ul class="rows plain cost-split">
        {rows.map(([k, v]) => (
          <li key={k}>
            <span class="cost-split-name">
              {props.name(k)}
              <span class="muted small"> · {t("{n} 次", { n: v.calls })}</span>
            </span>
            <strong>{fmtUsd(v.cost)}</strong>
            <span
              class="cost-split-bar"
              style={{ width: props.total > 0 ? `${(v.cost / props.total) * 100}%` : "0" }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

const FIELDS: { key: keyof Omit<ModelPrice, "model" | "updatedAt">; label: string }[] = [
  { key: "input", label: tk("输入") },
  { key: "output", label: tk("输出") },
  { key: "cacheRead", label: tk("缓存读") },
  { key: "cacheWrite", label: tk("缓存写") },
  { key: "searchPerK", label: tk("搜索/千次") },
];

/** 价格表: USD per million tokens (and per thousand searches); new requests are costed with it. */
function Prices(props: { onRepriced: () => void }) {
  const [prices, setPrices] = useState<ModelPrice[] | null>(null);
  const [unpriced, setUnpriced] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [added, setAdded] = useState("");
  const load = () =>
    api<{ prices: ModelPrice[]; unpriced: string[] }>("/api/admin/prices")
      .then((r) => {
        setPrices(r.prices);
        setUnpriced(r.unpriced);
      })
      .catch(() => setPrices([]));
  useEffect(() => void load(), []);
  const run = async (f: () => Promise<unknown>, done?: string) => {
    setError(null);
    setNote(null);
    try {
      await f();
      if (done) setNote(done);
      void load();
    } catch (e) {
      setError(e instanceof ApiError ? tm(e.message) : t("没有网络"));
    }
  };
  const save = (p: ModelPrice) => run(() => api("/api/admin/prices", { body: p }), t("{m} 已保存", { m: p.model }));
  const blank = (model: string): ModelPrice => ({
    model,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    searchPerK: 0,
    updatedAt: null,
  });
  const reprice = async () => {
    if (!(await ask(t("用现在的价格表重新算一遍所有历史调用的金额？")))) return;
    await run(() => api("/api/admin/costs/reprice", { body: {} }), t("已按现价重算"));
    props.onRepriced();
  };
  const list = [...(prices ?? []), ...unpriced.map(blank)];
  return (
    <details class="group cost-prices">
      <summary class="group-title">{t("价格表")}</summary>
      <p class="muted small">
        {t(
          "每百万 token 多少美元（联网搜索按每千次）。改了只影响以后的调用；要连历史一起改，保存后点下面的「按现价重算」。",
        )}
      </p>
      {error && <p class="notice">{error}</p>}
      {note && <p class="muted small">{note}</p>}
      {list.map((p) => (
        <PriceRow key={p.model} price={p} missing={unpriced.includes(p.model)} onSave={save} />
      ))}
      <form
        class="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const m = added.trim();
          if (m && !list.some((p) => p.model === m)) setUnpriced([...unpriced, m]);
          setAdded("");
        }}
      >
        <label class="field grow">
          <span class="field-label">{t("加一个模型")}</span>
          <input
            value={added}
            maxLength={80}
            placeholder="claude-…"
            onInput={(e) => setAdded((e.target as HTMLInputElement).value)}
          />
        </label>
        <button type="submit" class="button small" disabled={!added.trim()}>
          {t("添加")}
        </button>
      </form>
      <button type="button" class="button small" onClick={reprice}>
        {t("按现价重算")}
      </button>
    </details>
  );
}

function PriceRow(props: { price: ModelPrice; missing: boolean; onSave: (p: ModelPrice) => void }) {
  const [v, setV] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(props.price[f.key])])));
  const changed = FIELDS.some((f) => Number(v[f.key]) !== props.price[f.key]) || props.missing;
  const valid = FIELDS.every((f) => v[f.key] !== "" && Number(v[f.key]) >= 0);
  return (
    <form
      class="price-row"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave({ ...props.price, ...Object.fromEntries(FIELDS.map((f) => [f.key, Number(v[f.key])])) });
      }}
    >
      <div class="price-model">
        <strong>{props.price.model}</strong>
        {props.missing && <span class="notice-inline small"> {t("还没有价格，按 $0 算")}</span>}
      </div>
      <div class="price-fields">
        {FIELDS.map((f) => (
          <label key={f.key} class="field">
            <span class="field-label">{t(f.label)}</span>
            <input
              inputMode="decimal"
              value={v[f.key]}
              maxLength={9}
              onInput={(e) => setV({ ...v, [f.key]: (e.target as HTMLInputElement).value.replace(/[^\d.]/g, "") })}
            />
          </label>
        ))}
      </div>
      <button type="submit" class="button small" disabled={!changed || !valid}>
        {t("保存")}
      </button>
    </form>
  );
}
