import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./styles.css";
import { render } from "preact";
import { LocationProvider, Route, Router, useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import type { Me } from "../shared/model";
import { GlassIcon, ListIcon, SearchIcon } from "./components";
import { Logo } from "./Logo";
import { ConfirmHost } from "./confirm";
import { PullRefresh } from "./PullRefresh";
import { hasSavedLang, setLang, t, tm, useLang } from "./i18n";
import { AddWine } from "./pages/AddWine";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { JoinPage } from "./pages/JoinPage";
import { ListPage } from "./pages/ListPage";
import { Login } from "./pages/Login";
import { Avatar, MePage, refreshPending, usePending } from "./pages/Me";
import { Taste } from "./pages/Taste";
import { Welcome } from "./pages/Welcome";
import { WinePage } from "./pages/WinePage";
import { applyTheme } from "./theme";
import {
  api,
  applySync,
  clearLocal,
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

function Shell() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const me = useStore((s) => s.me);
  const queue = useStore((s) => s.queue.length);
  const stuck = useStore((s) => s.stuck);
  const rejected = useStore((s) => s.rejected);
  const [online, setOnline] = useState(navigator.onLine);
  useLang();
  const { path, route } = useLocation();
  // Leaving a screen sends what was changed on it.
  useEffect(() => {
    if (boot.state === "in") flushPending();
  }, [path]);

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
        if (local.me) clearLocal();
        setBoot({ state: "out", session });
        return;
      }
      if (local.me && local.me.id !== session.me.id) clearLocal();
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
      setBoot({ state: "in" });
      void flush();
      if (getState().me?.owner) void refreshPending();
    })();
  }, []);

  // The server said the session ended (a 401 while sending).
  useEffect(() => {
    if (boot.state === "in" && !me) setBoot({ state: "out", session: null });
  }, [me, boot.state]);

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
    path === "/" || path.startsWith("/lists")
      ? "lists"
      : path.startsWith("/library") || path.startsWith("/wine")
        ? "library"
        : path.startsWith("/me")
          ? "me"
          : "";
  const fullScreen = path.startsWith("/taste") || path.startsWith("/add");
  const waiting = usePending();
  // 记一杯 while looking at a list adds to that list.
  const inList = /^\/lists\/([^/?]+)/.exec(path)?.[1];
  return (
    <div class="app">
      <PullRefresh enabled={!fullScreen} />
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
          <button type="button" class="link" onClick={clearRejected}>
            {t("知道了")}
          </button>
        </div>
      )}
      {/* Every page but the two full-screen ones has the brand on top; deeper pages add a back row. */}
      {!fullScreen && (
        <header class="app-head">
          <a href="/" class="app-brand" aria-label={t("品酒日记")}>
            <Logo size={30} class="head-logo" />
            <span class="brand">{t("品酒日记")}</span>
          </a>
        </header>
      )}
      <main class={fullScreen ? "main full" : "main"}>
        <Router>
          <Route path="/" component={Home} />
          <Route path="/lists/:id" component={ListPage} />
          <Route path="/l/:id" component={JoinIn} />
          <Route path="/add" component={AddWine} />
          <Route path="/taste/:id" component={Taste} />
          <Route path="/library" component={Library} />
          <Route path="/wine/:id" component={WinePage} />
          <Route path="/me" component={MePage} />
          <Route default component={Home} />
        </Router>
      </main>
      {!fullScreen && (
        <div class="dock">
          <nav class="tabbar glass-pane" aria-label={t("主菜单")}>
            <a href="/" class={tab === "lists" ? "on" : ""} aria-current={tab === "lists" ? "page" : undefined}>
              <ListIcon />
              <span>{t("品鉴")}</span>
            </a>
            <a
              href="/library"
              class={tab === "library" ? "on" : ""}
              aria-current={tab === "library" ? "page" : undefined}
            >
              <SearchIcon />
              <span>{t("酒库")}</span>
            </a>
            <a href="/me" class={tab === "me" ? "on" : ""} aria-current={tab === "me" ? "page" : undefined}>
              <Avatar tab />
              {waiting > 0 && (
                <span class="dot">
                  <span class="visually-hidden">{t("{n} 人待审核", { n: waiting })}</span>
                </span>
              )}
              <span>{t("我的")}</span>
            </a>
          </nav>
          <a href={inList ? `/add?list=${inList}` : "/add"} class="dock-add" aria-label={t("记一杯")}>
            <GlassIcon />
          </a>
        </div>
      )}
    </div>
  );
}

applyTheme();
render(
  // The router handles in-app links only: /api links (Google sign-in, photos) must reach the Worker as
  // real page loads, or a click just changes the address bar until the page is reloaded.
  <LocationProvider scope={/^\/(?!api\/)/}>
    <Shell />
    <ConfirmHost />
  </LocationProvider>,
  document.getElementById("app")!,
);

if ("serviceWorker" in navigator && !navigator.webdriver && location.hostname !== "localhost")
  addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
