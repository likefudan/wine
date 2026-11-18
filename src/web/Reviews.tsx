import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { DESCRIPTOR_BY_ID } from "../shared/descriptors";
import type { VintageInfo } from "../shared/model";
import { AromaVersus } from "./Versus";
import { type CriticScore, type ProReview, type ReviewsView, reviewPrompt } from "../shared/reviews";
import { Sheet } from "./components";
import { currentLang, fmtDate, p, t, tm, useLang } from "./i18n";
import { ApiError, api, flush } from "./store";

/**
 * 专业评价 on a wine's page (docs/design.zh.md §3.2): the shared lookup (查专业评价, Claude with web
 * search, once per vintage for everyone), and 用自己的 AI 查 (copy a prompt, paste the answer back:
 * private, unchecked). Folded until I've noted the wine myself, so my own impressions come first.
 */

const POLL_MS = 4_000;

const errorText = (e: unknown) => (e instanceof ApiError ? tm(e.message) : t("没有网络，专业评价要联网才能查"));

export function ProReviews(props: { v: VintageInfo; tasted: boolean }) {
  const { v } = props;
  useLang();
  const [open, setOpen] = useState(props.tasted);
  const [data, setData] = useState<ReviewsView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState(false);
  const [report, setReport] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const load = async () => {
    try {
      let r: ReviewsView;
      try {
        r = await api<ReviewsView>(`/api/reviews/${v.id}`);
      } catch (e) {
        // A wine noted offline may not be uploaded yet.
        if (!(e instanceof ApiError && e.status === 404)) throw e;
        await flush();
        r = await api<ReviewsView>(`/api/reviews/${v.id}`);
      }
      if (alive.current) {
        setData(r);
        setError("");
      }
    } catch (e) {
      if (alive.current) setError(errorText(e));
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open, v.id]);

  // Someone else's lookup is running: check again until it's done.
  useEffect(() => {
    if (data?.shared?.status !== "pending" || busy) return;
    const timer = setTimeout(load, POLL_MS);
    return () => clearTimeout(timer);
  }, [data, busy]);

  const lookup = async () => {
    setBusy(true);
    setError("");
    try {
      await flush();
      const r = await api<ReviewsView>(`/api/reviews/${v.id}/lookup`, { body: {} });
      if (alive.current) setData(r);
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  if (!open)
    return (
      <section class="pro">
        <h2 class="section-title">{t("专业评价")}</h2>
        <div class="pro-folded">
          <p class="small muted">{t("先记下你自己的感受，再看评论家怎么说。这样记下的才是你自己的味觉。")}</p>
          <button type="button" class="link small" onClick={() => setOpen(true)}>
            {t("现在就看")}
          </button>
        </div>
      </section>
    );

  const s = data?.shared;
  const pending = busy || s?.status === "pending";
  return (
    <section class="pro">
      <h2 class="section-title">{t("专业评价")}</h2>
      {error && (
        <p class="notice" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p class="small muted">{t("加载中…")}</p>}

      {data && pending && (
        <div class="pro-card pro-pending" aria-busy="true">
          <span class="spinner" aria-hidden="true" />
          <p class="small">{t("正在联网查找专业评价，一般 15 到 40 秒…")}</p>
        </div>
      )}

      {data && !pending && s?.status === "done" && (
        <ReviewCard
          review={s.review}
          foot={
            <>
              <span>{t("{date} 由 AI 联网查到，分数照来源原样显示", { date: fmtDate(s.fetchedAt) })}</span>
              <span class="pro-actions">
                <button type="button" class="link small" onClick={() => setReport(true)}>
                  {t("报告错误")}
                </button>
                {s.canRefresh && data.available && data.left > 0 && (
                  <button type="button" class="link small" onClick={lookup}>
                    {t("重新查")}
                  </button>
                )}
              </span>
            </>
          }
        />
      )}

      {data && !pending && s?.status === "done" && <AromaVersus vintageId={v.id} pro={s.review.aromas} />}

      {data && !pending && s?.status === "failed" && (
        <div class="pro-card">
          <p class="small">{t("这次没能查到，可能是网络或 AI 暂时出错。")}</p>
          {s.canRetry && data.available && data.left > 0 ? (
            <button type="button" class="button small" onClick={lookup}>
              {t("再查一次")}
            </button>
          ) : (
            <p class="small muted">{t("过一会儿可以再试，或者先用自己的 AI 查。")}</p>
          )}
        </div>
      )}

      {data && !pending && !s && (
        <div class="pro-card">
          {data.available ? (
            <>
              <button type="button" class="button primary block" disabled={data.left <= 0} onClick={lookup}>
                {t("查专业评价")}
              </button>
              <p class="small muted">
                {data.left > 0
                  ? t(
                      "AI 联网查评论家分数、社区均分和参考价，约 20 秒；查过一次，大家都能直接看。今天还能查 {n} 款。",
                      {
                        n: data.left,
                      },
                    )
                  : t("今天的查询次数用完了，明天再查，或者先用自己的 AI 查。")}
              </p>
            </>
          ) : (
            <p class="small muted">{t("网站现在查不了专业评价，可以先用自己的 AI 查。")}</p>
          )}
        </div>
      )}

      {data?.mine && (
        <ReviewCard
          review={data.mine.review}
          mine
          foot={
            <>
              <span>{t("用户导入，未核实 · 只有你看得到")}</span>
              <span class="pro-actions">
                <button type="button" class="link small" onClick={() => setOwn(true)}>
                  {t("重新导入")}
                </button>
                <button
                  type="button"
                  class="link small danger"
                  onClick={async () => {
                    try {
                      setData(await api<ReviewsView>(`/api/reviews/${v.id}/import`, { method: "DELETE" }));
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  {t("删除")}
                </button>
              </span>
            </>
          }
        />
      )}

      {data && !data.mine && (
        <button type="button" class="button small pro-own" onClick={() => setOwn(true)}>
          {t("用自己的 AI 查")}
        </button>
      )}

      {own && <OwnAiSheet v={v} onClose={() => setOwn(false)} onSaved={(r) => setData(r)} />}
      {report && <ReportSheet vintageId={v.id} onClose={() => setReport(false)} />}
    </section>
  );
}

/** Scores grouped by publication, each reviewer on its own line, each linked to its source. */
function ReviewCard(props: { review: ProReview; mine?: boolean; foot: ComponentChildren }) {
  const r = props.review;
  const groups = new Map<string, CriticScore[]>();
  for (const c of r.critics) groups.set(c.publication, [...(groups.get(c.publication) ?? []), c]);
  const lang = currentLang();
  const summary = r.summary
    ? (lang === "en" ? r.summary.en : lang === "zh-TW" ? r.summary.tw : r.summary.zh) ||
      r.summary.zh ||
      r.summary.tw ||
      r.summary.en
    : "";
  return (
    <div class={props.mine ? "pro-card mine" : "pro-card"}>
      {props.mine && <span class="pro-badge">{t("用户导入，未核实")}</span>}
      {r.critics.length ? (
        <ul class="pro-scores">
          {[...groups].map(([pub, list]) => (
            <li key={pub}>
              <span class="pro-pub">{pub}</span>
              <span class="pro-reviewers">
                {list.map((c) => (
                  <span key={`${c.reviewer}-${c.score}`} class="pro-score-line">
                    {c.url ? (
                      <a class="pro-score num" href={c.url} target="_blank" rel="noreferrer">
                        {c.score}
                      </a>
                    ) : (
                      <span class="pro-score num">{c.score}</span>
                    )}
                    {c.reviewer && <span class="small">{c.reviewer}</span>}
                    {c.via && <span class="pro-via">{t("经 {site} 转引", { site: c.via })}</span>}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="small muted">{t("没找到评论家分数。")}</p>
      )}
      <dl class="pro-facts">
        <dt>{t("社区均分")}</dt>
        <dd>
          {r.community ? (
            <a href={r.community.url} target="_blank" rel="noreferrer">
              <span class="num">{r.community.avg}</span>
              {r.community.count !== null && ` · ${t("{n} 条笔记", { n: r.community.count })}`}
              {" · CellarTracker"}
            </a>
          ) : (
            <span class="muted">{t("未找到")}</span>
          )}
        </dd>
        <dt>{t("参考价")}</dt>
        <dd>
          {r.price ? (
            <a href={r.price.url} target="_blank" rel="noreferrer">
              <span class="num">${r.price.usd}</span> · Wine-Searcher
            </a>
          ) : (
            <span class="muted">{t("未找到")}</span>
          )}
        </dd>
        {r.drinkWindow && (
          <>
            <dt>{t("适饮期")}</dt>
            <dd class="num">{r.drinkWindow}</dd>
          </>
        )}
      </dl>
      {r.aromas.length > 0 && (
        <div class="chips pro-aromas" role="group" aria-label={t("酒评里提到的香气")}>
          {r.aromas.map((id) => {
            const d = DESCRIPTOR_BY_ID.get(id);
            return d ? (
              <span key={id} class="chip static">
                {p(d.name)}
              </span>
            ) : null;
          })}
        </div>
      )}
      {summary && <p class="small pro-summary">{summary}</p>}
      <p class="pro-links small">
        <a href={r.links.wineSearcher} target="_blank" rel="noreferrer">
          Wine-Searcher ↗
        </a>
        <a href={r.links.cellarTracker} target="_blank" rel="noreferrer">
          CellarTracker ↗
        </a>
      </p>
      <p class="pro-foot small muted">{props.foot}</p>
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 用自己的 AI 查: copy the prompt, run it in ChatGPT / Claude / 豆包…, paste the answer back. */
function OwnAiSheet(props: { v: VintageInfo; onClose: () => void; onSaved: (r: ReviewsView) => void }) {
  const { v } = props;
  const prompt = reviewPrompt(currentLang(), v.producer, v.wine, v.year);
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await flush();
      props.onSaved(await api<ReviewsView>(`/api/reviews/${v.id}/import`, { body: { text, lang: currentLang() } }));
      props.onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet title={t("用自己的 AI 查")} onClose={props.onClose}>
      <form class="form" onSubmit={save}>
        <p class="small">
          {t(
            "复制下面的提示词，粘贴到你常用的 AI（ChatGPT、Claude、豆包等，要能联网搜索），再把它的回答整段粘贴回来。导入的结果只有你看得到，标为“未核实”。",
          )}
        </p>
        <button
          type="button"
          class="button primary"
          onClick={async () => setCopied((await copyText(prompt)) ? "ok" : "manual")}
        >
          {copied === "ok" ? t("已复制提示词 ✓") : t("复制提示词")}
        </button>
        {copied === "manual" && (
          <>
            <p class="small muted">{t("没能自动复制，请长按下面的文字全选复制。")}</p>
            <textarea class="pro-prompt" readOnly rows={8} value={prompt} />
          </>
        )}
        <label class="field">
          <span class="field-label">{t("AI 的回答")}</span>
          <textarea
            rows={7}
            value={text}
            placeholder={t("把 AI 的整段回答粘贴到这里")}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          />
        </label>
        {error && (
          <p class="notice" role="alert">
            {error}
          </p>
        )}
        <button type="submit" class="button" disabled={!text.trim() || saving}>
          {saving ? t("导入中…") : t("导入")}
        </button>
      </form>
    </Sheet>
  );
}

function ReportSheet(props: { vintageId: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [state, setState] = useState<"" | "sending" | "sent">("");
  const [error, setError] = useState("");
  return (
    <Sheet title={t("报告错误")} onClose={props.onClose}>
      {state === "sent" ? (
        <div class="form">
          <p>{t("收到了，谢谢！站长会核对。")}</p>
          <button type="button" class="button" onClick={props.onClose}>
            {t("关闭")}
          </button>
        </div>
      ) : (
        <form
          class="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setState("sending");
            try {
              await api(`/api/reviews/${props.vintageId}/report`, { body: { note } });
              setState("sent");
            } catch (err) {
              setError(errorText(err));
              setState("");
            }
          }}
        >
          <label class="field">
            <span class="field-label">{t("哪里不对？")}</span>
            <textarea
              rows={4}
              maxLength={500}
              value={note}
              placeholder={t("例如：Wine Advocate 应该是 96 分")}
              onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
            />
          </label>
          {error && (
            <p class="notice" role="alert">
              {error}
            </p>
          )}
          <button type="submit" class="button primary" disabled={state === "sending"}>
            {t("发送")}
          </button>
        </form>
      )}
    </Sheet>
  );
}
