import { shownVintage } from "../../shared/blind";
import { useLocation, useRoute } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import { glassColor } from "../../shared/guide";
import type { Board } from "../../shared/model";
import { LangSwitch } from "../LangSwitch";
import { Logo } from "../Logo";
import { EveryoneSheet, Initial } from "../Sharing";
import { Glass, WineName } from "../components";
import { fmtDate, t, tm } from "../i18n";
import { ApiError, fetchBoard, joinList, rememberJoin } from "../store";
import { inWeChat, isIos } from "./Login";
import { KIND_NAMES } from "./Home";

/**
 * /l/{list}?k={key}: what a scanned QR code opens. Anyone sees the list and its wines; signing in
 * with Google (or tapping 加入 when signed in) makes them a member. A signed-out visitor's join is
 * remembered across the Google round trip and finished by the app (main.tsx).
 */
export function JoinPage(props: { signedIn: boolean }) {
  const { params } = useRoute();
  const { route, query } = useLocation();
  const k = query.k ?? null;
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetchBoard(params.id!, k).then(setBoard, (e) =>
      setError(e instanceof ApiError ? tm(e.message) : t("没有网络，请联网后再扫一次")),
    );
  }, [params.id, k]);

  const join = async () => {
    setJoining(true);
    try {
      await joinList(params.id!, k ?? "");
      route(`/lists/${params.id}`, true);
    } catch (e) {
      setError(e instanceof ApiError ? tm(e.message) : t("没有网络，请联网后再扫一次"));
      setJoining(false);
    }
  };

  const head = !props.signedIn && (
    <div class="login-top">
      <LangSwitch />
    </div>
  );
  if (error && !board)
    return (
      <div class="page join">
        {head}
        <div class="lockup">
          <Logo size={44} />
          <h1 class="brand">{t("品酒日记")}</h1>
        </div>
        <p class="notice" role="alert">
          {error}
        </p>
        <a href="/">{props.signedIn ? t("回到品鉴") : t("打开品酒日记")}</a>
      </div>
    );
  if (!board) return <div class="splash" aria-busy="true" />;
  const l = board.list;
  const item = open ? board.items.find((i) => i.id === open) : undefined;
  const blindHidden = l.blind && !l.revealedAt;

  return (
    <div class="page join">
      {head}
      <p class="muted small">{t("{name} 的品鉴", { name: l.ownerName })}</p>
      <h1 class="list-title">{l.title}</h1>
      <p class="muted small">
        {[
          t(KIND_NAMES[l.kind]),
          l.startsOn ? fmtDate(l.startsOn) : null,
          l.place?.name,
          t("{n} 人", { n: board.memberCount }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {board.member ? (
        <a class="button primary block" href={`/lists/${l.id}`}>
          {t("打开品鉴")}
        </a>
      ) : board.canJoin ? (
        <div class="join-box">
          <p>
            {t(
              "加入后，你可以和大家一起往品鉴里加酒，每款酒记下自己的感受和评分。不懂品酒术语也没关系，会一步步用大白话问你。",
            )}
          </p>
          {props.signedIn ? (
            <button type="button" class="button primary block" disabled={joining} onClick={join}>
              {t("加入这次品鉴")}
            </button>
          ) : inWeChat() ? (
            <div class="notice">
              <strong>{t("微信里不能用 Google 登录")}</strong>
              <br />
              {isIos() ? t("点右上角「⋯」，选「在 Safari 中打开」") : t("点右上角「⋯」，选「在浏览器打开」")}
            </div>
          ) : (
            <a class="button primary block" href="/api/auth/google" onClick={() => rememberJoin(l.id, k ?? "")}>
              {t("用 Google 登录并加入")}
            </a>
          )}
        </div>
      ) : !l.joinOpen && k ? (
        <p class="notice">{t("这次品鉴已停止扫码加入")}</p>
      ) : null}
      {error && (
        <p class="notice" role="alert">
          {error}
        </p>
      )}

      <h2 class="section-title">{t("{n} 款", { n: board.items.length })}</h2>
      {blindHidden && !board.member && <p class="muted small">{t("盲评中：大家的评分会在创建者揭晓后显示。")}</p>}
      <ol class="rows numbered">
        {board.items.map((i, n) => (
          <li key={i.id} class="row-wrap">
            <span class="row-n num">{n + 1}</span>
            <button type="button" class="row" onClick={() => setOpen(i.id)} disabled={!i.open || !i.notes.length}>
              <Glass color={glassColor(shownVintage(i).color, undefined, shownVintage(i).year)} />
              <WineName v={shownVintage(i)} />
              <span class="row-side">
                {i.avg !== null ? (
                  <span class="row-score num">{i.avg}</span>
                ) : i.rated ? (
                  <span class="muted small">{t("{n} 人已评", { n: i.rated })}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {board.members.length > 0 && (
        <div class="member-faces">
          {board.members.map((m) => (
            <Initial key={m.id} name={m.name} picture={m.picture} />
          ))}
        </div>
      )}
      {item && <EveryoneSheet item={item} onTaste={() => setOpen(null)} onClose={() => setOpen(null)} />}
    </div>
  );
}
