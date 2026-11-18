import { useLocation, useRoute } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { glassColor } from "../../shared/guide";
import { type Board, type BoardItem, LIST_KINDS, type ListKind, type ListPlace } from "../../shared/model";
import { EveryoneSheet, ShareSheet } from "../Sharing";
import { BackIcon, Choice, Field, Glass, Sheet, WineName } from "../components";
import { ask } from "../confirm";
import { fmtDate, t, tm } from "../i18n";
import {
  ApiError,
  blankTasting,
  deleteList,
  fetchBoard,
  getState,
  leaveList,
  moveItem,
  removeItem,
  saveList,
  saveTasting,
  useStore,
} from "../store";
import { mapsUrl } from "../PlaceInput";
import { KIND_NAMES, ListPlaceField, placeFor } from "./Home";

/** Opens my note for a wine in a list, starting one at my default depth the first time. */
export function openTasting(route: (url: string) => void, vintageId: string, itemId: string | null) {
  const s = getState();
  const mine = itemId ? s.tastings.find((x) => x.listItemId === itemId) : undefined;
  if (mine) return route(`/taste/${mine.id}`);
  const x = blankTasting(vintageId, itemId, s.me?.depth ?? "quick");
  saveTasting(x);
  route(`/taste/${x.id}?new=1`);
}

export function ListPage() {
  const { params } = useRoute();
  const { route } = useLocation();
  const list = useStore((s) => s.lists.find((l) => l.id === params.id));
  const items = useStore((s) => s.items.filter((i) => i.listId === params.id).sort((a, b) => a.position - b.position));
  const vintages = useStore((s) => s.vintages);
  const tastings = useStore((s) => s.tastings);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [everyone, setEveryone] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [shareError, setShareError] = useState("");
  const syncedAt = useStore((s) => s.syncedAt);
  const me = useStore((s) => s.me);
  // Everyone's notes come from the server, which applies 盲评; refreshed after each upload.
  useEffect(() => {
    if (!list || navigator.onLine === false) return;
    let live = true;
    fetchBoard(list.id).then(
      (b) => live && setBoard(b),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [list?.id, syncedAt]);
  if (!list)
    return (
      <div class="page">
        <p class="empty">{t("找不到这份酒单")}</p>
        <a href="/">{t("回到酒单")}</a>
      </div>
    );
  const vById = new Map(vintages.map((v) => [v.id, v]));
  const scores = items
    .map((i) => tastings.find((x) => x.listItemId === i.id)?.score)
    .filter((n): n is number => typeof n === "number");
  const best = scores.length ? Math.max(...scores) : null;
  const shared = (board?.memberCount ?? list.members ?? 1) > 1;
  const boardItem = (id: string) => board?.items.find((b) => b.id === id);
  const openShare = async () => {
    setShareError("");
    try {
      setBoard(await fetchBoard(list.id));
      setSharing(true);
    } catch (e) {
      setShareError(e instanceof ApiError ? tm(e.message) : t("没有网络，分享要联网才能用"));
    }
  };
  const everyoneItem = everyone ? boardItem(everyone) : undefined;

  return (
    <div class="page">
      <header class="page-head">
        <a href="/" class="icon-button" aria-label={t("返回")}>
          <BackIcon />
        </a>
        <div class="page-head-title">
          <h1 class="list-title">{list.title}</h1>
          <span class="muted small">
            {t(KIND_NAMES[list.kind])}
            {list.startsOn ? ` · ${fmtDate(list.startsOn)}` : ""}
          </span>
          {list.place && (
            <a
              class="small place-link block-link"
              href={mapsUrl(list.place.name, list.place.id)}
              target="_blank"
              rel="noreferrer"
            >
              📍 {list.place.name}
              {list.place.address ? ` · ${list.place.address}` : ""}
            </a>
          )}
        </div>
        <span class="head-actions">
          <button type="button" class="link" onClick={openShare}>
            {t("分享")}
          </button>
          <button type="button" class="link" onClick={() => setSettings(true)}>
            {t("设置")}
          </button>
        </span>
      </header>
      {shareError && (
        <p class="notice" role="alert">
          {shareError}
        </p>
      )}
      {shared && board && (
        <p class="muted small share-line">
          {t("{n} 人一起记", { n: board.memberCount })} ·{" "}
          {!board.list.blind
            ? t("大家的评分互相可见")
            : board.list.revealedAt
              ? t("已揭晓")
              : t("盲评中：交了自己的评价才能看别人的")}
        </p>
      )}
      {items.length === 0 ? (
        <p class="empty">{t("按上酒顺序一款款加进来，喝一款记一款。")}</p>
      ) : (
        <div class="list-tools">
          <span class="muted small">{t("{n} 款", { n: items.length })}</span>
          <button type="button" class="link" onClick={() => setEditing(!editing)}>
            {editing ? t("完成") : t("调整顺序")}
          </button>
        </div>
      )}
      <ol class="rows numbered">
        {items.map((i, n) => {
          const v = vById.get(i.vintageId);
          if (!v) return null;
          const mine = tastings.find((x) => x.listItemId === i.id);
          return (
            <li key={i.id} class="row-wrap">
              <span class="row-n num">{n + 1}</span>
              {editing ? (
                <div class="row">
                  <Glass color={glassColor(v.color, mine?.appearance, v.year)} />
                  <WineName v={v} sub={false} />
                  <span class="row-actions">
                    <button
                      type="button"
                      class="icon-button"
                      aria-label={t("上移")}
                      disabled={n === 0}
                      onClick={() => moveItem(list.id, i.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="icon-button"
                      aria-label={t("下移")}
                      disabled={n === items.length - 1}
                      onClick={() => moveItem(list.id, i.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="icon-button danger"
                      aria-label={t("移除")}
                      onClick={async () =>
                        (await ask(t("从酒单移除这款酒？你的笔记会留在酒库里。"))) && removeItem(i.id)
                      }
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ) : (
                <div class="row-stack">
                  <button type="button" class="row" onClick={() => openTasting(route, v.id, i.id)}>
                    <Glass color={glassColor(v.color, mine?.appearance, v.year)} />
                    <WineName v={v} />
                    <span class={`row-score num${mine?.score !== null && mine?.score === best ? " best" : ""}`}>
                      {mine?.score ?? (mine ? "✓" : t("记"))}
                    </span>
                  </button>
                  {shared && <EveryoneChip b={boardItem(i.id)} onClick={() => setEveryone(i.id)} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <a class="button primary block" href={`/add?list=${list.id}`}>
        ＋ {t("加下一款酒")}
      </a>
      {settings &&
        (list.ownerId && list.ownerId !== me?.id ? (
          <MemberSettings listId={list.id} onClose={() => setSettings(false)} onLeft={() => route("/")} />
        ) : (
          <ListSettings listId={list.id} onClose={() => setSettings(false)} onDeleted={() => route("/")} />
        ))}
      {sharing && board && <ShareSheet board={board} onChange={setBoard} onClose={() => setSharing(false)} />}
      {everyoneItem && (
        <EveryoneSheet
          item={everyoneItem}
          onTaste={() => {
            setEveryone(null);
            openTasting(route, everyoneItem.vintage.id, everyoneItem.id);
          }}
          onClose={() => setEveryone(null)}
        />
      )}
    </div>
  );
}

/** 大家: under each wine of a shared list, how many rated it and (once open to me) their average. */
function EveryoneChip(props: { b: BoardItem | undefined; onClick: () => void }) {
  const b = props.b;
  if (!b || b.rated === 0) return null;
  return (
    <button type="button" class="everyone-chip" onClick={props.onClick}>
      {b.open
        ? b.avg !== null
          ? t("大家 {n} 人 · 平均 {avg}", { n: b.rated, avg: b.avg })
          : t("大家 {n} 人已评 · 看笔记", { n: b.rated })
        : `🔒 ${t("{n} 人已评", { n: b.rated })}`}
    </button>
  );
}

/** A list someone else made: I can only leave it. */
function MemberSettings(props: { listId: string; onClose: () => void; onLeft: () => void }) {
  const [error, setError] = useState("");
  return (
    <Sheet title={t("酒单设置")} onClose={props.onClose}>
      <div class="form">
        <p class="muted">{t("这份酒单是别人建的，只有创建者能改名称和设置。你可以往里加酒、记自己的感受。")}</p>
        {error && (
          <p class="notice" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          class="button danger"
          onClick={async () => {
            if (!(await ask(t("退出这份酒单？你记的笔记会留在你的酒库里。")))) return;
            try {
              await leaveList(props.listId);
              props.onLeft();
            } catch (e) {
              setError(e instanceof ApiError ? tm(e.message) : t("没有网络，分享要联网才能用"));
            }
          }}
        >
          {t("退出酒单")}
        </button>
      </div>
    </Sheet>
  );
}

function ListSettings(props: { listId: string; onClose: () => void; onDeleted: () => void }) {
  const list = getState().lists.find((l) => l.id === props.listId)!;
  const [title, setTitle] = useState(list.title);
  const [kind, setKind] = useState<ListKind>(list.kind);
  const [place, setPlace] = useState<ListPlace | null>(list.place ?? null);
  const [date, setDate] = useState(list.startsOn ?? "");
  const [note, setNote] = useState(list.note ?? "");
  const submit = (e: Event) => {
    e.preventDefault();
    if (!title.trim()) return;
    saveList({
      ...list,
      title: title.trim(),
      kind,
      startsOn: date || null,
      place: placeFor(kind, place),
      note: note.trim() || null,
    });
    props.onClose();
  };
  return (
    <Sheet title={t("酒单设置")} onClose={props.onClose}>
      <form class="form" onSubmit={submit}>
        <Field label={t("名称")}>
          <input value={title} maxLength={80} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label={t("类型")} group>
          <Choice
            label={t("类型")}
            value={kind}
            clearable={false}
            options={LIST_KINDS.map((k) => ({ value: k, label: t(KIND_NAMES[k]) }))}
            onChange={(v) => v && setKind(v)}
          />
        </Field>
        <ListPlaceField kind={kind} value={place} onChange={setPlace} />
        <Field label={t("日期")}>
          <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label={t("备注")}>
          <textarea
            rows={2}
            maxLength={500}
            value={note}
            onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
          />
        </Field>
        <button type="submit" class="button primary">
          {t("保存")}
        </button>
        <button
          type="button"
          class="button danger"
          onClick={async () => {
            if (!(await ask(t("删除这份酒单？里面的笔记会留在你的酒库里。"), { ok: t("删除") }))) return;
            deleteList(list.id);
            props.onDeleted();
          }}
        >
          {t("删除酒单")}
        </button>
      </form>
    </Sheet>
  );
}
