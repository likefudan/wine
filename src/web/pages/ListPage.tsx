import { useLocation, useRoute } from "preact-iso";
import { useState } from "preact/hooks";
import { glassColor } from "../../shared/guide";
import { LIST_KINDS, type ListKind } from "../../shared/model";
import { BackIcon, Choice, Field, Glass, Sheet, WineName } from "../components";
import { fmtDate, t } from "../i18n";
import { blankTasting, deleteList, getState, moveItem, removeItem, saveList, saveTasting, useStore } from "../store";
import { KIND_NAMES } from "./Home";

/** Opens my note for a wine in a list, starting one at my default depth the first time. */
export function openTasting(route: (url: string) => void, vintageId: string, itemId: string | null) {
  const s = getState();
  const mine = itemId ? s.tastings.find((x) => x.listItemId === itemId) : undefined;
  if (mine) return route(`/taste/${mine.id}`);
  const x = blankTasting(vintageId, itemId, s.me?.depth ?? "quick");
  saveTasting(x);
  route(`/taste/${x.id}?new=1`);
}

export function ListPage() {
  const { params } = useRoute();
  const { route } = useLocation();
  const list = useStore((s) => s.lists.find((l) => l.id === params.id));
  const items = useStore((s) => s.items.filter((i) => i.listId === params.id).sort((a, b) => a.position - b.position));
  const vintages = useStore((s) => s.vintages);
  const tastings = useStore((s) => s.tastings);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  if (!list)
    return (
      <div class="page">
        <p class="empty">{t("找不到这份酒单")}</p>
        <a href="/">{t("回到酒单")}</a>
      </div>
    );
  const vById = new Map(vintages.map((v) => [v.id, v]));
  const scores = items
    .map((i) => tastings.find((x) => x.listItemId === i.id)?.score)
    .filter((n): n is number => typeof n === "number");
  const best = scores.length ? Math.max(...scores) : null;

  return (
    <div class="page">
      <header class="page-head">
        <a href="/" class="icon-button" aria-label={t("返回")}>
          <BackIcon />
        </a>
        <div class="page-head-title">
          <h1 class="list-title">{list.title}</h1>
          <span class="muted small">
            {t(KIND_NAMES[list.kind])}
            {list.startsOn ? ` · ${fmtDate(list.startsOn)}` : ""}
          </span>
        </div>
        <button type="button" class="link" onClick={() => setSettings(true)}>
          {t("设置")}
        </button>
      </header>
      {items.length === 0 ? (
        <p class="empty">{t("按上酒顺序一款款加进来，喝一款记一款。")}</p>
      ) : (
        <div class="list-tools">
          <span class="muted small">{t("{n} 款", { n: items.length })}</span>
          <button type="button" class="link" onClick={() => setEditing(!editing)}>
            {editing ? t("完成") : t("调整顺序")}
          </button>
        </div>
      )}
      <ol class="rows numbered">
        {items.map((i, n) => {
          const v = vById.get(i.vintageId);
          if (!v) return null;
          const mine = tastings.find((x) => x.listItemId === i.id);
          return (
            <li key={i.id} class="row-wrap">
              <span class="row-n num">{n + 1}</span>
              {editing ? (
                <div class="row">
                  <Glass color={glassColor(v.color, mine?.appearance, v.year)} />
                  <WineName v={v} sub={false} />
                  <span class="row-actions">
                    <button
                      type="button"
                      class="icon-button"
                      aria-label={t("上移")}
                      disabled={n === 0}
                      onClick={() => moveItem(list.id, i.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="icon-button"
                      aria-label={t("下移")}
                      disabled={n === items.length - 1}
                      onClick={() => moveItem(list.id, i.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="icon-button danger"
                      aria-label={t("移除")}
                      onClick={() => confirm(t("从酒单移除这款酒？你的笔记会留在酒库里。")) && removeItem(i.id)}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ) : (
                <button type="button" class="row" onClick={() => openTasting(route, v.id, i.id)}>
                  <Glass color={glassColor(v.color, mine?.appearance, v.year)} />
                  <WineName v={v} />
                  <span class={`row-score num${mine?.score !== null && mine?.score === best ? " best" : ""}`}>
                    {mine?.score ?? (mine ? "✓" : t("记"))}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <a class="button primary block" href={`/add?list=${list.id}`}>
        ＋ {t("加下一款酒")}
      </a>
      {settings && <ListSettings listId={list.id} onClose={() => setSettings(false)} onDeleted={() => route("/")} />}
    </div>
  );
}

function ListSettings(props: { listId: string; onClose: () => void; onDeleted: () => void }) {
  const list = getState().lists.find((l) => l.id === props.listId)!;
  const [title, setTitle] = useState(list.title);
  const [kind, setKind] = useState<ListKind>(list.kind);
  const [date, setDate] = useState(list.startsOn ?? "");
  const [note, setNote] = useState(list.note ?? "");
  const submit = (e: Event) => {
    e.preventDefault();
    if (!title.trim()) return;
    saveList({ ...list, title: title.trim(), kind, startsOn: date || null, note: note.trim() || null });
    props.onClose();
  };
  return (
    <Sheet title={t("酒单设置")} onClose={props.onClose}>
      <form class="form" onSubmit={submit}>
        <Field label={t("名称")}>
          <input value={title} maxLength={80} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label={t("类型")} group>
          <Choice
            label={t("类型")}
            value={kind}
            clearable={false}
            options={LIST_KINDS.map((k) => ({ value: k, label: t(KIND_NAMES[k]) }))}
            onChange={(v) => v && setKind(v)}
          />
        </Field>
        <Field label={t("日期")}>
          <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label={t("备注")}>
          <textarea
            rows={2}
            maxLength={500}
            value={note}
            onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
          />
        </Field>
        <button type="submit" class="button primary">
          {t("保存")}
        </button>
        <button
          type="button"
          class="button danger"
          onClick={() => {
            if (!confirm(t("删除这份酒单？里面的笔记会留在你的酒库里。"))) return;
            deleteList(list.id);
            props.onDeleted();
          }}
        >
          {t("删除酒单")}
        </button>
      </form>
    </Sheet>
  );
}
