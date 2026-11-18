import { useEffect, useState } from "preact/hooks";
import { t } from "./i18n";

/**
 * Our own yes/no sheet instead of window.confirm(). Some iPhone in-app browsers (WeChat and other
 * apps' web views) never show the native dialog and answer "no" at once, so a delete button there
 * did nothing at all. `ask()` resolves true only when the person taps the confirm button.
 */

type Ask = { message: string; ok: string; danger: boolean; resolve: (yes: boolean) => void };
let show: ((a: Ask | null) => void) | null = null;

export function ask(message: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => show?.({ message, ok: opts.ok ?? t("确定"), danger: opts.danger ?? true, resolve }));
}

/** Rendered once at the root of the app. */
export function ConfirmHost() {
  const [a, setA] = useState<Ask | null>(null);
  useEffect(() => {
    show = (next) =>
      setA((prev) => {
        prev?.resolve(false);
        return next;
      });
    return () => {
      show = null;
    };
  }, []);
  useEffect(() => {
    if (!a) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && answer(false);
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [a]);
  if (!a) return null;
  const answer = (yes: boolean) => {
    setA(null);
    a.resolve(yes);
  };
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the 取消 button are the keyboard ways
    // biome-ignore lint/a11y/noStaticElementInteractions: a tap outside the box cancels
    <div class="sheet-backdrop confirm-backdrop" onClick={(e) => e.target === e.currentTarget && answer(false)}>
      <div class="confirm" role="alertdialog" aria-modal="true" aria-label={a.message}>
        <p>{a.message}</p>
        <div class="confirm-actions">
          <button type="button" class="button" onClick={() => answer(false)}>
            {t("取消")}
          </button>
          <button type="button" class={a.danger ? "button danger" : "button primary"} onClick={() => answer(true)}>
            {a.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
