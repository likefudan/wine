import { useState } from "preact/hooks";
import type { NearbyPlaces, PlaceKind } from "../shared/model";
import { canLocate, getPosition, lookupNear, type Position } from "./geo";
import { t } from "./i18n";
import { useStore } from "./store";

/** A place picked from around the phone: `name` is empty when only the address was taken. */
export interface NearPick {
  name: string;
  address: string | null;
  id: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
}

export const fmtDistance = (m: number) =>
  m < 1000 ? t("{n} 米", { n: Math.max(10, Math.round(m / 10) * 10) }) : t("{n} 公里", { n: (m / 1000).toFixed(1) });

/**
 * 「用当前位置」: asks the phone where it is, then offers the places around it (closest first) and the
 * street address there. Needs the network; without Location Services it says how to turn them on.
 */
export function NearbyPicker(props: { kind?: PlaceKind; onPick: (p: NearPick) => void }) {
  const approved = useStore((s) => !!s.me?.approved);
  const [state, setState] = useState<"idle" | "looking" | "denied" | "offline" | "error">("idle");
  const [found, setFound] = useState<{ pos: Position; near: NearbyPlaces } | null>(null);
  if (!canLocate() || !approved) return null;

  const look = async () => {
    if (!navigator.onLine) return setState("offline");
    setState("looking");
    setFound(null);
    const pos = await getPosition();
    if (!pos) return setState("denied");
    try {
      const near = await lookupNear(pos, props.kind);
      setFound({ pos, near });
      setState("idle");
    } catch {
      setState("error");
    }
  };
  const pick = (p: Omit<NearPick, "accuracy">) => {
    props.onPick({ ...p, accuracy: found?.pos.accuracy ?? null });
    setFound(null);
  };

  return (
    <div class="nearby">
      <button type="button" class="link small" onClick={look} disabled={state === "looking"}>
        📍 {state === "looking" ? t("正在定位…") : t("用当前位置")}
      </button>
      {state === "denied" && (
        <p class="small muted">{t("没能拿到位置。请在手机的设置里允许本网站（或 Safari）使用定位，再试一次。")}</p>
      )}
      {state === "offline" && <p class="small muted">{t("没有网络，暂时找不到附近的地点")}</p>}
      {state === "error" && <p class="small muted">{t("附近地点查询失败，请稍后再试")}</p>}
      {found && (
        <ul class="nearby-list">
          {found.near.address && (
            <li>
              <button
                type="button"
                onClick={() =>
                  pick({ name: "", address: found.near.address, id: null, lat: found.pos.lat, lng: found.pos.lng })
                }
              >
                <strong>{t("只用这里的地址")}</strong>
                <span>{found.near.address}</span>
              </button>
            </li>
          )}
          {found.near.places.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() =>
                  pick({
                    name: p.name,
                    address: p.address || null,
                    id: p.id,
                    lat: p.lat ?? found.pos.lat,
                    lng: p.lng ?? found.pos.lng,
                  })
                }
              >
                <strong>
                  {p.name}
                  {p.distance !== null && <em class="muted"> · {fmtDistance(p.distance)}</em>}
                </strong>
                <span>{p.address}</span>
              </button>
            </li>
          ))}
          {!found.near.address && found.near.places.length === 0 && (
            <li class="small muted">{t("附近没找到地点，可以手动输入")}</li>
          )}
        </ul>
      )}
    </div>
  );
}
