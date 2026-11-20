import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { goBack } from "./nav";
import { DESCRIPTOR_BY_ID } from "../shared/descriptors";
import { glassColor } from "../shared/guide";
import type { FriendFeed, FriendNote } from "../shared/model";
import { Initial } from "./Sharing";
import { BackIcon, Glass, WineName } from "./components";
import { fmtDate, p, t } from "./i18n";
import { api } from "./store";

/**
 * 朋友动态: what the people I share a 品鉴 with have noted there. Read from the server each time (it
 * needs a network, and a friend's notes are not part of my own copy); 先评后看 is decided there too.
 */

const SEEN_KEY = "wine.friendsSeen";
const seenAt = (): string => {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
};
const markSeen = (at: string) => {
  try {
    if (at > seenAt()) localStorage.setItem(SEEN_KEY, at);
  } catch {
    // a private window: everything just stays "new"
  }
};

/** null while loading, or with no network (the section then stays away). */
export function useFriendFeed(query = ""): { feed: FriendFeed | null; more: () => void; loading: boolean } {
  const [feed, setFeed] = useState<FriendFeed | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    setFeed(null);
    api<FriendFeed>(`/api/friends${query}`).then(
      (f) => live && setFeed(f),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [query]);
  const more = () => {
    if (!feed?.next || loading) return;
    setLoading(true);
    const sep = query ? "&" : "?";
    api<FriendFeed>(`/api/friends${query}${sep}before=${encodeURIComponent(feed.next)}`)
      .then(
        (f) => setFeed({ notes: [...feed.notes, ...f.notes], next: f.next }),
        () => {},
      )
      .finally(() => setLoading(false));
  };
  return { feed, more, loading };
}

const aromaWords = (ids: string[], max = 4) =>
  ids
    .map((id) => DESCRIPTOR_BY_ID.get(id))
    .filter((d) => !!d)
    .slice(0, max)
    .map((d) => p(d!.name))
    .join(" · ");

/** One friend's note. `wine` false on the wine's own page, where the wine is already on top. */
export function FriendNoteCard(props: { n: FriendNote; fresh?: boolean; wine?: boolean }) {
  const { n } = props;
  const aromas = aromaWords(n.descriptors);
  return (
    <li>
      <a class="card friend-note" href={`/lists/${n.list.id}`}>
        <div class="note-head">
          <Initial name={n.user.name} picture={n.user.picture} />
          <span class="friend-who">
            <strong>{n.user.name}</strong>
            <span class="muted small">
              {n.list.title} · {fmtDate(n.at, false)}
            </span>
          </span>
          {props.fresh && <span class="friend-new">{t("新")}</span>}
          {n.open ? (
            <span class="row-score num">{n.score ?? "–"}</span>
          ) : (
            <span class="friend-lock">
              <span aria-hidden="true">🔒</span>
              <span class="visually-hidden">{t("先评后看")}</span>
            </span>
          )}
        </div>
        {props.wine !== false && (
          <div class="row static friend-wine">
            <Glass color={glassColor(n.vintage.color, undefined, n.vintage.year)} size={22} />
            <WineName v={n.vintage} sub={false} />
          </div>
        )}
        {n.open ? (
          <>
            {aromas && <p class="small friend-aromas">{aromas}</p>}
            {n.note && <p class="quote friend-text">{n.note}</p>}
            {n.buyAgain && <p class="muted small">{t("还会买")}</p>}
          </>
        ) : (
          <p class="muted small">{t("先评后看：交了你自己的评分或笔记后就能看到。")}</p>
        )}
      </a>
    </li>
  );
}

/** The latest few on 品鉴, with a way to all of them. Stays away until a friend has noted something. */
export function FriendsSection() {
  const { feed } = useFriendFeed();
  if (!feed?.notes.length) return null;
  const seen = seenAt();
  const fresh = feed.notes.filter((n) => n.at > seen).length;
  return (
    <section class="friends">
      <div class="section-head">
        <h2 class="section-title">
          {t("朋友动态")}
          {fresh > 0 && <span class="friend-new">{t("{n} 条新的", { n: fresh })}</span>}
        </h2>
        <a class="link small" href="/friends">
          {t("全部")} ›
        </a>
      </div>
      <ul class="rows">
        {feed.notes.slice(0, 3).map((n) => (
          <FriendNoteCard key={n.id} n={n} fresh={n.at > seen} />
        ))}
      </ul>
    </section>
  );
}

/** /friends: everything, newest first. Opening it counts as having seen them. */
export function FriendsPage() {
  const { route } = useLocation();
  const { feed, more, loading } = useFriendFeed();
  const [seen] = useState(seenAt);
  useEffect(() => {
    if (feed?.notes[0]) markSeen(feed.notes[0].at);
  }, [feed]);
  return (
    <div class="page">
      <header class="page-head pin">
        <button type="button" class="icon-button" aria-label={t("返回")} onClick={() => goBack(route, "/")}>
          <BackIcon />
        </button>
        <h1 class="page-head-title">{t("朋友动态")}</h1>
      </header>
      <p class="muted small">
        {t("这里是一起品鉴的朋友在共同的品鉴里记下的评价。他们单独记的酒和品酒地点不会出现在这里。")}
      </p>
      {feed === null ? (
        <p class="empty" aria-busy="true">
          {t("正在加载…")}
        </p>
      ) : feed.notes.length === 0 ? (
        <p class="empty">{t("还没有朋友的动态。在品鉴里点「分享」，让同行的朋友扫码加入，一起记录。")}</p>
      ) : (
        <ul class="rows">
          {feed.notes.map((n) => (
            <FriendNoteCard key={n.id} n={n} fresh={n.at > seen} />
          ))}
        </ul>
      )}
      {feed?.next && (
        <button type="button" class="button block" disabled={loading} onClick={more}>
          {t("更早的")}
        </button>
      )}
    </div>
  );
}

/** 朋友的评价 on the wine page: friends' notes on this wine in the 品鉴 we share. */
export function FriendsOnWine(props: { vintageId: string }) {
  const { feed, more, loading } = useFriendFeed(`?vintage=${props.vintageId}`);
  if (!feed?.notes.length) return null;
  return (
    <section>
      <h2 class="section-title">{t("朋友的评价")}</h2>
      <ul class="rows">
        {feed.notes.map((n) => (
          <FriendNoteCard key={n.id} n={n} wine={false} />
        ))}
      </ul>
      {feed.next && (
        <button type="button" class="link small" disabled={loading} onClick={more}>
          {t("更早的")}
        </button>
      )}
    </section>
  );
}
