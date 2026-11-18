import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { DEPTHS, type Depth, LABEL_MODELS, type LabelModel, type Member } from "../../shared/model";
import { Choice, Field } from "../components";
import { LangSwitch } from "../LangSwitch";
import { ask } from "../confirm";
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

/** My picture: a link to 我的, or (`tab`) the icon of the 我的 tab, which is already a link. */
export function Avatar(props: { tab?: boolean }) {
  const me = useStore((s) => s.me);
  if (!me) return null;
  const initial = (me.name ?? me.email).trim()[0]?.toUpperCase() ?? "?";
  const face = me.picture ? <img src={me.picture} alt="" referrerpolicy="no-referrer" /> : <span>{initial}</span>;
  if (props.tab)
    return (
      <span class="avatar tab-avatar" aria-hidden="true">
        {face}
      </span>
    );
  return (
    <a href="/me" class="avatar" aria-label={t("我的")}>
      {face}
    </a>
  );
}

type MeTab = "tasting" | "general" | "members";

/** How many newcomers wait for approval (owners only): a dot on 我的 and on its 成员 tab. */
let pending = 0;
const pendingListeners = new Set<(n: number) => void>();
const setPending = (n: number) => {
  pending = n;
  for (const f of pendingListeners) f(n);
};
/** Asks the server again; called when an owner opens the app or 我的. */
export const refreshPending = () =>
  api<{ members: Member[] }>("/api/members")
    .then((r) => setPending(r.members.filter((m) => m.status === "pending").length))
    .catch(() => {});
export function usePending(): number {
  const [n, setN] = useState(pending);
  useEffect(() => {
    pendingListeners.add(setN);
    return () => void pendingListeners.delete(setN);
  }, []);
  return n;
}

export function MePage() {
  const me = useStore((s) => s.me)!;
  const queue = useStore((s) => s.queue.length);
  const syncedAt = useStore((s) => s.syncedAt);
  const count = useStore((s) => s.tastings.length);
  const [theme, setT] = useState<Theme>(savedTheme());
  const [syncing, setSyncing] = useState(false);
  const { query, route } = useLocation();
  const waiting = usePending();
  useEffect(() => {
    if (me.owner) void refreshPending();
  }, [me.owner]);
  const logout = async () => {
    if (getState().queue.length) await flush();
    if (getState().queue.length && !(await ask(t("还有记录没备份到云端，退出后会丢失。确定退出？")))) return;
    try {
      await api("/api/auth/logout", { body: {} });
    } catch {
      // offline: forget this phone's copy anyway
    }
    clearLocal();
    location.href = "/";
  };
  const tabs: { id: MeTab; label: string }[] = [
    { id: "tasting", label: t("记录偏好") },
    { id: "general", label: t("通用") },
    ...(me.owner ? [{ id: "members" as const, label: t("成员") }] : []),
  ];
  const tab: MeTab = tabs.some((x) => x.id === query.tab) ? (query.tab as MeTab) : "tasting";
  const pick = (id: MeTab) => route(id === "tasting" ? "/me" : `/me?tab=${id}`, true);
  return (
    <div class="page">
      <h1 class="visually-hidden">{t("我的")}</h1>
      <section class="me-card">
        <Avatar tab />
        <div>
          <strong>{me.name ?? me.email}</strong>
          <div class="muted small">{me.email}</div>
          <div class="muted small">{t("已记录 {n} 款", { n: count })}</div>
        </div>
      </section>
      <div class="segmented" role="tablist" aria-label={t("设置")}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            class={tab === x.id ? "on" : ""}
            onClick={() => pick(x.id)}
          >
            {x.label}
            {x.id === "members" && waiting > 0 && <span class="badge">{waiting}</span>}
          </button>
        ))}
      </div>
      {tab === "tasting" && (
        <section class="group" role="tabpanel">
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
          <Field label={t("记下品酒地点")} hint={t("记一杯时用手机定位记下在哪儿喝的，只有你自己看得到。")} group>
            <Choice
              label={t("记下品酒地点")}
              value={me.locationOn === false ? "off" : me.locationOn ? "on" : undefined}
              clearable={false}
              options={[
                { value: "on" as const, label: t("开") },
                { value: "off" as const, label: t("关") },
              ]}
              onChange={(v) => v && updateMe({ locationOn: v === "on" })}
            />
          </Field>
        </section>
      )}
      {tab === "general" && (
        <>
          <section class="group" role="tabpanel">
            <Field label={t("语言")} group>
              <LangSwitch />
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
          <section class="group">
            <h2 class="group-title">{t("离线与备份")}</h2>
            <p class="small muted">
              {t(
                "记录先存在这部手机上，有网时自动备份到云端。在酒庄没信号也能照常记，有网后会自动补传，不用手动操作。",
              )}
            </p>
            <p class="small sync-status">
              {queue > 0
                ? navigator.onLine
                  ? t("有 {n} 条修改在手机上，稍后自动上传", { n: queue })
                  : t("有 {n} 条记录还在手机上，有网后会自动上传", { n: queue })
                : syncedAt
                  ? t("✓ 都已备份到云端（{time}）", {
                      time: `${fmtDate(syncedAt, false)} ${new Date(syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
                    })
                  : t("✓ 都已备份到云端")}
            </p>
            {queue > 0 && (
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
                {syncing ? t("上传中…") : t("现在上传")}
              </button>
            )}
          </section>
          <button type="button" class="button danger block" onClick={logout}>
            {t("退出登录")}
          </button>
        </>
      )}
      {tab === "members" && <Members />}
    </div>
  );
}

/** 站长 only: who may sign in (docs/design.zh.md §2). QR invitations come with 第二期. */
/** 开放注册 (owners): approve newcomers, stop or restore accounts, and set 每天免审核名额. */
function Members() {
  const [list, setList] = useState<Member[] | null>(null);
  const [perDay, setPerDay] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api<{ members: Member[]; autoApprovePerDay: number }>("/api/members")
      .then((r) => {
        setList(r.members);
        setPending(r.members.filter((m) => m.status === "pending").length);
        setPerDay(String(r.autoApprovePerDay));
      })
      .catch(() => setList([]));
  useEffect(() => void load(), []);
  const run = async (f: () => Promise<unknown>) => {
    setError(null);
    try {
      await f();
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? tm(err.message) : t("没有网络"));
    }
  };
  const setStatus = (id: string, status: "active" | "disabled") =>
    run(() => api(`/api/members/${id}`, { body: { status } }));
  const savePerDay = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/settings/auto-approve", { body: { perDay: Number(perDay) } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };
  const pending = list?.filter((m) => m.status === "pending") ?? [];
  const others = list?.filter((m) => m.status !== "pending") ?? [];
  const row = (m: Member, actions: preact.ComponentChildren) => (
    <li key={m.id} class="member-row">
      <span class="member-who">
        <strong>{m.name ?? m.email}</strong>
        <span class="muted small">
          {m.email} · {fmtDate(m.createdAt, false)}
          {m.status === "disabled" ? ` · ${t("已停用")}` : m.approvedBy === "auto" ? ` · ${t("免审核")}` : ""}
        </span>
      </span>
      {actions}
    </li>
  );
  return (
    <section class="group" role="tabpanel">
      <form class="inline-form" onSubmit={savePerDay}>
        <label class="field grow">
          <span class="field-label">{t("每天免审核名额")}</span>
          <input
            inputMode="numeric"
            value={perDay}
            maxLength={4}
            onInput={(e) => setPerDay((e.target as HTMLInputElement).value.replace(/\D/g, ""))}
          />
          <span class="field-hint">
            {t("24 小时内前这么多位新用户注册后直接能用；之后的要你审核。填 0 = 全部审核。")}
          </span>
        </label>
        <button type="submit" class="button small" disabled={perDay === ""}>
          {saved ? t("已保存") : t("保存")}
        </button>
      </form>
      {error && <p class="notice">{error}</p>}
      <h3 class="section-title">{t("待审核 ({n})", { n: pending.length })}</h3>
      {pending.length === 0 && <p class="muted small">{t("没有待审核的人")}</p>}
      <ul class="rows plain">
        {pending.map((m) =>
          row(
            m,
            <span class="member-actions">
              <button type="button" class="button small primary" onClick={() => setStatus(m.id, "active")}>
                {t("通过")}
              </button>
              <button type="button" class="link danger small" onClick={() => setStatus(m.id, "disabled")}>
                {t("拒绝")}
              </button>
            </span>,
          ),
        )}
      </ul>
      <h3 class="section-title">{t("所有成员 ({n})", { n: others.length })}</h3>
      <ul class="rows plain">
        {others.map((m) =>
          row(
            m,
            m.status === "disabled" ? (
              <button type="button" class="link small" onClick={() => setStatus(m.id, "active")}>
                {t("恢复")}
              </button>
            ) : (
              <button
                type="button"
                class="link danger small"
                onClick={async () => (await ask(t("停用后对方不能再登录。确定？"))) && setStatus(m.id, "disabled")}
              >
                {t("停用")}
              </button>
            ),
          ),
        )}
      </ul>
    </section>
  );
}
