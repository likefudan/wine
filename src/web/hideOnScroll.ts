import { useEffect, useState } from "preact/hooks";

/**
 * The floating tab bar slides away while the page is scrolled up (reading further down) and comes
 * back as soon as it is scrolled down again, like the YouTube app. It is always shown at the very
 * top, and again on every new page (`key` changes).
 */
const MOVE = 8; // px of scrolling in one direction before it reacts, so a tiny jiggle does nothing
const TOP = 40; // px from the top where it always stays

export function useHideOnScroll(key: string): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    let last = Math.max(0, scrollY);
    let ticking = false;
    const check = () => {
      ticking = false;
      // iOS rubber-banding gives negative values at the top and overshoots at the bottom.
      const max = document.documentElement.scrollHeight - innerHeight;
      const y = Math.min(Math.max(0, scrollY), Math.max(0, max));
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
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [key]);
  return hidden;
}
