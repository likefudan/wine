import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Lang } from "../shared/model";
import { LANG_NAMES, setLang, useLang } from "./i18n";
import { getState, updateMe } from "./store";

/** 简 / 繁 / EN: the choice is kept in this browser and on the account. */
export function LangSwitch() {
  const lang = useLang();
  const pick = (l: Lang) => {
    setLang(l);
    if (getState().me) updateMe({ locale: l });
  };
  return (
    <div class="lang-switch" role="radiogroup" aria-label="Language">
      {LANG_NAMES.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={lang === l.id}
          class={lang === l.id ? "on" : ""}
          onClick={() => pick(l.id)}
        >
          {l.id === "en" ? "EN" : l.id === "zh-TW" ? "繁" : "简"}
        </button>
      ))}
    </div>
  );
}

/** The language button in the top bar: a 文A icon, the same in every language, opening a menu of the three. */
export function LangMenu() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div class="lang-menu-box" ref={box}>
      <button
        type="button"
        class="lang-btn"
        aria-label="Language"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
          <text x="1" y="13" font-size="12" font-weight="600">
            文
          </text>
          <text x="12.5" y="21.5" font-size="12" font-weight="700">
            A
          </text>
        </svg>
      </button>
      {open && (
        <div class="lang-menu" role="menu">
          {LANG_NAMES.map((l) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={l.id === lang}
              key={l.id}
              class={l.id === lang ? "on" : ""}
              lang={l.id}
              onClick={() => {
                setOpen(false);
                setLang(l.id);
                if (getState().me) updateMe({ locale: l.id });
              }}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
