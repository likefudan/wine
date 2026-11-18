import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Tri } from "../shared/descriptors";
import { type Lang, isLang } from "../shared/model";
import { MESSAGES } from "./messages";

/**
 * 简体 / 繁體 / English, the badminton site's way (lang.ts / i18n.ts / messages.ts there): the code
 * is written in Simplified Chinese and that text is its own key; t("酒单") looks up the other two in
 * messages.ts. Unlike the badminton site, a phone set to English starts in English (docs/design.zh.md
 * §3.8), and the choice is kept on the account too.
 */

export const LANG_NAMES: { id: Lang; name: string }[] = [
  { id: "zh-CN", name: "简体中文" },
  { id: "zh-TW", name: "繁體中文" },
  { id: "en", name: "English" },
];
const KEY = "lang";

export function detectLang(): Lang {
  const first = (navigator.languages?.[0] ?? navigator.language ?? "").toLowerCase();
  if (/^zh-(hant|tw|hk|mo)/.test(first)) return "zh-TW";
  if (first.startsWith("zh")) return "zh-CN";
  return "en";
}

function saved(): Lang | null {
  try {
    const s = localStorage.getItem(KEY);
    return isLang(s) ? s : null;
  } catch {
    return null;
  }
}

let lang: Lang = saved() ?? detectLang();
const listeners = new Set<(l: Lang) => void>();
document.documentElement.lang = lang;

export const currentLang = () => lang;
export const hasSavedLang = () => saved() !== null;

export function setLang(l: Lang, save = true) {
  lang = l;
  document.documentElement.lang = l;
  if (save)
    try {
      localStorage.setItem(KEY, l);
    } catch {
      // private mode: holds for this visit
    }
  for (const f of listeners) f(l);
}

export function useLang(): Lang {
  const [l, setL] = useState(lang);
  useEffect(() => {
    listeners.add(setL);
    setL(lang);
    return () => void listeners.delete(setL);
  }, []);
  return l;
}

function lookup(zh: string): string {
  if (lang === "zh-CN") return zh;
  const m = MESSAGES[zh];
  if (!m) return zh;
  return lang === "en" ? m.en : m.tw;
}

/** The text in the current language, with {name} placeholders filled in. */
export function t(zh: string, vars?: Record<string, string | number>): string {
  const s = lookup(zh);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Like t(), for placeholders that are elements. */
export function tx(zh: string, vars: Record<string, ComponentChildren>): ComponentChildren[] {
  return lookup(zh)
    .split(/(\{\w+\})/)
    .map((part) => {
      const k = /^\{(\w+)\}$/.exec(part)?.[1];
      return k && k in vars ? vars[k] : part;
    });
}

/** Marks text kept in a table and translated where it is shown, with t(). */
export const tk = (zh: string) => zh;

/** A server message (always Simplified Chinese), translated when we know it. */
export const tm = (message: string) => (MESSAGES[message] ? t(message) : message);

/** Content written for each language (descriptors, guide questions). */
export const p = (tri: Tri) => (lang === "en" ? tri.en : lang === "zh-TW" ? tri.tw : tri.zh);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 2026年11月17日 / Nov 17, 2026 for a date or an instant (local time). */
export function fmtDate(value: string, withYear = true): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  const y = d.getFullYear(),
    m = d.getMonth() + 1,
    day = d.getDate();
  const showYear = withYear || y !== new Date().getFullYear();
  if (lang === "en") return `${MONTHS[m - 1]} ${day}${showYear ? `, ${y}` : ""}`;
  return `${showYear ? `${y}年` : ""}${m}月${day}日`;
}
