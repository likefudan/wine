import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "./i18n";
import { flush } from "./store";

/**
 * 下拉刷新 for the app opened from the home screen: iOS (and Android) give a standalone web app no
 * pull-to-refresh of their own, so a pull from the top of a page does it here. In a browser tab
 * the browser's own pull-to-refresh is left alone.
 *
 * A refresh sends what is waiting and fetches my copy (flush), then looks for a new release and
 * reloads into it. Only a mostly-vertical pull that starts at the very top counts: a sideways
 * swipe (aroma rows), a touch on the tab bar, a form field or a sheet is never taken over.
 */
const TRIGGER = 64; // px of finger travel (after resistance) that starts a refresh
const MAX = 96;
const IGNORE = "input, textarea, select, .tabbar, .dock, .sheet, .modal, [role='dialog'], [data-no-pull]";

export function isStandalone(): boolean {
  return (
    (navigator as { standalone?: boolean }).standalone === true ||
    (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches)
  );
}

/** The main script the page in hand was built with, e.g. /assets/index-AbC123.js. */
function scriptOf(html: string | Document): string | null {
  const doc = typeof html === "string" ? new DOMParser().parseFromString(html, "text/html") : html;
  const src = doc.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src");
  return src ? new URL(src, location.origin).pathname : null;
}

/** True when the server has a newer release than the one running (its page names another script). */
export async function newReleaseOut(): Promise<boolean> {
  const mine = scriptOf(document);
  if (!mine) return false;
  // Not a navigation, so the service worker passes it straight to the network.
  const res = await fetch("/", { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) return false;
  const theirs = scriptOf(await res.text());
  return !!theirs && theirs !== mine;
}

export async function refresh(): Promise<"reload" | "done"> {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  void reg?.update().catch(() => {});
  if (navigator.onLine !== false) {
    // Upload first: a reload must not lose a note still waiting to go up.
    await flush();
    try {
      if (await newReleaseOut()) return "reload";
    } catch {
      // no network: what is on screen stays
    }
  }
  return "done";
}

export function PullRefresh({ enabled }: { enabled: boolean }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isStandalone()) return;
    // No rubber-band bounce of the whole page under the pull (iOS 16+).
    document.documentElement.classList.add("standalone");
    let startX = 0;
    let startY = 0;
    let mode: "idle" | "deciding" | "pull" | "off" = "idle";
    let dist = 0;

    const atTop = () => (document.scrollingElement?.scrollTop ?? scrollY) <= 0;
    const start = (e: TouchEvent) => {
      mode = "off";
      if (busyRef.current || e.touches.length !== 1 || !atTop()) return;
      const el = e.target as Element | null;
      if (el?.closest?.(IGNORE)) return;
      startX = e.touches[0]!.clientX;
      startY = e.touches[0]!.clientY;
      dist = 0;
      mode = "deciding";
    };
    const move = (e: TouchEvent) => {
      if (mode === "off" || mode === "idle") return;
      if (e.touches.length !== 1) return end();
      const dx = e.touches[0]!.clientX - startX;
      const dy = e.touches[0]!.clientY - startY;
      if (mode === "deciding") {
        if (dx === 0 && dy === 0) return;
        // Decided on the first move: iOS lets only that one be cancelled before it scrolls.
        // Sideways (aroma rows) or upwards (an ordinary scroll): not a pull, for the whole touch.
        if (dy <= 0 || Math.abs(dx) >= dy || !atTop()) {
          mode = "off";
          return;
        }
        mode = "pull";
      }
      const d = e.touches[0]!.clientY - startY;
      if (d <= 0) {
        dist = 0;
        setPull(0);
        return;
      }
      // The page itself must not bounce or scroll under the finger while pulling.
      if (e.cancelable) e.preventDefault();
      dist = Math.min(MAX, d * 0.5);
      setPull(dist);
    };
    const end = () => {
      const was = mode;
      mode = "off";
      if (was !== "pull") return;
      if (dist < TRIGGER) {
        setPull(0);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setPull(TRIGGER);
      const shown = new Promise((r) => setTimeout(r, 500));
      void refresh()
        .then(async (r) => {
          await shown;
          if (r === "reload") location.reload();
        })
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
          setPull(0);
        });
    };

    addEventListener("touchstart", start, { passive: true });
    addEventListener("touchmove", move, { passive: false });
    addEventListener("touchend", end);
    addEventListener("touchcancel", end);
    return () => {
      removeEventListener("touchstart", start);
      removeEventListener("touchmove", move);
      removeEventListener("touchend", end);
      removeEventListener("touchcancel", end);
      mode = "off";
      setPull(0);
    };
  }, [enabled]);

  if (!pull && !busy) return null;
  const ready = busy || pull >= TRIGGER;
  return (
    <div
      class={busy ? "ptr busy" : "ptr"}
      style={{ transform: `translate(-50%, ${pull}px)`, opacity: Math.min(1, pull / TRIGGER) }}
      role="status"
      aria-label={busy ? t("正在刷新") : ready ? t("松开刷新") : t("下拉刷新")}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
        style={busy ? undefined : { transform: `rotate(${(pull / TRIGGER) * 270}deg)` }}
      >
        <path
          d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  );
}
