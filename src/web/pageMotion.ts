import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/**
 * Pages do not just snap into place: one opened from another glides in from the right, going back
 * brings the earlier one in from the left, and switching tabs is a short fade. Only the arriving
 * page moves (the one before it is already gone), and only a little, so it reads as a hint of
 * direction rather than a show.
 */
export type Motion = "forward" | "back" | "fade" | "none";

const TABS = new Set(["/", "/library", "/me"]);
const DEEP = ["/taste", "/add", "/blind", "/cellar/add", "/cellar/new"];

/** How far in a page is: a tab's own page 0, something opened from it 1, the full-screen forms 2. */
export function depthOf(path: string): number {
  if (TABS.has(path)) return 0;
  return DEEP.some((p) => path === p || path.startsWith(`${p}/`)) ? 2 : 1;
}

/** `popped`: the browser's history moved (back or forward) rather than a link being followed. */
export function motionFor(from: string, to: string, popped: boolean): Motion {
  if (from === to) return "none";
  // A new bottle saved: the same page under its new address.
  if (from === "/cellar/new" && to.startsWith("/cellar/")) return "none";
  const a = depthOf(from);
  const b = depthOf(to);
  if (popped) return b > a ? "forward" : "back";
  if (b === 0) return "fade";
  return b < a ? "back" : "forward";
}

// Going back by swiping from the screen's edge (iPhone) is already animated by the phone itself, and
// a second glide after it looks like a stutter. A swipe cannot be told from the browser's own back
// button, but both differ from our 返回 buttons: those are a tap just before the history moves.
const TAP = 700; // ms
let tapAt = Number.NEGATIVE_INFINITY;
let popped = false;
let poppedByTap = false;
if (typeof document !== "undefined") {
  addEventListener(
    "click",
    () => {
      tapAt = performance.now();
    },
    { capture: true, passive: true },
  );
  // Capture: before the router hears of it and draws the page.
  addEventListener(
    "popstate",
    () => {
      popped = true;
      poppedByTap = performance.now() - tapAt < TAP;
    },
    { capture: true },
  );
}

const SHIFT = 22; // px
const EASE = "cubic-bezier(0.22, 0.8, 0.3, 1)";

let running: Animation | null = null;

function play(el: HTMLElement, motion: Motion, book: boolean) {
  // A page left before it had finished arriving: the next one starts afresh.
  running?.cancel();
  running = null;
  if (motion === "none" || typeof el.animate !== "function") return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The open book's page stays put on the paper, and so does everything for those who asked for less motion: a fade only.
  if (calm || book || motion === "fade") {
    running = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: calm ? 120 : 200, easing: "ease-out" });
    return;
  }
  const x = motion === "forward" ? SHIFT : -SHIFT;
  // Nothing is left on the page afterwards: a transform that stayed would take `position: fixed`
  // sheets with it.
  running = el.animate(
    [
      { opacity: 0, transform: `translateX(${x}px)` },
      { opacity: 1, transform: "none" },
    ],
    { duration: 260, easing: EASE },
  );
}

/** Animates `el` each time `path` changes while `on` (signed in and drawn). */
export function usePageMotion(path: string, el: RefObject<HTMLElement | null>, on: boolean, book: boolean) {
  const prev = useRef<string | null>(null);
  useLayoutEffect(() => {
    const from = prev.current;
    const wasPopped = popped;
    const byTap = poppedByTap;
    popped = false;
    poppedByTap = false;
    prev.current = on ? path : null;
    if (!on || from === null || !el.current) return;
    play(el.current, wasPopped && !byTap ? "none" : motionFor(from, path, wasPopped), book);
  }, [path, on]);
}
