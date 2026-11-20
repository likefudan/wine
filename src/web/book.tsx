import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { isBlindId } from "../shared/blind";
import { isLegalPath } from "./LegalLinks";
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
  if (path.startsWith("/me") || isLegalPath(path)) return { page: <MePage part="index" />, selected: null };
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

/**
 * The fold: the shadow where the two pages dip into the binding, a ribbon marker, and in place of a
 * straight sewing thread a vine (Ke Li 2026-11-19 picked it over two stitch patterns): it wanders
 * down the fold with a leaf, a tendril or a small bunch of grapes now and then. One stretch of it
 * is drawn and repeated.
 */
export function Spine() {
  return (
    <div class="spine" aria-hidden="true">
      <svg class="spine-vine" width="44" height="100%" role="presentation">
        <defs>
          <pattern id="vine" width="44" height="280" patternUnits="userSpaceOnUse">
            <g class="stem">
              <path d="M22 0 C30 16 13 40 22 62 C30 82 14 100 22 124 C31 148 12 168 22 192 C29 210 15 232 22 252 C26 262 17 268 22 280" />
              {/* leaf stalks, the grapes' stalk, tendrils */}
              <path d="M22 62 q-3 -0.6 -5 -3 M22 192 q3 -0.6 5 -3 M24 145 q3.6 0.6 6 4" class="fine" />
              <path d="M22 124 c5 -2.4 10.4 -1 11.2 3 c0.8 4 -4.2 5.8 -6 2.8 c-1 -1.8 0.8 -3.8 2.8 -2.8" class="fine" />
              <path
                d="M22 252 c-5 -3 -10 -1 -10.6 3 c-0.4 3.6 4 5 5.6 2.4 c0.9 -1.6 -0.6 -3.2 -2.2 -2.4"
                class="fine"
              />
              <path d="M25.6 22 c4 -3.6 8.6 -2 8.4 1.6 c-0.2 2.8 -3.8 3.2 -4.2 0.6" class="fine" />
            </g>
            <g class="leaf">
              <path d="M17 59 C15.4 52 9.6 48.6 4.6 49.6 C5.4 55.4 10.6 60.4 17 59 Z" />
              <path d="M27 189 C28.6 182 34.4 178.6 39.4 179.6 C38.6 185.4 33.4 190.4 27 189 Z" />
            </g>
            <g class="vein">
              <path d="M16.4 58.4 L7 51.4 M27.6 188.4 L37 181.4" />
            </g>
            <g class="grapes">
              <circle cx="28.6" cy="151.4" r="1.8" />
              <circle cx="32.2" cy="151" r="1.8" />
              <circle cx="35.6" cy="152" r="1.7" />
              <circle cx="30.4" cy="154.6" r="1.8" />
              <circle cx="33.8" cy="154.8" r="1.8" />
              <circle cx="32" cy="158.2" r="1.7" />
            </g>
          </pattern>
        </defs>
        <rect width="44" height="100%" fill="url(#vine)" />
      </svg>
      <span class="spine-ribbon" />
    </div>
  );
}

/** The right page of 我的: the section picked in the left page's list. */
export const MeRight = () => <MePage part="panels" />;

/**
 * The pages whose right-hand side differs on the open book. They ask for the width themselves: the
 * router keeps what it drew until the address changes, so a phone turned on its side while a page
 * is open would otherwise keep the upright page on the right (Ke Li 2026-11-19: 品鉴 showed twice).
 */
export const HomeRoute = () => (useWide() ? <HomeRight /> : <Home />);
export const LibraryRoute = () => (useWide() ? <LibraryRight /> : <Library />);
export const MeRoute = () => (useWide() ? <MeRight /> : <MePage />);
