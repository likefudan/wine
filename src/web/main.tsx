import "@fontsource/cormorant-garamond/500.css";
import "./nav";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "./styles.css";
import { render } from "preact";
import { LocationProvider, Route, Router, useLocation } from "preact-iso";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Me } from "../shared/model";
import { useCellarAlerts } from "./CellarAlerts";
import { AnswersPage, BlindStart } from "./Blind";
import { HomeRoute, LeftPage, LibraryRoute, MeRoute, Spine, tabOfForm, useWide } from "./book";
import { BottlesIcon, GlassIcon, ListIcon, PersonIcon } from "./components";
import { LangMenu } from "./LangSwitch";
import { isLegalPath } from "./LegalLinks";
import { Logo } from "./Logo";
import { useHideOnScroll } from "./hideOnScroll";
import { useScrollReset } from "./scroll";
import { ConfirmHost } from "./confirm";
import { FriendsPage } from "./Friends";
import { RecsPage } from "./pages/Recs";
import { PullRefresh } from "./PullRefresh";
import { hasSavedLang, setLang, t, tm, useLang } from "./i18n";
import { AddWine } from "./pages/AddWine";
import { CellarLotPage, CellarRedirect } from "./pages/Cellar";
import { JoinPage } from "./pages/JoinPage";
import { Privacy, PrivacyOut, Terms, TermsOut } from "./pages/Legal";
import { ListPage } from "./pages/ListPage";
import { Login } from "./pages/Login";
import { Avatar, refreshPending, usePending } from "./pages/Me";
import { Taste } from "./pages/Taste";
import { Welcome } from "./pages/Welcome";
import { WinePage } from "./pages/WinePage";
import { applyMarks, applyTheme } from "./theme";
import {
  api,
  applySync,
  sessionEnded,
  setMe,
  signedInAs,
  clearRejected,
  flush,
  flushPending,
  getState,
  loadLocal,
  takePendingJoin,
  useStore,
} from "./store";

interface Session {
  google: boolean;
  dev: boolean;
  me: Me | null;
}

type Boot = { state: "loading" } | { state: "out"; session: Session | null } | { state: "in" };

const JoinOut = () => <JoinPage signedIn={false} />;
const JoinIn = () => <JoinPage signedIn />;
const AddToCellar = () => <AddWine cellar />;

function Shell() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const me = useStore((s) => s.me);
  const queue = useStore((s) => s.queue.length);
  const stuck = useStore((s) => s.stuck);
  const rejected = useStore((s) => s.rejected);
  const [online, setOnline] = useState(navigator.onLine);
  useLang();
  const { path, route, query } = useLocation();
  const wide = useWide();
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  // The open book: the tab bar sits on the left page and follows that page's scrolling; the right page starts at its top.
  const dockHidden = useHideOnScroll(
    wide ? `book ${boot.state} ${path.split("/")[1]}` : path,
    wide ? leftRef : undefined,
  );
  // Leaving a screen sends what was changed on it.
  useEffect(() => {
    if (boot.state === "in") flushPending();
  }, [path]);
  useScrollReset(path, wide ? rightRef : undefined);
  // How tall the brand bar is: what stays pinned under it (.pin) needs to know where it ends.
  const headRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = headRef.current;
    const root = document.documentElement;
    if (!el) {
      root.style.setProperty("--head-h", "0px");
      return;
    }
    const measure = () => root.style.setProperty("--head-h", `${el.offsetHeight}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    addEventListener("online", on);
    addEventListener("offline", on);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", on);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const local = await loadLocal();
      let session: Session | null = null;
      try {
        session = await api<Session>("/api/auth/session");
      } catch {
        // No network: carry on with what the phone has, if anyone was signed in.
        setBoot(local.me ? { state: "in" } : { state: "out", session: null });
        return;
      }
      if (!session.me) {
        // Signed out (the session ran out): notes not uploaded yet wait here for the same person.
        if (local.me) sessionEnded();
        setBoot({ state: "out", session });
        return;
      }
      await signedInAs(session.me);
      if (session.me.locale && !hasSavedLang()) setLang(session.me.locale);
      // Back from Google after scanning a list's QR code: finish joining, then open the list.
      const join = takePendingJoin();
      let joined = false;
      if (join) {
        try {
          await api(`/api/lists/${join.listId}/join`, { body: { k: join.k } });
          joined = true;
        } catch {
          route(`/l/${join.listId}?k=${encodeURIComponent(join.k)}`, true);
        }
      }
      if (joined) {
        try {
          if (!getState().queue.length) applySync(await api("/api/sync"));
        } catch {
          // filled in by the next flush
        }
        route(`/lists/${join!.listId}`, true);
      } else if (!getState().me) {
        // First time on this phone: wait for my copy so the pages don't start empty.
        try {
          applySync(await api("/api/sync"));
        } catch {
          // shown empty, filled in by the next flush
        }
      }
      // Notes still waiting to go up keep the server's copy out until they have: sign in with what we know.
      if (!getState().me) setMe(session.me);
      setBoot({ state: "in" });
      void flush();
      if (getState().me?.owner) void refreshPending();
    })();
  }, []);

  // The server said the session ended (a 401 while sending).
  useEffect(() => {
    if (boot.state === "in" && !me) setBoot({ state: "out", session: null });
  }, [me, boot.state]);

  // 隐私政策 and 服务条款 are for anyone, and need nothing from the server: shown at once when signed out.
  if (isLegalPath(path) && (boot.state !== "in" || !me))
    return (
      <Router>
        <Route path="/privacy" component={PrivacyOut} />
        <Route path="/terms" component={TermsOut} />
      </Router>
    );
  if (boot.state === "loading") return <div class="splash" aria-busy="true" />;
  if (boot.state === "out" || !me) {
    // A scanned QR code opens the list even when signed out.
    if (path.startsWith("/l/"))
      return (
        <Router>
          <Route path="/l/:id" component={JoinOut} />
          <Route default component={JoinOut} />
        </Router>
      );
    return <Login session={boot.state === "out" ? boot.session : null} />;
  }
  if (!me.depth) return <Welcome />;

  const tab =
    path === "/" ||
    path.startsWith("/lists") ||
    path.startsWith("/friends") ||
    path.startsWith("/answers") ||
    path.startsWith("/recs")
      ? "lists"
      : path.startsWith("/library") || path.startsWith("/wine") || path.startsWith("/cellar")
        ? "library"
        : path.startsWith("/me") || isLegalPath(path)
          ? "me"
          : path.startsWith("/taste") || path.startsWith("/add") || path.startsWith("/blind")
            ? tabOfForm(path, query)
            : "";
  const fullScreen =
    path.startsWith("/taste") || path.startsWith("/add") || path.startsWith("/cellar/add") || path.startsWith("/blind");
  const waiting = usePending();
  const due = useCellarAlerts().length;
  const head = (
    <header class={dockHidden ? "app-head hidden" : "app-head"} ref={headRef}>
      <div class="app-head-row">
        <a href="/" class="app-brand" aria-label={"AIroma"}>
          <Logo size={30} class="head-logo" />
          <span class="brand">{"AIroma"}</span>
        </a>
        {/* Top right, as on the badminton site: the language, then me. */}
        <div class="head-actions-top">
          <LangMenu />
          <a href="/me" class="head-me" aria-label={t("我")}>
            <Avatar />
          </a>
        </div>
      </div>
    </header>
  );
  const dock = (
    <div class={dockHidden ? "dock hidden" : "dock"}>
      <nav class="tabbar glass-pane" aria-label={t("主菜单")}>
        <a href="/" class={tab === "lists" ? "on" : ""} aria-current={tab === "lists" ? "page" : undefined}>
          <ListIcon />
          <span>{t("品鉴")}</span>
        </a>
        <a href="/library" class={tab === "library" ? "on" : ""} aria-current={tab === "library" ? "page" : undefined}>
          <BottlesIcon />
          {due > 0 && (
            <span class="dot">
              <span class="visually-hidden">{t("酒窖提醒")}</span>
            </span>
          )}
          <span>{t("酒册")}</span>
        </a>
        <a href="/me" class={tab === "me" ? "on" : ""} aria-current={tab === "me" ? "page" : undefined}>
          <PersonIcon />
          {waiting > 0 && (
            <span class="dot">
              <span class="visually-hidden">{t("{n} 人待审核", { n: waiting })}</span>
            </span>
          )}
          <span>{t("我")}</span>
        </a>
      </nav>
      <a href="/add" class="dock-add" aria-label={t("品一款")}>
        <GlassIcon />
      </a>
    </div>
  );
  return (
    <div class={`app${wide ? " book" : ""}${dockHidden ? " head-hidden" : ""}`}>
      <PullRefresh enabled={!fullScreen && !wide} />
      {/* Uploading is silent; only no signal, or uploads that keep failing, are worth a line. */}
      {!online ? (
        <div class="sync-bar" role="status">
          {t("没有网络，记录先存在手机上")}
        </div>
      ) : stuck && queue > 0 ? (
        <div class="sync-bar" role="status">
          {t("有 {n} 条记录暂时没能上传，会自动重试", { n: queue })}
        </div>
      ) : null}
      {rejected && (
        <div class="sync-bar warn" role="alert">
          <span>{t("有一条修改没能保存：{msg}", { msg: tm(rejected) })}</span>
          <button
            type="button"
            class="link"
            onClick={() => {
              clearRejected();
              route("/me?tab=general");
            }}
          >
            {t("查看")}
          </button>
          <button type="button" class="link" onClick={clearRejected}>
            {t("知道了")}
          </button>
        </div>
      )}
      {/* Every page but the two full-screen ones has the brand on top; deeper pages add a back row. */}
      {!wide && !fullScreen && head}
      {/* One page on a phone; the open book's two pages and its spine on a wide screen (book.tsx). */}
      <div class="spread">
        {wide && (
          <section key="left" class="leaf left">
            <div class="leaf-scroll" ref={leftRef}>
              {head}
              <LeftPage path={path} query={query} />
            </div>
            {dock}
          </section>
        )}
        {wide && <Spine key="spine" />}
        <section key="right" class="leaf right">
          <div class="leaf-scroll" ref={rightRef}>
            <main class={fullScreen || wide ? "main full" : "main"}>
              <Router>
                <Route path="/" component={HomeRoute} />
                <Route path="/lists/:id" component={ListPage} />
                <Route path="/l/:id" component={JoinIn} />
                <Route path="/add" component={AddWine} />
                <Route path="/blind" component={BlindStart} />
                <Route path="/answers/:id" component={AnswersPage} />
                <Route path="/taste/:id" component={Taste} />
                <Route path="/library" component={LibraryRoute} />
                <Route path="/wine/:id" component={WinePage} />
                <Route path="/cellar" component={CellarRedirect} />
                <Route path="/cellar/add" component={AddToCellar} />
                <Route path="/cellar/new" component={CellarLotPage} />
                <Route path="/cellar/:id" component={CellarLotPage} />
                <Route path="/me" component={MeRoute} />
                <Route path="/friends" component={FriendsPage} />
                <Route path="/recs" component={RecsPage} />
                <Route path="/privacy" component={Privacy} />
                <Route path="/terms" component={Terms} />
                <Route default component={HomeRoute} />
              </Router>
            </main>
          </div>
        </section>
      </div>
      {!wide && !fullScreen && dock}
    </div>
  );
}

applyTheme();
applyMarks();
render(
  // The router handles in-app links only: /api links (Google sign-in, photos) must reach the Worker as
  // real page loads, or a click just changes the address bar until the page is reloaded.
  <LocationProvider scope={/^\/(?!api\/)/}>
    <Shell />
    <ConfirmHost />
  </LocationProvider>,
  document.getElementById("app")!,
);

// The Chinese serif for phones that have none of their own (Android mostly). Loaded after the first
// paint, and each page then fetches only the slices of it whose characters it shows.
void import("@fontsource/noto-serif-sc/400.css");
void import("@fontsource/noto-serif-sc/600.css");

if ("serviceWorker" in navigator && !navigator.webdriver && location.hostname !== "localhost")
  addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
