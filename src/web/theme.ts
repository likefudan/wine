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

/** How a chosen option is marked: circled by pen (the default) or brushed over. Kept in this browser. */
export type Marks = "circle" | "brush";
const MARKS_KEY = "marks";

export function savedMarks(): Marks {
  try {
    return localStorage.getItem(MARKS_KEY) === "brush" ? "brush" : "circle";
  } catch {
    return "circle";
  }
}

export function applyMarks(marks: Marks = savedMarks()) {
  if (marks === "circle") delete document.documentElement.dataset.marks;
  else document.documentElement.dataset.marks = marks;
}

export function setMarks(marks: Marks) {
  try {
    if (marks === "circle") localStorage.removeItem(MARKS_KEY);
    else localStorage.setItem(MARKS_KEY, marks);
  } catch {
    // private mode
  }
  applyMarks(marks);
}
