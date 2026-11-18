import { useLocation } from "preact-iso";
import { useState } from "preact/hooks";
import { glassColor } from "../../shared/guide";
import { LIST_KINDS, type ListKind } from "../../shared/model";
import { Choice, Field, Glass, Sheet, WineName } from "../components";
import { fmtDate, t, tk } from "../i18n";
import { newList, useStore } from "../store";
import { Avatar } from "./Me";

export const KIND_NAMES: Record<ListKind, string> = {
  winery: tk("酒庄品鉴"),
  trip: tk("旅行"),
  dinner: tk("饭局"),
  home: tk("在家"),
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function NewListSheet(props: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ListKind>("winery");
  const [date, setDate] = useState(today());
  const submit = (e: Event) => {
    e.preventDefault();
    if (!title.trim()) return;
    const l = newList(title.trim(), kind, date || null);
    props.onCreated(l.id);
  };
  return (
    <Sheet title={t("新建酒单")} onClose={props.onClose}>
      <form class="form" onSubmit={submit}>
        <Field label={t("名称")}>
          <input
            value={title}
            maxLength={80}
            placeholder={t("例如：Napa 第一天 · Opus One")}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
          />
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
        <button type="submit" class="button primary" disabled={!title.trim()}>
          {t("建好了")}
        </button>
      </form>
    </Sheet>
  );
}

export function Home() {
  const { route } = useLocation();
  const lists = useStore((s) => s.lists);
  const items = useStore((s) => s.items);
  const vintages = useStore((s) => s.vintages);
  const tastings = useStore((s) => s.tastings);
  const [adding, setAdding] = useState(false);
  const vById = new Map(vintages.map((v) => [v.id, v]));
  const loose = tastings.filter((x) => !x.listItemId).slice(0, 5);
  const sorted = [...lists].sort((a, b) => (b.startsOn ?? b.createdAt).localeCompare(a.startsOn ?? a.createdAt));

  return (
    <div class="page">
      <header class="page-head">
        <h1 class="brand">{t("酒单")}</h1>
        <Avatar />
      </header>
      <button type="button" class="button primary block" onClick={() => setAdding(true)}>
        ＋ {t("新建酒单")}
      </button>
      {sorted.length === 0 && (
        <div class="empty">
          <p>{t("一份酒单就是一次品鉴或一次旅行。去酒庄之前建一份，到了就按上酒顺序一款款记。")}</p>
        </div>
      )}
      <ul class="cards">
        {sorted.map((l) => {
          const its = items.filter((i) => i.listId === l.id).sort((a, b) => a.position - b.position);
          return (
            <li key={l.id}>
              <a class="card list-card" href={`/lists/${l.id}`}>
                <div class="list-card-head">
                  <strong class="list-title">{l.title}</strong>
                  <span class="muted small">
                    {t(KIND_NAMES[l.kind])}
                    {l.startsOn ? ` · ${fmtDate(l.startsOn, false)}` : ""}
                  </span>
                </div>
                <div class="glass-row">
                  {its.length === 0 && <span class="muted small">{t("还没有酒")}</span>}
                  {its.slice(0, 12).map((i) => {
                    const v = vById.get(i.vintageId);
                    const mine = tastings.find((x) => x.listItemId === i.id);
                    return v ? (
                      <Glass key={i.id} color={glassColor(v.color, mine?.appearance, v.year)} size={22} />
                    ) : null;
                  })}
                  {its.length > 0 && <span class="muted small">{t("{n} 款", { n: its.length })}</span>}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
      {loose.length > 0 && (
        <section>
          <h2 class="section-title">{t("不在酒单里的记录")}</h2>
          <ul class="rows">
            {loose.map((x) => {
              const v = vById.get(x.vintageId);
              if (!v) return null;
              return (
                <li key={x.id}>
                  <a class="row" href={`/taste/${x.id}`}>
                    <Glass color={glassColor(v.color, x.appearance, v.year)} />
                    <WineName v={v} sub={false} />
                    <span class="row-score num">{x.score ?? "—"}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {adding && <NewListSheet onClose={() => setAdding(false)} onCreated={(id) => route(`/lists/${id}`)} />}
    </div>
  );
}
