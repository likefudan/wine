import { useEffect } from "preact/hooks";

/**
 * A new page opens at its top; going back returns to where that page was left. The browser does
 * neither by itself here: one document's scroll position carries over from page to page.
 */
const positions = new Map<string, number>();
let back = false;
let current = "";

addEventListener("popstate", () => {
  back = true;
});
addEventListener(
  "scroll",
  () => {
    if (current) positions.set(current, scrollY);
  },
  { passive: true },
);
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

export function useScrollReset(path: string) {
  useEffect(() => {
    const key = location.pathname + location.search;
    const to = back ? (positions.get(key) ?? 0) : 0;
    back = false;
    // Until this page has drawn, the old position must not be saved under the new address.
    current = "";
    scrollTo(0, to);
    const frame = requestAnimationFrame(() => {
      scrollTo(0, to);
      current = key;
    });
    return () => cancelAnimationFrame(frame);
  }, [path]);
}
