import { isBlindId } from "../shared/blind";
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { COLOR_WORDS } from "../shared/guide";
import { type VintageInfo, yearLabel } from "../shared/model";
import { grapeName } from "../shared/grapes";
import { placePath } from "../shared/place";
import { currentLang, p, t, tk } from "./i18n";

/** 杯中色: a glass seen from above, deep in the core and paler at the rim (docs/design.zh.md §5). */
export function Glass(props: { color: string; size?: number; label?: string }) {
  const s = props.size ?? 28;
  const style = {
    width: `${s}px`,
    height: `${s}px`,
    background: `radial-gradient(circle at 50% 50%, ${props.color} 0 50%, color-mix(in srgb, ${props.color} 60%, #fff) 72%, color-mix(in srgb, ${props.color} 22%, transparent) 100%)`,
  };
  return props.label ? (
    <span class="glass" role="img" aria-label={props.label} style={style} />
  ) : (
    <span class="glass" aria-hidden="true" style={style} />
  );
}

/** Producer, wine and vintage, the way every row shows a wine. */
export function WineName(props: { v: VintageInfo; sub?: boolean }) {
  const { v } = props;
  // 盲品: the glass's own name (blindVintage), until the answer is in.
  if (isBlindId(v.id))
    return (
      <span class="wine-name">
        <span class="wine-producer blind-label">{v.wine}</span>
        {props.sub !== false && (
          <span class="wine-sub">
            {t("盲品")} · {p(COLOR_WORDS[v.color])}
          </span>
        )}
      </span>
    );
  const sameName = v.wine.trim().toLowerCase() === v.producer.trim().toLowerCase();
  const lang = currentLang();
  const sub = [
    p(COLOR_WORDS[v.color]),
    v.grapes.length ? v.grapes.map((g) => grapeName(g, lang)).join(" / ") : null,
    // The two most precise levels: "Napa Valley › Oakville", "Médoc › Pauillac".
    placePath(v).slice(-2).join(" › ") || null,
  ].filter(Boolean);
  return (
    <span class="wine-name">
      <span class="wine-producer">{v.producer}</span>
      <span class="wine-title">
        {sameName ? "" : `${v.wine} `}
        <span class="num">{yearLabel(v.year)}</span>
      </span>
      {props.sub !== false && sub.length > 0 && <span class="wine-sub">{sub.join(" · ")}</span>}
    </span>
  );
}

/** One of a few choices, as a row of buttons. */
export function Choice<T extends string | number>(props: {
  value: T | undefined | null;
  options: { value: T; label: string }[];
  onChange: (v: T | undefined) => void;
  label: string;
  /** Tapping the chosen one again clears it. */
  clearable?: boolean;
}) {
  return (
    <div class="choice" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          class={props.value === o.value ? "on" : ""}
          onClick={() => props.onChange(props.clearable !== false && props.value === o.value ? undefined : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SCORE_MARKS: [number, string][] = [
  [80, tk("一般")],
  [85, tk("不错")],
  [90, tk("很喜欢")],
  [95, tk("惊艳")],
];

/** 我的分: how much I liked it, 50–100. Empty until touched. */
export function ScoreSlider(props: { value: number | null; onChange: (v: number | null) => void }) {
  const v = props.value;
  const word = v === null ? null : ([...SCORE_MARKS].reverse().find(([n]) => v >= n)?.[1] ?? tk("不喜欢"));
  return (
    <div class="score">
      <div class="score-head">
        <span class="score-label">{t("我的分")}</span>
        <span class="score-value num">{v ?? "—"}</span>
        <span class="score-word">{word ? t(word) : t("拖动打分")}</span>
        {v !== null && (
          <button type="button" class="link small" onClick={() => props.onChange(null)}>
            {t("清除")}
          </button>
        )}
      </div>
      <input
        type="range"
        min={60}
        max={100}
        step={1}
        value={v ?? 85}
        class={v === null ? "unset" : ""}
        aria-label={t("我的分")}
        onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value))}
      />
      <div class="score-marks" aria-hidden="true">
        {SCORE_MARKS.map(([n]) => (
          <span key={n} style={{ left: `${((n - 60) / 40) * 100}%` }}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A sheet over the page, closed with ✕, the backdrop or Escape. */
export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [props.onClose]);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it (above); the ✕ button is the keyboard way
    // biome-ignore lint/a11y/noStaticElementInteractions: a tap outside the sheet closes it
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.title}>
        <div class="sheet-head">
          <h2>{props.title}</h2>
          <button type="button" class="icon-button" aria-label={t("关闭")} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

/**
 * A labelled field. `group` for a row of buttons: a <label> would hand a tap on its text to the
 * first button inside.
 */
export function Field(props: { label: string; children: ComponentChildren; hint?: string; group?: boolean }) {
  if (props.group)
    return (
      <div class="field" role="group" aria-label={props.label}>
        <span class="field-label">{props.label}</span>
        {props.children}
        {props.hint && <span class="field-hint">{props.hint}</span>}
      </div>
    );
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child passed in
    <label class="field">
      <span class="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span class="field-hint">{props.hint}</span>}
    </label>
  );
}

export const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      d="M15 5l-7 7 7 7"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);
export const CameraIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
    <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8" />
  </svg>
);
/** 盲品: an eye struck through. */
export const BlindIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <path
      d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <path d="M4 20 20 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
);
export const ListIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    <circle cx="4" cy="6" r="1.3" fill="currentColor" />
    <circle cx="4" cy="12" r="1.3" fill="currentColor" />
    <circle cx="4" cy="18" r="1.3" fill="currentColor" />
  </svg>
);
export const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" />
    <path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);
export const GlassIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <path
      d="M7 3h10c0 5-1 9-5 9s-5-4-5-9zM12 12v8M8 21h8"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);
/** 放进酒窖: a bottle with its label. */
export const BottleIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      d="M10 3h4v3.5c2 .9 3 2.6 3 4.5v9.5H7V11c0-1.9 1-3.6 3-4.5z"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <path d="M7 14h10" stroke="currentColor" stroke-width="2" />
  </svg>
);

export const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M12 15V4m0 0L8 8m4-4 4 4M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);
