import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";

/**
 * The floating tab bar slides away while the page is scrolled up (reading further down) and comes
 * back as soon as it is scrolled down again, like the YouTube app. It is always shown at the very
 * top, and again on every new page (`key` changes). `pane`: the element that scrolls instead of the
 * window (the open book's left page, book.tsx).
 */
/**
 * It only slides away for scrolling the reader does. The app scrolls too (the open book brings the
 * marked entry into view, the browser keeps its place when what is above grows), and a bar that hid
 * for that could stay hidden on a page too short to scroll back up. So hiding needs a moving finger, a
 * wheel or a scrolling key shortly before; showing never does.
 */
const RECENT = 1500; // ms after the last drag, wheel turn or scrolling key that scrolling still counts as the reader's
const KEYS = new Set([" ", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "End", "Home"]);
let inputAt = Number.NEGATIVE_INFINITY;
let held = false; // the mouse button is down (dragging the page's scrollbar)
if (typeof addEventListener === "function") {
  const input = () => {
    inputAt = performance.now();
  };
  const opts = { passive: true, capture: true };
  // A tap is not scrolling (and tapping a tab is just when the app scrolls by itself), so neither
  // touchstart nor a click counts: only a finger that moves.
  addEventListener("wheel", input, opts);
  addEventListener("touchmove", input, opts);
  addEventListener("keydown", (e) => KEYS.has(e.key) && input(), opts);
  const hold = (down: boolean) => {
    held = down;
  };
  addEventListener("pointerdown", (e) => hold(e.pointerType === "mouse"), opts);
  addEventListener("pointerup", () => hold(false), opts);
  addEventListener("pointercancel", () => hold(false), opts);
}
const byReader = () => held || performance.now() - inputAt < RECENT;

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
        if (byReader()) setHidden(true);
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
