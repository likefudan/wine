import { useLocation } from "preact-iso";
import { BackIcon } from "../components";
import { goBack } from "../nav";
import { Logo } from "../Logo";
import { LangSwitch } from "../LangSwitch";
import { currentLang, t, useLang } from "../i18n";
import { LegalLinks } from "../LegalLinks";
import { type LegalDoc, PRIVACY, TERMS } from "./legalText";

/**
 * 隐私政策 and 服务条款: open to anyone, signed in or not (Google's sign-in review reads them
 * without an account). Signed out, the page brings its own top row, since the app's is not there.
 */
function LegalPage(props: { title: string; doc: LegalDoc; signedIn: boolean }) {
  const { route } = useLocation();
  const site = "AIroma";
  const fill = (s: string) => s.split("{site}").join(site).split("{host}").join(location.host);
  return (
    <div class="page legal">
      {!props.signedIn && (
        <div class="legal-top">
          <a href="/" class="app-brand" aria-label={site}>
            <Logo size={30} class="head-logo" />
            <span class="brand">{site}</span>
          </a>
          <LangSwitch />
        </div>
      )}
      {props.signedIn ? (
        <header class="page-head">
          <button
            type="button"
            class="icon-button back-up"
            aria-label={t("返回")}
            onClick={() => goBack(route, "/me?tab=general")}
          >
            <BackIcon />
          </button>
          <h1 class="page-head-title">{props.title}</h1>
        </header>
      ) : (
        <h1 class="page-head-title">{props.title}</h1>
      )}
      <p class="muted small">{props.doc.updated}</p>
      {props.doc.sections.map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          {s.body.map((b, i) =>
            typeof b === "string" ? (
              <p key={i}>{fill(b)}</p>
            ) : (
              <ul key={i}>
                {b.map((item, j) => (
                  <li key={j}>{fill(item)}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
      <LegalLinks />
    </div>
  );
}

function page(kind: "privacy" | "terms", signedIn: boolean) {
  return () => {
    useLang();
    return kind === "privacy" ? (
      <LegalPage title={t("隐私政策")} doc={PRIVACY[currentLang()]} signedIn={signedIn} />
    ) : (
      <LegalPage title={t("服务条款")} doc={TERMS[currentLang()]} signedIn={signedIn} />
    );
  };
}

export const Privacy = page("privacy", true);
export const Terms = page("terms", true);
export const PrivacyOut = page("privacy", false);
export const TermsOut = page("terms", false);
