/** 深色 / 浅色 / 跟随系统 (docs/design.zh.md §5), kept in this browser. */
export type Theme = "auto" | "light" | "dark";
const KEY = "theme";

export function savedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(theme: Theme = savedTheme()) {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // private mode
  }
  applyTheme(theme);
}
