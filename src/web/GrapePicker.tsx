import { useState } from "preact/hooks";
import { GRAPES, canonicalGrape, commonGrapes, grapeName } from "../shared/grapes";
import { currentLang, t } from "./i18n";

const OTHER = "__other__";
const MAX = 8;

/**
 * 葡萄品种 by tapping: the usual grapes for this colour as chips, every other known grape in a list,
 * and a last-resort box for one we don't know. Values are stored in English (shared/grapes.ts);
 * anything already saved in another spelling is shown as its own chip and kept unless tapped off.
 */
export function GrapePicker(props: {
  value: string[];
  onChange: (v: string[]) => void;
  color?: string | null;
  /** One grape only (a blind guess): picking another replaces it. */
  single?: boolean;
  label: string;
}) {
  const lang = currentLang();
  const name = (g: string) => grapeName(g, lang);
  const chosen = props.value.map(canonicalGrape);
  const has = (g: string) => chosen.includes(g);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");

  const toggle = (g: string) => {
    if (has(g)) props.onChange(chosen.filter((x) => x !== g));
    else if (props.single) props.onChange([g]);
    else if (chosen.length < MAX) props.onChange([...chosen, g]);
  };
  const common = commonGrapes(props.color);
  const chips = [...common, ...chosen.filter((g) => !common.includes(g))];
  const rest = GRAPES.filter((g) => !common.includes(g.en) && !has(g.en)).sort((a, b) =>
    name(a.en).localeCompare(name(b.en), lang),
  );
  const pick = (e: Event) => {
    const el = e.target as HTMLSelectElement;
    if (el.value === OTHER) setTyping(true);
    else if (el.value) toggle(el.value);
    el.value = "";
  };
  const addTyped = () => {
    const g = canonicalGrape(typed.slice(0, 60));
    if (g && !has(g)) toggle(g);
    setTyped("");
    setTyping(false);
  };
  const full = !props.single && chosen.length >= MAX;

  return (
    <div class="grape-picker">
      <div class="chips" role="group" aria-label={props.label}>
        {chips.map((g) => (
          <button
            key={g}
            type="button"
            class={has(g) ? "chip on" : "chip"}
            aria-pressed={has(g)}
            disabled={!has(g) && full}
            onClick={() => toggle(g)}
          >
            {name(g)}
          </button>
        ))}
      </div>
      <div class="grape-more">
        <select aria-label={t("更多品种")} onChange={pick} disabled={full} value="">
          <option value="">{t("更多品种…")}</option>
          <optgroup label={t("红葡萄")}>
            {rest
              .filter((g) => !g.white)
              .map((g) => (
                <option key={g.en} value={g.en}>
                  {name(g.en)}
                </option>
              ))}
          </optgroup>
          <optgroup label={t("白葡萄")}>
            {rest
              .filter((g) => g.white)
              .map((g) => (
                <option key={g.en} value={g.en}>
                  {name(g.en)}
                </option>
              ))}
          </optgroup>
          <option value={OTHER}>{t("列表里没有，手动填写")}</option>
        </select>
        {typing && (
          <span class="chip-form">
            <input
              value={typed}
              maxLength={60}
              // biome-ignore lint/a11y/noAutofocus: opened by the reader's own tap on 手动填写
              autoFocus
              aria-label={t("品种名")}
              placeholder={t("品种名")}
              onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTyped();
                }
              }}
            />
            <button type="button" class="chip" onClick={addTyped} disabled={!typed.trim()}>
              {t("添加")}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
