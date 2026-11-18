import { useEffect, useState } from "preact/hooks";
import { type AlertKind, type CellarAlert, cellarAlerts } from "../shared/cellar";
import { t } from "./i18n";
import { getState, useStore } from "./store";

/**
 * 适饮期提醒 (docs/design.zh.md §6): a bottle entering its window this year, in its last year, or past
 * it. Shown as a dot on the 酒窖 tab and a line on the home page until I open the 酒窖; the next change
 * (next year's last call) shows again. Worked out on the phone, so it needs no signal.
 */

const KEY = "wine.cellarSeen";
const listeners = new Set<() => void>();

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Opening the 酒窖 page: everything due now has been seen. */
export function markCellarSeen() {
  const s = getState();
  const keys = cellarAlerts(s.cellar, s.proWindows, s.tastings).map((a) => a.key);
  const old = seen();
  if (keys.every((k) => old.has(k))) return;
  try {
    // Only keys still due are kept, so the list stays small.
    localStorage.setItem(KEY, JSON.stringify(keys));
  } catch {
    // private mode: the dot comes back next visit
  }
  for (const f of listeners) f();
}

/** The alerts not yet seen. */
export function useCellarAlerts(): CellarAlert[] {
  const lots = useStore((s) => s.cellar);
  const pro = useStore((s) => s.proWindows);
  const tastings = useStore((s) => s.tastings);
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  const old = seen();
  return cellarAlerts(lots, pro, tastings).filter((a) => !old.has(a.key));
}

/** The home page's line: "酒窖提醒：2 瓶今年进入适饮期，1 瓶已过适饮期". */
export function CellarAlertCard() {
  const alerts = useCellarAlerts();
  if (!alerts.length) return null;
  const n = (k: AlertKind) => alerts.filter((a) => a.kind === k).reduce((x, a) => x + a.lot.qty, 0);
  const parts = [
    n("entering") ? t("{n} 瓶今年进入适饮期", { n: n("entering") }) : null,
    n("last") ? t("{n} 瓶今年是适饮期最后一年", { n: n("last") }) : null,
    n("past") ? t("{n} 瓶已过适饮期", { n: n("past") }) : null,
  ].filter(Boolean);
  return (
    <a href="/library?view=cellar" class="notice cellar-alert">
      <strong>{t("酒窖提醒")}</strong> {parts.join(t("，"))}
      <span class="cellar-alert-go" aria-hidden="true">
        ›
      </span>
    </a>
  );
}
