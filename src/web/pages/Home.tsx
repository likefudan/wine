import { useLocation } from "preact-iso";
import { useState } from "preact/hooks";
import { glassColor } from "../../shared/guide";
import { LIST_KINDS, type ListKind, type ListPlace, type PlaceKind } from "../../shared/model";
import { Logo } from "../Logo";
import { PlaceInput } from "../PlaceInput";
import { Choice, Field, Glass, Sheet, WineName } from "../components";
import { fmtDate, t, tk } from "../i18n";
import { newList, useStore } from "../store";
import { Avatar } from "./Me";

export const KIND_NAMES: Record<ListKind, string> = {
  winery: tk("酒庄品鉴"),
  home: tk("在家"),
  dinner: tk("饭局"),
  trip: tk("旅行"),
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The place fields of each kind of list: what the name is called, and what Google looks for first. */
const PLACE_FIELD: Record<ListKind, { label: string; placeholder: string; kind: PlaceKind; suggest: boolean }> = {
  winery: { label: tk("酒庄"), placeholder: "Opus One", kind: "winery", suggest: true },
  home: { label: tk("谁家"), placeholder: tk("例如：我家、小王家"), kind: "any", suggest: false },
  dinner: { label: tk("餐厅"), placeholder: "The French Laundry", kind: "restaurant", suggest: true },
  trip: { label: tk("地点"), placeholder: tk("例如：金门公园"), kind: "any", suggest: true },
};

const NO_PLACE: ListPlace = { name: "", id: null, address: null, lat: null, lng: null };

/**
 * Where the list happens: a name and an address. Typing a name looks it up on Google Maps (a home's
 * name does not) and picking one fills the address; the address field always looks up addresses.
 * Both can be typed by hand when Google has nothing. `onPicked`: a name picked from Google.
 */
export function ListPlaceFields(props: {
  kind: ListKind;
  value: ListPlace | null;
  onChange: (p: ListPlace | null) => void;
  onPicked?: (name: string) => void;
}) {
  const f = PLACE_FIELD[props.kind];
  const v = props.value ?? NO_PLACE;
  const put = (p: ListPlace) => props.onChange(p.name.trim() || p.address?.trim() ? p : null);
  return (
    <>
      <PlaceInput
        label={t(f.label)}
        kind={f.kind}
        suggest={f.suggest}
        placeholder={t(f.placeholder)}
        value={v.name}
        onInput={(name) => put({ ...v, name })}
        onPlace={(p) => {
          put({ name: p.name || v.name, id: p.id, address: p.address || v.address, lat: p.lat, lng: p.lng });
          props.onPicked?.(p.name);
        }}
      />
      <PlaceInput
        label={t("地址")}
        kind="address"
        maxLength={200}
        placeholder={t("打几个字，会从 Google 地图联想")}
        value={v.address ?? ""}
        // A typed address is no longer the place Google found.
        onInput={(address) => put({ ...v, address, id: null, lat: null, lng: null })}
        onPlace={(p) => put({ ...v, id: p.id, address: p.address || null, lat: p.lat, lng: p.lng })}
      />
    </>
  );
}

/** A list's place as saved: trimmed, and none when both fields are empty. */
export const placeFor = (p: ListPlace | null): ListPlace | null => {
  const name = p?.name.trim() ?? "";
  const address = p?.address?.trim() || null;
  return p && (name || address) ? { ...p, name, address } : null;
};

export function NewListSheet(props: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ListKind>("winery");
  const [place, setPlace] = useState<ListPlace | null>(null);
  const [date, setDate] = useState(today());
  const submit = (e: Event) => {
    e.preventDefault();
    if (!title.trim()) return;
    const l = newList(title.trim(), kind, date || null, placeFor(place));
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
        <ListPlaceFields
          kind={kind}
          value={place}
          onChange={setPlace}
          onPicked={(name) => {
            if (!title.trim()) setTitle(name);
          }}
        />
        <Field label={t("酒单名称")}>
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
        <Logo size={34} class="head-logo" />
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
                    {l.place ? ` · ${l.place.name || l.place.address}` : ""}
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
