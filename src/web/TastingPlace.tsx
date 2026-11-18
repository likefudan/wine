import { useEffect, useRef, useState } from "preact/hooks";
import { cleanLocation, type TastingLocation } from "../shared/model";
import { Sheet } from "./components";
import { canLocate, locateTasting, locationPermission, stopLocating } from "./geo";
import { t } from "./i18n";
import { NearbyPicker } from "./NearbyPicker";
import { mapsUrl, PlaceInput } from "./PlaceInput";
import { fillLocations, setTastingLocation, updateMe, useStore } from "./store";

/**
 * 品酒地点 on a note: where the glass was tasted. A new note (记一杯) notes the phone's position by
 * itself when 记下品酒地点 is on (我的 → 品鉴); the first time it asks. The place is private: it
 * never shows on a shared list. Offline, the position is kept and the address follows later.
 */
export function TastingPlace(props: { id: string; fresh: boolean }) {
  const loc = useStore((s) => s.tastings.find((x) => x.id === props.id)?.location ?? null);
  const on = useStore((s) => s.me?.locationOn ?? null);
  const [looking, setLooking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const started = useRef(false);

  const locate = async () => {
    setLooking(true);
    setFailed(false);
    const ok = await locateTasting(props.id);
    setLooking(false);
    setFailed(!ok);
  };
  // Saved with no signal: look the address up now if there is a network.
  useEffect(() => {
    if (loc && !loc.geocoded) void fillLocations();
  }, [loc?.geocoded]);
  useEffect(() => {
    if (!props.fresh || started.current || on !== true || loc || !canLocate()) return;
    started.current = true;
    // Said no to this site before: asking again shows nothing, so don't look.
    locationPermission().then((p) => {
      if (p !== "denied") void locate();
    });
  }, [on]);

  const sheet = editing && (
    <LocationSheet
      id={props.id}
      value={loc}
      onClose={() => setEditing(false)}
      onSave={(next) => {
        stopLocating(props.id);
        setTastingLocation(props.id, next);
        setEditing(false);
      }}
    />
  );

  if (loc) {
    const title = loc.name || loc.address || (loc.geocoded ? t("已记下位置") : t("已记下位置，联网后补上地址"));
    const sub = loc.name ? loc.address : null;
    return (
      <div class="tasting-place">
        <span aria-hidden="true">📍</span>
        <a
          class="tasting-place-text"
          href={
            loc.lat !== null && !loc.placeId
              ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`
              : mapsUrl(loc.name || loc.address || "", loc.placeId)
          }
          target="_blank"
          rel="noreferrer"
        >
          <strong>{title}</strong>
          {sub && <span>{sub}</span>}
        </a>
        <button type="button" class="link small" onClick={() => setEditing(true)}>
          {t("修改")}
        </button>
        <button
          type="button"
          class="link small"
          aria-label={t("去掉地点")}
          onClick={() => {
            stopLocating(props.id);
            setTastingLocation(props.id, null);
          }}
        >
          ✕
        </button>
        {sheet}
      </div>
    );
  }
  if (looking)
    return (
      <div class="tasting-place muted">
        <span aria-hidden="true">📍</span> {t("正在定位…")}
      </div>
    );
  if (props.fresh && on === null && canLocate())
    return (
      <div class="notice row-notice">
        <span>{t("记下这杯在哪儿喝的？会用手机定位，只有你自己看得到。")}</span>
        <button
          type="button"
          class="link"
          onClick={() => {
            started.current = true;
            updateMe({ locationOn: true });
            void locate();
          }}
        >
          {t("好")}
        </button>
        <button type="button" class="link" onClick={() => updateMe({ locationOn: false })}>
          {t("不用")}
        </button>
      </div>
    );
  return (
    <div class="tasting-place">
      <button type="button" class="link small" onClick={() => setEditing(true)}>
        📍 {t("记下品酒地点")}
      </button>
      {failed && <span class="small muted">{t("没能拿到位置，可以手动输入")}</span>}
      {sheet}
    </div>
  );
}

/** Typing or picking where a glass was tasted. */
function LocationSheet(props: {
  id: string;
  value: TastingLocation | null;
  onClose: () => void;
  onSave: (l: TastingLocation | null) => void;
}) {
  const v = props.value;
  const [draft, setDraft] = useState<TastingLocation>(
    v ?? { lat: null, lng: null, accuracy: null, name: null, address: null, placeId: null, geocoded: true },
  );
  const save = (e: Event) => {
    e.preventDefault();
    props.onSave(cleanLocation({ ...draft, geocoded: true }));
  };
  return (
    <Sheet title={t("品酒地点")} onClose={props.onClose}>
      <form class="form" onSubmit={save}>
        <NearbyPicker
          onPick={(p) =>
            setDraft({
              lat: p.lat,
              lng: p.lng,
              accuracy: p.accuracy,
              name: p.name || draft.name,
              address: p.address,
              placeId: p.id,
              geocoded: true,
            })
          }
        />
        <PlaceInput
          label={t("地点")}
          kind="any"
          placeholder={t("例如：Opus One、我家")}
          value={draft.name ?? ""}
          onInput={(name) => setDraft({ ...draft, name })}
          onPlace={(p) =>
            setDraft({ ...draft, name: p.name, address: p.address || null, placeId: p.id, lat: p.lat, lng: p.lng })
          }
        />
        <PlaceInput
          label={t("地址")}
          kind="address"
          maxLength={200}
          placeholder={t("打几个字，会从 Google 地图联想")}
          value={draft.address ?? ""}
          onInput={(address) => setDraft({ ...draft, address, placeId: null })}
          onPlace={(p) => setDraft({ ...draft, address: p.address || null, placeId: p.id, lat: p.lat, lng: p.lng })}
        />
        <p class="small muted">{t("品酒地点只有你自己看得到，不会出现在分享的酒单里。")}</p>
        <button type="submit" class="button primary">
          {t("保存")}
        </button>
      </form>
    </Sheet>
  );
}
