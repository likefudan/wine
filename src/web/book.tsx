import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { isBlindId } from "../shared/blind";
import { Logo } from "./Logo";
import { t } from "./i18n";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { ListPage } from "./pages/ListPage";
import { MePage } from "./pages/Me";
import { WinePage } from "./pages/WinePage";
import { Selected } from "./selected";
import { getState, useStore } from "./store";

/**
 * The open diary (Ke Li 2026-11-19): on a screen wide enough for two pages (an unfolded iPhone Duo,
 * a phone turned sideways, a tablet, a computer) the app is a book lying open. The left page keeps
 * the list one picks from, the right page shows what was picked, and the fold between them is the
 * book's spine. Keep the query in step with the same one in styles.css.
 */
export const WIDE_QUERY = "(min-width: 800px)";

export function useWide(): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(WIDE_QUERY);
    const change = () => setOn(m.matches);
    change();
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  return on;
}

/** The 品鉴 opened last: the one with the newest date. */
export function latestListId(): string | null {
  const lists = getState().lists;
  if (!lists.length) return null;
  return [...lists].sort((a, b) => (b.startsOn ?? b.createdAt).localeCompare(a.startsOn ?? a.createdAt))[0]!.id;
}

/** The wine tasted last. */
export function latestWineId(): string | null {
  const s = getState();
  const known = new Set(s.vintages.map((v) => v.id));
  const last = s.tastings
    .filter((x) => known.has(x.vintageId) && !isBlindId(x.vintageId))
    .reduce<{ vintageId: string; tastedAt: string } | null>((a, b) => (a && a.tastedAt > b.tastedAt ? a : b), null);
  return last?.vintageId ?? s.cellar.find((l) => known.has(l.vintageId))?.vintageId ?? null;
}

/** What the left page shows for an address, and which of its entries is the one open on the right. */
export function leftPage(
  path: string,
  query: Record<string, string>,
): { page: ComponentChildren; selected: string | null } {
  const s = getState();
  const id = path.split("/")[2] ?? "";
  const listPage = (listId: string, selected: string | null) => ({
    page: <ListPage key={`l${listId}`} id={listId} />,
    selected,
  });
  if (path.startsWith("/taste/")) {
    const x = s.tastings.find((n) => n.id === id);
    const item = x?.listItemId ? s.items.find((i) => i.id === x.listItemId) : undefined;
    // A glass in a 品鉴: the other glasses stay at hand. A note by itself: the wine's earlier notes.
    if (item) return listPage(item.listId, item.id);
    if (x && !isBlindId(x.vintageId))
      return { page: <WinePage key={`w${x.vintageId}`} id={x.vintageId} />, selected: x.id };
    return { page: <Home />, selected: null };
  }
  if (path.startsWith("/answers/")) return listPage(id, null);
  if ((path === "/add" || path === "/blind") && query.list) return listPage(query.list, null);
  if (path.startsWith("/library")) return { page: <Library />, selected: latestWineId() };
  if (path.startsWith("/wine/")) return { page: <Library />, selected: id };
  if (path.startsWith("/cellar")) return { page: <Library />, selected: id || null };
  if (path.startsWith("/me")) return { page: <MePage part="index" />, selected: null };
  if (path.startsWith("/lists/")) return { page: <Home />, selected: id };
  if (path === "/") return { page: <Home />, selected: latestListId() };
  return { page: <Home />, selected: null };
}

export function LeftPage(props: { path: string; query: Record<string, string> }) {
  // Redrawn when notes, lists or wines change, since what it shows depends on them.
  useStore((s) => s.tastings);
  useStore((s) => s.lists);
  const { page, selected } = leftPage(props.path, props.query);
  const box = useRef<HTMLDivElement>(null);
  // The marked entry is brought into view, e.g. the glass being noted far down a long 品鉴.
  useEffect(() => {
    box.current?.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <div class="main full" ref={box}>
      <Selected.Provider value={selected}>{page}</Selected.Provider>
    </div>
  );
}

/** The right page of 品鉴 before anything is picked: the newest 品鉴, like a diary opened at its last entry. */
export function HomeRight() {
  useStore((s) => s.lists);
  const id = latestListId();
  return id ? <ListPage key={id} id={id} /> : <BlankPage text={t("新建一次品鉴，它的酒会写在这一页。")} />;
}

/** The right page of 酒库 before anything is picked: the wine tasted last. */
export function LibraryRight() {
  useStore((s) => s.tastings);
  const id = latestWineId();
  return id ? <WinePage key={id} id={id} /> : <BlankPage text={t("点左边的一款酒，这一页翻开它的每一次记录。")} />;
}

function BlankPage(props: { text: string }) {
  return (
    <div class="page blank-page">
      <Logo size={72} />
      <p>{props.text}</p>
    </div>
  );
}

/** Which sewing to draw while choosing one (?spine=a|b|c). */
const SEWING = new URLSearchParams(location.search).get("spine") ?? "a";

/**
 * The fold: the shadow where the two pages dip into the binding, the thread it is sewn with, and a
 * ribbon marker. The thread is drawn by hand, one stretch of it repeated down the fold.
 */
export function Spine() {
  return (
    <div class="spine" aria-hidden="true">
      <svg class={`spine-thread sew-${SEWING}`} width="40" height="100%" role="presentation">
        <defs>
          {SEWING === "a" && (
            // Hand sewing: stitches of uneven length, each a little off the line, between needle holes.
            <pattern id="sew" width="40" height="150" patternUnits="userSpaceOnUse">
              <g class="holes">
                <circle cx="17.6" cy="6" r="1.3" />
                <circle cx="22.6" cy="30" r="1.3" />
                <circle cx="17.2" cy="43" r="1.3" />
                <circle cx="22.9" cy="71" r="1.3" />
                <circle cx="17.8" cy="83" r="1.3" />
                <circle cx="22.3" cy="104" r="1.3" />
                <circle cx="17.4" cy="117" r="1.3" />
                <circle cx="22.7" cy="142" r="1.3" />
              </g>
              <g class="thread">
                <path d="M17.6 6 C20.6 12 19.2 23 22.6 30" />
                <path d="M17.2 43 C19 52 21.4 61 22.9 71" />
                <path d="M17.8 83 C20.8 88 19.6 98 22.3 104" />
                <path d="M17.4 117 C18.8 126 21.6 133 22.7 142" />
              </g>
            </pattern>
          )}
          {SEWING === "b" && (
            // Herringbone, as on an exposed-spine binding: pairs of stitches meeting on the fold.
            <pattern id="sew" width="40" height="66" patternUnits="userSpaceOnUse">
              <g class="holes">
                <circle cx="12.5" cy="4" r="1.2" />
                <circle cx="27.8" cy="5" r="1.2" />
                <circle cx="12" cy="26.5" r="1.2" />
                <circle cx="27.5" cy="26" r="1.2" />
                <circle cx="12.8" cy="48" r="1.2" />
                <circle cx="28" cy="48.5" r="1.2" />
              </g>
              <g class="thread">
                <path d="M12.5 4 Q16 11 20 15.5 Q24.5 11 27.8 5" />
                <path d="M12 26.5 Q16.5 32 20.2 37.5 Q24 32.5 27.5 26" />
                <path d="M12.8 48 Q16 54.5 19.8 59.5 Q24.5 54 28 48.5" />
                <path d="M20 15.5 C19.4 20 20.6 22 20.2 26" class="fine" />
                <path d="M20.2 37.5 C20.8 42 19.4 44 19.8 48" class="fine" />
                <path d="M19.8 59.5 C19.4 62 20.2 64 20 66 M20 0 C20.3 2 19.8 3 20 4" class="fine" />
              </g>
            </pattern>
          )}
          {SEWING === "c" && (
            // A vine: the thread wanders down the fold like a tendril, with a curl and a leaf now and then.
            <pattern id="sew" width="40" height="240" patternUnits="userSpaceOnUse">
              <g class="thread">
                <path d="M20 0 C29 14 11 36 20 56 C28 74 12 92 20 112 C29 132 10 150 20 172 C27 190 13 208 20 224 C22 230 19 236 20 240" />
                <path
                  d="M24 24 c6 -4 11 0 9.4 4.4 c-1.4 3.6 -6.2 2.6 -5.4 -0.8 c0.4 -1.6 2.4 -1.8 2.8 -0.6"
                  class="fine"
                />
                <path
                  d="M15.6 138 c-6 -3 -10.6 1.4 -8.8 5.4 c1.5 3.3 6 2.2 5.2 -1 c-0.4 -1.5 -2.2 -1.7 -2.7 -0.5"
                  class="fine"
                />
                <path d="M23 200 c4.6 -4.6 9.6 -2.6 9.4 1.4 c-0.2 3.2 -4.4 3.4 -4.6 0.5" class="fine" />
              </g>
              <g class="leaves">
                <path d="M16.2 84 c-3 -7 -9.4 -8.4 -13 -5 c2.4 5.6 8.4 7.6 13 5 z" />
                <path d="M23.6 164 c3.4 -6.6 9.8 -7.6 13 -4 c-2.6 5.2 -8.6 6.8 -13 4 z" />
              </g>
            </pattern>
          )}
        </defs>
        <rect width="40" height="100%" fill="url(#sew)" />
      </svg>
      <span class="spine-ribbon" />
    </div>
  );
}

/** The right page of 我的: the section picked in the left page's list. */
export const MeRight = () => <MePage part="panels" />;
