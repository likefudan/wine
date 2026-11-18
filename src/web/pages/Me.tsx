import { useEffect, useState } from "preact/hooks";
import { DEPTHS, type Depth, LABEL_MODELS, type LabelModel } from "../../shared/model";
import { Choice, Field } from "../components";
import { LangSwitch } from "../LangSwitch";
import { DEPTH_INFO } from "../depths";
import { fmtDate, t, tm } from "../i18n";
import { ApiError, api, clearLocal, flush, getState, updateMe, useStore } from "../store";
import { type Theme, savedTheme, setTheme } from "../theme";

/** One line on each label model, from reading the same cellar photos with each (2026-11). */
const LABEL_MODEL_HINT: Record<LabelModel, string> = {
  "claude-sonnet-5-5": "默认，又准又不太慢",
  "claude-fable-5-2": "最准，但要多等一会儿",
  "claude-opus-5-5": "很准，比较慢",
  "DeepSeek-V4.1-Flash-1017": "最快，几秒出结果，小字偶尔认错",
};

export function Avatar() {
  const me = useStore((s) => s.me);
  if (!me) return null;
  const initial = (me.name ?? me.email).trim()[0]?.toUpperCase() ?? "?";
  return (
    <a href="/me" class="avatar" aria-label={t("我的")}>
      {me.picture ? <img src={me.picture} alt="" referrerpolicy="no-referrer" /> : <span>{initial}</span>}
    </a>
  );
}

export function MePage() {
  const me = useStore((s) => s.me)!;
  const queue = useStore((s) => s.queue.length);
  const syncedAt = useStore((s) => s.syncedAt);
  const count = useStore((s) => s.tastings.length);
  const [theme, setT] = useState<Theme>(savedTheme());
  const [syncing, setSyncing] = useState(false);
  const logout = async () => {
    if (getState().queue.length && !confirm(t("还有没同步的记录，退出后会丢失。确定退出？"))) return;
    try {
      await api("/api/auth/logout", { body: {} });
    } catch {
      // offline: forget this phone's copy anyway
    }
    clearLocal();
    location.href = "/";
  };
  return (
    <div class="page">
      <header class="page-head">
        <a href="/" class="link">
          ← {t("酒单")}
        </a>
        <h1 class="page-head-title">{t("我的")}</h1>
      </header>
      <section class="card me-card">
        <Avatar />
        <div>
          <strong>{me.name ?? me.email}</strong>
          <div class="muted small">{me.email}</div>
          <div class="muted small">{t("已记录 {n} 款", { n: count })}</div>
        </div>
      </section>
      <section class="step">
        <Field label={t("语言")} group>
          <LangSwitch />
        </Field>
        <Field label={t("默认品鉴深度")} hint={t(DEPTH_INFO[me.depth ?? "quick"].who)} group>
          <Choice
            label={t("默认品鉴深度")}
            value={me.depth ?? undefined}
            clearable={false}
            options={DEPTHS.map((d: Depth) => ({ value: d, label: t(DEPTH_INFO[d].name) }))}
            onChange={(d) => d && updateMe({ depth: d })}
          />
        </Field>
        <Field label={t("拍酒标识别模型")} hint={t(LABEL_MODEL_HINT[me.labelModel ?? LABEL_MODELS[0].id])} group>
          <Choice
            label={t("拍酒标识别模型")}
            value={me.labelModel ?? LABEL_MODELS[0].id}
            clearable={false}
            options={LABEL_MODELS.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(m) => m && updateMe({ labelModel: m })}
          />
        </Field>
        <Field label={t("外观")} group>
          <Choice
            label={t("外观")}
            value={theme}
            clearable={false}
            options={[
              { value: "auto" as const, label: t("跟随系统") },
              { value: "light" as const, label: t("浅色") },
              { value: "dark" as const, label: t("深色") },
            ]}
            onChange={(v) => {
              if (!v) return;
              setT(v);
              setTheme(v);
            }}
          />
        </Field>
      </section>
      <section class="step">
        <h2 class="step-title">{t("同步")}</h2>
        <p class="small">
          {queue > 0 ? t("还有 {n} 条未同步", { n: queue }) : t("全部已同步")}
          {syncedAt
            ? ` · ${t("上次 {time}", { time: `${fmtDate(syncedAt, false)} ${new Date(syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` })}`
            : ""}
        </p>
        <button
          type="button"
          class="button"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            await flush();
            setSyncing(false);
          }}
        >
          {syncing ? t("同步中…") : t("立即同步")}
        </button>
      </section>
      {me.owner && <Invites />}
      <button type="button" class="button danger block" onClick={logout}>
        {t("退出登录")}
      </button>
    </div>
  );
}

/** 站长 only: who may sign in (docs/design.zh.md §2). QR invitations come with 第二期. */
function Invites() {
  const [list, setList] = useState<{ email: string; joined: boolean }[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api<{ invites: { email: string; joined: boolean }[] }>("/api/invites")
      .then((r) => setList(r.invites))
      .catch(() => setList([]));
  useEffect(() => void load(), []);
  const add = async (e: Event) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/invites", { body: { email } });
      setEmail("");
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? tm(err.message) : t("没有网络"));
    }
  };
  return (
    <section class="step">
      <h2 class="step-title">{t("邀请朋友")}</h2>
      <p class="hint">{t("把朋友的 Google 邮箱加进来，他们就能登录。")}</p>
      <form class="inline-form" onSubmit={add}>
        <input
          type="email"
          placeholder="friend@gmail.com"
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="button small" disabled={!email}>
          {t("添加")}
        </button>
      </form>
      {error && <p class="notice">{error}</p>}
      <ul class="rows plain">
        {list?.map((i) => (
          <li key={i.email} class="invite-row">
            <span>{i.email}</span>
            <span class="muted small">{i.joined ? t("已加入") : t("未登录过")}</span>
            <button
              type="button"
              class="link danger small"
              onClick={async () => {
                await api(`/api/invites/${encodeURIComponent(i.email)}`, { method: "DELETE" }).catch(() => {});
                void load();
              }}
            >
              {t("移除")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
