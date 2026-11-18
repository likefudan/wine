import { useLocation } from "preact-iso";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  REGION_NAMES,
  appellationOf,
  appellationsIn,
  areaNamed,
  areaOf,
  areasIn,
  countryOfRegion,
  tidyPlace,
} from "../../shared/place";
import { canonicalGrape } from "../../shared/grapes";
import { GrapePicker } from "../GrapePicker";
import { COLOR_WORDS } from "../../shared/guide";
import {
  COLORS,
  type LwinWine,
  type ProducerPlace,
  type VintageInfo,
  type WineColor,
  nameKey,
  yearLabel,
} from "../../shared/model";
import { ProducerInput } from "../ProducerInput";
import { SuggestInput } from "../SuggestInput";
import { BackIcon, CameraIcon, Choice, Field, Glass, WineName } from "../components";
import { p, t, tm } from "../i18n";
import { ApiError, addItem, addVintage, api, blankTasting, getState, saveTasting, useStore } from "../store";
import { glassColor } from "../../shared/guide";

/**
 * 确定一款酒 (docs/design.zh.md §3.1): type a few letters (my own wines first, then everyone's), or
 * photograph the label, or fill it in by hand. Then straight into the tasting.
 */

interface CatalogWine {
  wineId: string;
  producer: string;
  wine: string;
  color: WineColor;
  country: string | null;
  region: string | null;
  area: string | null;
  appellation: string | null;
  grapes: string[];
  vintages: { id: string; year: number; abv: number | null }[];
}

interface Draft {
  producer: string;
  wine: string;
  year: string;
  nv: boolean;
  color: WineColor | undefined;
  region: string;
  country: string;
  area: string;
  appellation: string;
  grapes: string[];
  abv: string;
  lwin?: number | null;
  place?: ProducerPlace | null;
}
const EMPTY: Draft = {
  producer: "",
  wine: "",
  year: "",
  nv: false,
  color: undefined,
  region: "",
  country: "",
  area: "",
  appellation: "",
  grapes: [],
  abv: "",
};

/** 国家 / 产区 / 大区 / 子产区 for the form, each at its own level (src/shared/place.ts). */
function placeDraft(p: {
  country: string | null;
  region: string | null;
  area?: string | null;
  appellation: string | null;
}) {
  const x = tidyPlace({ country: p.country, region: p.region, area: p.area ?? null, appellation: p.appellation });
  return { country: x.country ?? "", region: x.region ?? "", area: x.area ?? "", appellation: x.appellation ?? "" };
}

/** Shrinks a photo to 1600px on its long side, as a JPEG, base64 (about 300 KB). */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82).split(",")[1]!;
}

const matches = (v: VintageInfo, q: string) => {
  const hay = nameKey(`${v.producer} ${v.wine} ${yearLabel(v.year)} ${v.region ?? ""} ${v.appellation ?? ""}`);
  return q.split(" ").every((w) => hay.includes(w));
};

export function AddWine() {
  const { route, query } = useLocation();
  const lists = useStore((s) => s.lists);
  const mine = useStore((s) => s.vintages);
  const recent = [...lists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const fresh = recent[0] && Date.now() - Date.parse(recent[0].updatedAt) < 12 * 3600_000 ? recent[0].id : null;
  const [listId, setListId] = useState<string | null>(query.list ?? fresh);
  /** Came from a list's page (加下一款酒, or 记一杯 while on it): the wine belongs to that list. */
  const fixedList = query.list ? lists.find((l) => l.id === query.list) : undefined;
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<CatalogWine[]>([]);
  const [lwin, setLwin] = useState<LwinWine[]>([]);
  const [form, setForm] = useState<Draft | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const key = nameKey(q);

  useEffect(() => {
    if (key.length < 2 || !navigator.onLine) {
      setCatalog([]);
      setLwin([]);
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await api<{ wines: CatalogWine[]; lwin?: LwinWine[] }>(`/api/catalog?q=${encodeURIComponent(q)}`, {
          signal: ctl.signal,
        });
        setCatalog(r.wines);
        setLwin(r.lwin ?? []);
      } catch {
        // offline: my own wines still show
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [key]);

  const choose = (v: VintageInfo) => {
    const info = addVintage(v);
    const item = listId ? addItem(listId, info.id) : null;
    const x = blankTasting(info.id, item?.id ?? null, getState().me?.depth ?? "quick");
    saveTasting({ ...x, photoId });
    route(`/taste/${x.id}?new=1`, true);
  };

  const fromCatalog = (w: CatalogWine, year: number, id?: string) =>
    choose({
      id: id ?? undefined!,
      wineId: w.wineId,
      producer: w.producer,
      wine: w.wine,
      year,
      color: w.color,
      country: w.country,
      region: w.region,
      area: w.area,
      appellation: w.appellation,
      grapes: w.grapes,
      abv: w.vintages.find((v) => v.year === year)?.abv ?? null,
    });

  const scan = async (file: File | undefined) => {
    if (!file) return;
    setScanning(true);
    setScanError(null);
    try {
      const image = await shrink(file);
      const r = await api<{
        reading: {
          producer: string;
          wine: string;
          year: number | null;
          color: WineColor | null;
          country: string;
          region: string;
          appellation: string;
          grapes: string[];
          abv: number | null;
          confident: boolean;
        };
        photoId: string | null;
      }>("/api/label", { body: { image } });
      const rd = r.reading;
      setPhotoId(r.photoId);
      if (!rd.producer) {
        setScanError(t("没认出这是哪款酒，请换个角度重拍，或手动输入"));
        return;
      }
      setQ(`${rd.producer} ${rd.wine === rd.producer ? "" : rd.wine}`.trim());
      setForm({
        producer: rd.producer,
        wine: rd.wine,
        year: rd.year ? String(rd.year) : "",
        nv: !rd.year,
        color: rd.color ?? undefined,
        ...placeDraft(rd),
        grapes: rd.grapes.map(canonicalGrape),
        abv: rd.abv ? String(rd.abv) : "",
      });
      if (!rd.confident) setScanError(t("有些字看不清，请核对一下"));
    } catch (e) {
      setScanError(e instanceof ApiError ? tm(e.message) : t("没有网络，拍酒标需要联网。请先手动输入"));
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const local = key.length >= 1 ? mine.filter((v) => matches(v, key)).slice(0, 8) : [];
  const localIds = new Set(local.map((v) => v.id));
  const shownCatalog = catalog
    .map((w) => ({ ...w, vintages: w.vintages.filter((v) => !localIds.has(v.id)) }))
    .filter((w) => w.vintages.length > 0 || !local.some((v) => v.wineId === w.wineId));
  // LWIN wines that are not already above (same producer and name).
  const known = new Set([...local, ...catalog].map((w) => `${nameKey(w.producer, true)}|${nameKey(w.wine)}`));
  const shownLwin = lwin.filter((w) => !known.has(`${nameKey(w.producer, true)}|${nameKey(w.wine)}`));
  const fromLwin = (w: LwinWine) =>
    setForm({
      ...EMPTY,
      producer: w.producer,
      wine: w.wine === w.producer ? "" : w.wine,
      color: w.color ?? undefined,
      ...placeDraft(w),
      // TTB rows sit in the same list with negative ids; only a real LWIN code is kept on the wine.
      lwin: w.lwin > 0 ? w.lwin : null,
    });

  // At a winery the wines are usually its own: start the producer from the list's place.
  const fromListPlace = (): Draft => {
    const l = lists.find((x) => x.id === listId);
    const p = l?.kind === "winery" ? l.place : null;
    if (!p?.name) return EMPTY;
    return {
      ...EMPTY,
      producer: p.name,
      place: p.id && p.address ? { id: p.id, address: p.address, lat: p.lat, lng: p.lng } : null,
    };
  };

  return (
    <div class="page">
      <header class="page-head">
        <button type="button" class="icon-button" aria-label={t("返回")} onClick={() => history.back()}>
          <BackIcon />
        </button>
        <h1 class="page-head-title">{t("记一杯")}</h1>
      </header>

      {fixedList ? (
        // Opened from inside a list: the wine goes into that list, nothing to choose.
        <p class="add-to-list">
          {t("属于")} <strong>{fixedList.title}</strong>
        </p>
      ) : (
        lists.length > 0 && (
          <div class="field">
            <span class="field-label">{t("属于哪次品鉴")}</span>
            <div class="chips scroll">
              {recent.slice(0, 6).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  class={listId === l.id ? "chip on" : "chip"}
                  onClick={() => setListId(l.id)}
                >
                  {l.title}
                </button>
              ))}
              <button type="button" class={listId === null ? "chip on" : "chip"} onClick={() => setListId(null)}>
                {t("不属于任何品鉴")}
              </button>
            </div>
          </div>
        )
      )}

      {!form && (
        <>
          <div class="search-row">
            <input
              type="search"
              class="search"
              placeholder={t("酒庄或酒名，例如 Opus One")}
              value={q}
              onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            />
            <button type="button" class="button" onClick={() => fileRef.current?.click()} disabled={scanning}>
              <CameraIcon /> {scanning ? t("识别中…") : t("拍酒标")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => scan((e.target as HTMLInputElement).files?.[0])}
            />
          </div>
          {scanError && <p class="notice">{scanError}</p>}

          {local.length > 0 && (
            <section>
              <h2 class="section-title">{t("我喝过的")}</h2>
              <ul class="rows">
                {local.map((v) => (
                  <li key={v.id}>
                    <button type="button" class="row" onClick={() => choose(v)}>
                      <Glass color={glassColor(v.color, undefined, v.year)} />
                      <WineName v={v} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {shownCatalog.length > 0 && (
            <section>
              <h2 class="section-title">{t("大家记过的")}</h2>
              <ul class="rows">
                {shownCatalog.map((w) => (
                  <CatalogRow key={w.wineId} w={w} onPick={(year, id) => fromCatalog(w, year, id)} />
                ))}
              </ul>
            </section>
          )}
          {shownLwin.length > 0 && (
            <section>
              <h2 class="section-title">{t("酒款库")}</h2>
              <ul class="rows">
                {shownLwin.map((w) => (
                  <li key={w.lwin}>
                    <button type="button" class="row" onClick={() => fromLwin(w)}>
                      <Glass color={glassColor(w.color ?? "red", undefined, 0)} />
                      <span class="wine-name">
                        <span class="wine-producer">{w.producer}</span>
                        <span class="wine-title">{w.wine === w.producer ? "" : w.wine}</span>
                        <span class="wine-sub">
                          {[w.appellation ?? w.region, w.classification].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p class="muted small">
                {shownLwin.some((w) => w.lwin < 0)
                  ? t("酒款库来自 LWIN（Liv-ex）和美国 TTB 酒标库")
                  : t("酒款库来自 LWIN（Liv-ex）")}
              </p>
            </section>
          )}
          <button
            type="button"
            class="button block"
            onClick={() => setForm(q.trim() ? { ...EMPTY, producer: q.trim() } : fromListPlace())}
          >
            ＋ {q.trim() ? t("新酒：{q}", { q: q.trim() }) : t("手动添加一款酒")}
          </button>
        </>
      )}

      {form && <WineForm draft={form} scanError={scanError} onCancel={() => setForm(null)} onSave={(v) => choose(v)} />}
    </div>
  );
}

function CatalogRow(props: { w: CatalogWine; onPick: (year: number, id?: string) => void }) {
  const { w } = props;
  const [other, setOther] = useState("");
  const v0: VintageInfo = { ...w, id: "", year: w.vintages[0]?.year ?? 0, abv: null };
  return (
    <li class="catalog-row">
      <div class="row static">
        <Glass color={glassColor(w.color, undefined, v0.year)} />
        <span class="wine-name">
          <span class="wine-producer">{w.producer}</span>
          <span class="wine-title">{w.wine === w.producer ? "" : w.wine}</span>
        </span>
      </div>
      <div class="chips">
        {w.vintages.map((v) => (
          <button key={v.id} type="button" class="chip" onClick={() => props.onPick(v.year, v.id)}>
            {yearLabel(v.year)}
          </button>
        ))}
        <form
          class="chip-form"
          onSubmit={(e) => {
            e.preventDefault();
            const y = other.trim().toUpperCase() === "NV" ? 0 : Number(other);
            if (y === 0 || (y >= 1900 && y <= 2100)) props.onPick(y);
          }}
        >
          <input
            inputMode="numeric"
            placeholder={t("其他年份")}
            value={other}
            maxLength={4}
            onInput={(e) => setOther((e.target as HTMLInputElement).value)}
          />
          {other && (
            <button type="submit" class="chip on">
              OK
            </button>
          )}
        </form>
      </div>
    </li>
  );
}

function WineForm(props: {
  draft: Draft;
  scanError: string | null;
  onCancel: () => void;
  onSave: (v: VintageInfo) => void;
}) {
  const [d, setD] = useState<Draft>(props.draft);
  const set = (k: keyof Draft) => (e: Event) => setD({ ...d, [k]: (e.target as HTMLInputElement).value });
  // Each level fills the empty ones above it: Oakville gives Napa Valley, California and USA; Sonoma County
  // gives California and USA; California gives USA. A 大区 that came from the old 子产区 follows the new one.
  const setRegion = (region: string) => {
    setD((x) => ({ ...x, region, country: x.country || countryOfRegion(region) || "" }));
  };
  const setArea = (area: string) => {
    const known = areaNamed(area);
    setD((x) => ({
      ...x,
      area,
      region: x.region || known?.region || "",
      country: x.country || known?.country || countryOfRegion(known?.region) || "",
    }));
  };
  const setAppellation = (appellation: string) => {
    const known = appellationOf(appellation);
    setD((x) => ({
      ...x,
      appellation,
      area: !x.area || x.area === areaOf(x.appellation) ? (known?.area ?? "") : x.area,
      region: x.region || known?.region || "",
      country: x.country || known?.country || "",
    }));
  };
  const year = d.nv ? 0 : Number(d.year);
  const yearOk = d.nv || (Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() + 1);
  const ok = d.producer.trim() && d.color && yearOk;
  const submit = (e: Event) => {
    e.preventDefault();
    if (!ok) return;
    props.onSave({
      id: undefined!,
      wineId: "",
      producer: d.producer.trim(),
      wine: d.wine.trim() || d.producer.trim(),
      year,
      color: d.color!,
      country: d.country.trim() || null,
      region: d.region.trim() || null,
      area: d.area.trim() || null,
      appellation: d.appellation.trim() || null,
      grapes: d.grapes,
      abv: Number(d.abv) > 0 ? Number(d.abv) : null,
      lwin: d.lwin ?? null,
      place: d.place ?? null,
    });
  };
  return (
    <form class="form" onSubmit={submit}>
      {props.scanError && <p class="notice">{props.scanError}</p>}
      <ProducerInput
        value={d.producer}
        onInput={(producer) => setD((x) => ({ ...x, producer, place: null }))}
        onPlace={(pl) =>
          setD((x) => ({
            ...x,
            producer: pl.name || x.producer,
            country: x.country || pl.country || "",
            place: { id: pl.id, address: pl.address, lat: pl.lat, lng: pl.lng },
          }))
        }
      />
      {d.place?.address && <p class="field-hint place-address">{d.place.address}</p>}
      <Field label={t("酒名")} hint={t("没有单独的酒名就留空")}>
        <input value={d.wine} maxLength={160} onInput={set("wine")} placeholder="Monte Bello" />
      </Field>
      <div class="field-row">
        <Field label={t("年份")}>
          <input
            inputMode="numeric"
            value={d.nv ? "" : d.year}
            disabled={d.nv}
            maxLength={4}
            onInput={set("year")}
            placeholder="2019"
          />
        </Field>
        <label class="check">
          <input
            type="checkbox"
            checked={d.nv}
            onChange={(e) => setD({ ...d, nv: (e.target as HTMLInputElement).checked })}
          />
          {t("无年份 (NV)")}
        </label>
      </div>
      <Field label={t("类型")} group>
        <Choice
          label={t("类型")}
          value={d.color}
          options={COLORS.map((c) => ({ value: c, label: p(COLOR_WORDS[c]) }))}
          onChange={(v) => setD({ ...d, color: v })}
        />
      </Field>
      <Field label={t("葡萄品种")} hint={t("可多选，混酿就都点上")} group>
        <GrapePicker
          label={t("葡萄品种")}
          value={d.grapes}
          color={d.color}
          onChange={(grapes) => setD((x) => ({ ...x, grapes }))}
        />
      </Field>
      <div class="field-row">
        <Field label={t("国家")}>
          <input value={d.country} maxLength={60} onInput={set("country")} placeholder="USA" />
        </Field>
        <Field label={t("产区")}>
          <SuggestInput
            name="region"
            value={d.region}
            options={REGION_NAMES}
            onInput={setRegion}
            placeholder="California"
          />
        </Field>
      </div>
      {/* Suggestions narrow as the levels above are filled: California lists its 大区 and AVAs only. */}
      <div class="field-row top">
        <Field label={t("大区")} hint={t("选了子产区会自动填")}>
          <SuggestInput
            name="area"
            value={d.area}
            options={areasIn(d.region)}
            onInput={setArea}
            placeholder="Napa Valley"
          />
        </Field>
        <Field label={t("子产区")} hint={t("酒标上最小的产区")}>
          <SuggestInput
            name="appellation"
            value={d.appellation}
            options={appellationsIn(d.region, d.area)}
            onInput={setAppellation}
            placeholder="Oakville"
          />
        </Field>
      </div>
      <Field label={t("酒精度 %")}>
        <input inputMode="decimal" value={d.abv} maxLength={5} onInput={set("abv")} placeholder="14.5" />
      </Field>
      <button type="submit" class="button primary" disabled={!ok}>
        {t("开始品鉴")}
      </button>
      <button type="button" class="button" onClick={props.onCancel}>
        {t("返回搜索")}
      </button>
    </form>
  );
}
