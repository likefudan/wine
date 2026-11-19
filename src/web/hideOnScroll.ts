import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";

/**
 * The floating tab bar slides away while the page is scrolled up (reading further down) and comes
 * back as soon as it is scrolled down again, like the YouTube app. It is always shown at the very
 * top, and again on every new page (`key` changes). `pane`: the element that scrolls instead of the
 * window (the open book's left page, book.tsx).
 */
const MOVE = 8; // px of scrolling in one direction before it reacts, so a tiny jiggle does nothing
const TOP = 40; // px from the top where it always stays

export function useHideOnScroll(key: string, pane?: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    const el = pane?.current;
    const top = () => (el ? el.scrollTop : scrollY);
    let last = Math.max(0, top());
    let ticking = false;
    const check = () => {
      ticking = false;
      // iOS rubber-banding gives negative values at the top and overshoots at the bottom.
      const max = el ? el.scrollHeight - el.clientHeight : document.documentElement.scrollHeight - innerHeight;
      const y = Math.min(Math.max(0, top()), Math.max(0, max));
      if (y <= TOP) {
        setHidden(false);
        last = y;
        return;
      }
      if (y > last + MOVE) {
        setHidden(true);
        last = y;
      } else if (y < last - MOVE) {
        setHidden(false);
        last = y;
      }
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(check);
      }
    };
    const target: EventTarget = el ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [key, !pane]);
  return hidden;
}
