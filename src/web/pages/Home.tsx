import { useLocation } from "preact-iso";
import { useState } from "preact/hooks";
import { glassColor } from "../../shared/guide";
import { LIST_KINDS, type ListKind, type ListPlace, type PlaceKind } from "../../shared/model";
import { PlaceInput } from "../PlaceInput";
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

/** The place field of each kind of list: what it is called and what Google Places looks for first. */
const PLACE_FIELD: Record<ListKind, { label: string; placeholder: string; kind: PlaceKind } | null> = {
  winery: { label: tk("酒庄"), placeholder: "Opus One", kind: "winery" },
  trip: { label: tk("地点"), placeholder: "Napa Valley", kind: "any" },
  dinner: { label: tk("餐厅"), placeholder: "", kind: "restaurant" },
  home: null,
};

/** Where the list happens; a home tasting has no place. `onPicked`: a Google Places pick. */
export function ListPlaceField(props: {
  kind: ListKind;
  value: ListPlace | null;
  onChange: (p: ListPlace | null) => void;
  onPicked?: (name: string) => void;
}) {
  const f = PLACE_FIELD[props.kind];
  if (!f) return null;
  return (
    <>
      <PlaceInput
        label={t(f.label)}
        kind={f.kind}
        placeholder={f.placeholder}
        value={props.value?.name ?? ""}
        onInput={(name) => props.onChange(name.trim() ? { name, id: null, address: null, lat: null, lng: null } : null)}
        onPlace={(p) => {
          props.onChange({ name: p.name, id: p.id, address: p.address || null, lat: p.lat, lng: p.lng });
          props.onPicked?.(p.name);
        }}
      />
      {props.value?.address ? (
        <p class="field-hint place-address">{props.value.address}</p>
      ) : (
        <p class="field-hint place-address">{t("打几个字，会从 Google 地图联想")}</p>
      )}
    </>
  );
}

/** A list's place as saved: home tastings have none, and a name typed then cleared is none. */
export const placeFor = (kind: ListKind, p: ListPlace | null): ListPlace | null =>
  kind === "home" || !p?.name.trim() ? null : { ...p, name: p.name.trim() };

export function NewListSheet(props: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ListKind>("winery");
  const [place, setPlace] = useState<ListPlace | null>(null);
  const [date, setDate] = useState(today());
  const submit = (e: Event) => {
    e.preventDefault();
    if (!title.trim()) return;
    const l = newList(title.trim(), kind, date || null, placeFor(kind, place));
    props.onCreated(l.id);
  };
  return (
    <Sheet title={t("新建酒单")} onClose={props.onClose}>
      <form class="form" onSubmit={submit}>
        <Field label={t("类型")} group>
          <Choice
            label={t("类型")}
            value={kind}
            clearable={false}
            options={LIST_KINDS.map((k) => ({ value: k, label: t(KIND_NAMES[k]) }))}
            onChange={(v) => v && setKind(v)}
          />
        </Field>
        <ListPlaceField
          kind={kind}
          value={place}
          onChange={setPlace}
          onPicked={(name) => {
            if (!title.trim()) setTitle(name);
          }}
        />
        <Field label={t("名称")}>
          <input
            value={title}
            maxLength={80}
            placeholder={t("例如：Napa 第一天 · Opus One")}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
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
  const me = useStore((s) => s.me);
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
      {me && !me.approved && (
        <p class="notice">
          {t("你的账号正在等站长审核。现在就能正常记录；拍酒标识别和酒庄地址联想要等审核通过后才能用。")}
        </p>
      )}
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
                    {l.place ? ` · ${l.place.name}` : ""}
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
