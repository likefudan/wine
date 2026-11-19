import { lazy, useLocation, useRoute } from "preact-iso";
import { useState } from "preact/hooks";
import { DESCRIPTOR_BY_ID } from "../../shared/descriptors";
import { glassColor, tastingNote } from "../../shared/guide";
import { FriendsOnWine } from "../Friends";
import { BackIcon, BottleIcon, Glass, ShareIcon, WineName } from "../components";
import { DEPTH_INFO } from "../depths";
import { ProReviews } from "../Reviews";
import { currentLang, fmtDate, p, t } from "../i18n";
import { saveTasting, useStore } from "../store";
import { AddToCellarSheet, WineCellar } from "./Cellar";
import { openTasting } from "./ListPage";
import { useSelected } from "../selected";

/** Drawn only when someone taps 生成分享图: its own file, loaded then. */
const TastingShareSheet = lazy(() => import("../TastingCard").then((m) => m.TastingShareSheet));

/** One wine: every time I've tasted it, with the note each answer adds up to. */
export function WinePage(props: { id?: string }) {
  const routed = useRoute().params;
  // On the open book (book.tsx) the wine is named by whoever draws the page.
  const params = { id: props.id ?? routed?.id };
  const selected = useSelected();
  const { route } = useLocation();
  const v = useStore((s) => s.vintages.find((x) => x.id === params.id));
  const tastings = useStore((s) => s.tastings.filter((x) => x.vintageId === params.id));
  const others = useStore((s) =>
    v ? s.vintages.filter((x) => x.wineId && x.wineId === v.wineId && x.id !== v.id) : [],
  );
  const items = useStore((s) => s.items);
  const lists = useStore((s) => s.lists);
  const [sharing, setSharing] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  if (!v)
    return (
      <div class="page">
        <p class="empty">{t("找不到这款酒")}</p>
        <a href="/library">{t("回到酒册")}</a>
      </div>
    );
  const listOf = (itemId: string | null) => {
    const listId = itemId ? items.find((i) => i.id === itemId)?.listId : undefined;
    return listId ? lists.find((l) => l.id === listId) : undefined;
  };
  const sorted = [...tastings].sort((a, b) => b.tastedAt.localeCompare(a.tastedAt));
  return (
    <div class="page">
      <header class="page-head pin">
        <button type="button" class="icon-button" aria-label={t("返回")} onClick={() => history.back()}>
          <BackIcon />
        </button>
        <div class="page-head-title taste-wine">
          <Glass color={glassColor(v.color, sorted[0]?.appearance, v.year)} size={34} />
          <WineName v={v} />
        </div>
      </header>
      {v.place?.address && (
        <p class="small">
          <a
            class="place-link"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.producer)}&query_place_id=${encodeURIComponent(v.place.id)}`}
            target="_blank"
            rel="noreferrer"
          >
            {v.place.address}
          </a>
        </p>
      )}
      {others.length > 0 && (
        <p class="muted small">
          {t("这款酒你还喝过 {n} 个年份", { n: others.length })}:{" "}
          {others.map((o) => (
            <a key={o.id} href={`/wine/${o.id}`} class="year-link num">
              {o.year || "NV"}
            </a>
          ))}
        </p>
      )}
      <WineCellar vintageId={v.id} />
      <ul class="cards">
        {sorted.map((x) => {
          const l = listOf(x.listItemId);
          const note = tastingNote(
            currentLang(),
            v.color,
            x.appearance,
            x.nose,
            x.palate,
            x.descriptors.map((d) => d.id),
          );
          return (
            <li key={x.id} class={selected === x.id ? "card-with-action selected" : "card-with-action"}>
              <a class="card" href={`/taste/${x.id}`}>
                <div class="list-card-head">
                  <strong class="num big-score">{x.score ?? "—"}</strong>
                  <span class="muted small">
                    {fmtDate(x.tastedAt)} · {t(DEPTH_INFO[x.depth].name)}
                    {l ? ` · ${l.title}` : ""}
                    {x.buyAgain ? ` · ${t("还会买")}` : ""}
                    {x.cellarId ? ` · ${t("从酒窖开的")}` : ""}
                  </span>
                  {x.location && (x.location.name || x.location.address) && (
                    <span class="muted small">📍 {x.location.name || x.location.address}</span>
                  )}
                </div>
                {note ? (
                  <p class="small">{note}</p>
                ) : (
                  x.descriptors.length > 0 && (
                    <p class="small">
                      {x.descriptors
                        .map((d) => (DESCRIPTOR_BY_ID.get(d.id) ? p(DESCRIPTOR_BY_ID.get(d.id)!.name) : ""))
                        .join(" · ")}
                    </p>
                  )
                )}
                {x.note && <p class="quote">{x.note}</p>}
              </a>
              <button
                type="button"
                class="icon-button card-action"
                aria-label={t("分享这条笔记")}
                onClick={() => setSharing(x.id)}
              >
                <ShareIcon />
              </button>
              <button
                type="button"
                class="icon-button card-action second"
                aria-label={t("放进酒窖")}
                onClick={() => setBuying(x.id)}
              >
                <BottleIcon />
              </button>
            </li>
          );
        })}
      </ul>
      <FriendsOnWine vintageId={v.id} />
      <ProReviews
        key={v.id}
        v={v}
        tasted={tastings.some((x) => x.score !== null || x.descriptors.length > 0 || !!x.note)}
      />
      <button type="button" class="button primary block" onClick={() => openTasting(route, v.id, null)}>
        ＋ {t("再记一次")}
      </button>
      {buying && sorted.some((x) => x.id === buying) && (
        <AddToCellarSheet x={sorted.find((x) => x.id === buying)!} onClose={() => setBuying(null)} />
      )}
      {sharing && sorted.some((x) => x.id === sharing) && (
        <TastingShareSheet
          v={v}
          x={sorted.find((x) => x.id === sharing)!}
          onClose={() => setSharing(null)}
          onPhoto={(photoId) => {
            const x = sorted.find((x) => x.id === sharing);
            if (x) saveTasting({ ...x, photoId });
          }}
        />
      )}
    </div>
  );
}
