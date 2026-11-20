/**
 * Going back, the same way on every page (Ke Li 2026-11-20: 返回 from a note went to another tab).
 * The app keeps its own copy of where it has been in this tab, since the browser does not say what
 * the entry behind the current one is. Each history entry carries its position in that list.
 *
 * - `goBack(fallback)`: to the page this one was opened from; opened directly (a link, a reload of
 *   the home-screen app), to `fallback` instead of out of the app.
 * - `goUp(target)`: to a given page, e.g. the 品鉴 a note belongs to. When that is the page behind,
 *   it is a real step back, so the page is not in the history twice and the next 返回 does not
 *   land on it again.
 */
const KEY = "nav";
let trail: string[] = [];
let at = 0;

const here = () => location.pathname + location.search;
const keep = () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    // Private mode: the trail lives as long as the page does.
  }
};

if (typeof history !== "undefined" && typeof location !== "undefined") {
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  const pathOf = (url?: string | URL | null) => {
    if (url == null) return here();
    const u = new URL(String(url), location.href);
    return u.pathname + u.search;
  };
  history.pushState = (_state, unused, url) => {
    at += 1;
    trail.length = at;
    trail[at] = pathOf(url);
    keep();
    push({ i: at }, unused, url);
  };
  history.replaceState = (_state, unused, url) => {
    trail[at] = pathOf(url);
    keep();
    replace({ i: at }, unused, url);
  };
  const i = (history.state as { i?: unknown } | null)?.i;
  if (typeof i === "number") {
    // A reload, or back from a page outside the app (Google sign-in): the trail is still there.
    try {
      trail = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as string[];
    } catch {
      trail = [];
    }
    at = i;
    trail[at] = here();
  } else {
    trail = [here()];
    at = 0;
    replace({ i: 0 }, "", location.href);
    keep();
  }
  addEventListener("popstate", (e) => {
    const p = (e.state as { i?: unknown } | null)?.i;
    at = typeof p === "number" ? p : 0;
    trail[at] = here();
  });
}

/** The page behind this one, if the app opened this one from it. */
const behind = (): string | null => (at > 0 ? (trail[at - 1] ?? null) : null);

type Route = (url: string, replace?: boolean) => void;

export function goBack(route: Route, fallback: string) {
  if (behind() !== null) history.back();
  else route(fallback, true);
}

export function goUp(route: Route, target: string) {
  const b = behind();
  // "/library?view=cellar" and "/library" are the same page.
  if (b !== null && b.split("?")[0] === target.split("?")[0]) history.back();
  else route(target, true);
}
