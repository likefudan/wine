import { t } from "./i18n";

export const isLegalPath = (path: string) => path === "/privacy" || path === "/terms";

/** The foot of the sign-in page, of 我 and of the two pages themselves. */
export function LegalLinks() {
  return (
    <footer class="legal-links">
      <a href="/privacy">{t("隐私政策")}</a>
      <span aria-hidden="true">·</span>
      <a href="/terms">{t("服务条款")}</a>
    </footer>
  );
}
