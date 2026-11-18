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
