import { useEffect, useRef, useState } from "preact/hooks";
import { type Me, NICKNAME_MAX, checkNickname } from "../shared/model";
import { Sheet } from "./components";
import { t, tm } from "./i18n";
import { ApiError, api, setMe, useStore } from "./store";

/**
 * 昵称和头像 (Ke Li 2026-11-18), the badminton site's way (Avatar.tsx there): the name and picture
 * others see in shared 品鉴, 朋友动态 and on 分享图. Opened by a tap on the card at the top of 我的.
 * Both need the network: they are not kept for later like notes are.
 */

/** A person's picture, or the first letter of their name. */
export function Face(props: { name: string; picture: string | null; size?: number; class?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = props.picture && failed !== props.picture ? props.picture : null;
  const style = props.size ? { width: `${props.size}px`, height: `${props.size}px` } : undefined;
  return (
    <span class={`avatar${props.class ? ` ${props.class}` : ""}`} style={style} aria-hidden="true">
      {src ? (
        <img src={src} alt="" referrerpolicy="no-referrer" onError={() => setFailed(src)} />
      ) : (
        <span>{props.name.trim()[0]?.toUpperCase() ?? "?"}</span>
      )}
    </span>
  );
}

/** The photo saved: a square this many pixels a side (sharp at the largest size shown, on 3× screens). */
export const AVATAR_SIDE = 256;
const QUALITY = 0.85;
/** The cropping square on screen, in CSS pixels. */
const VIEW = 260;
const MAX_ZOOM = 4;

const errorText = (e: unknown) => (e instanceof ApiError ? tm(e.message) : t("没有网络，请稍后再试"));

/** 编辑资料: 昵称 and 头像. */
export function ProfileSheet(props: { onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(f: () => Promise<{ me: Me }>): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      setMe((await f()).me);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function pick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // the same photo can be picked again
    if (!file) return;
    try {
      setPhoto(await createImageBitmap(file, { imageOrientation: "from-image" }));
      setError("");
    } catch {
      setError(t("这张照片打不开，请换一张"));
    }
  }
  const close = () => {
    photo?.close();
    setPhoto(null);
  };
  if (photo)
    return (
      <Sheet title={t("头像")} onClose={close}>
        <Cropper
          photo={photo}
          busy={busy}
          error={error}
          onCancel={close}
          onSave={async (image) => {
            if (await run(() => api<{ me: Me }>("/api/me/avatar", { body: { image } }))) close();
          }}
        />
      </Sheet>
    );
  const mode = (m: "google" | "none") => run(() => api<{ me: Me }>("/api/me/avatar/mode", { body: { mode: m } }));
  return (
    <Sheet title={t("编辑资料")} onClose={props.onClose}>
      <div class="profile-sheet">
        <div class="avatar-form">
          <Face name={me.name ?? me.email} picture={me.picture} size={88} />
          <p class="muted small">
            {me.avatarMode === "own"
              ? t("用的是你上传的照片。")
              : me.avatarMode === "none"
                ? t("现在不显示头像。")
                : me.googlePicture
                  ? t("现在用的是 Google 账号的头像。")
                  : t("还没有头像。")}
          </p>
          <div class="avatar-actions">
            <label class={`button small${busy ? " disabled" : ""}`}>
              {me.avatarMode === "own" ? t("换一张照片") : t("上传照片")}
              <input type="file" accept="image/*" hidden disabled={busy} onChange={pick} />
            </label>
            {me.googlePicture && me.avatarMode !== "google" && (
              <button type="button" class="button small" disabled={busy} onClick={() => mode("google")}>
                {t("用 Google 头像")}
              </button>
            )}
            {me.avatarMode !== "none" && (me.avatarMode === "own" || me.googlePicture) && (
              <button type="button" class="button small" disabled={busy} onClick={() => mode("none")}>
                {t("不用头像")}
              </button>
            )}
          </div>
        </div>
        <NameForm me={me} busy={busy} run={run} />
        {error && (
          <p class="notice" role="alert">
            {error}
          </p>
        )}
        <p class="muted small">{t("昵称和头像会显示在一起品鉴的朋友那里、朋友动态和分享图上。")}</p>
      </div>
    </Sheet>
  );
}

function NameForm(props: { me: Me; busy: boolean; run: (f: () => Promise<{ me: Me }>) => Promise<boolean> }) {
  const { me } = props;
  const [name, setName] = useState(me.nickname ?? me.googleName ?? "");
  const [saved, setSaved] = useState(false);
  const typed = name.trim();
  // Saving the Google name as is means "no nickname": it then follows Google again.
  const value = typed === (me.googleName ?? "").trim() ? "" : typed;
  const changed = value !== (me.nickname ?? "");
  const problem = value ? checkNickname(value) : null;
  async function save(e: Event) {
    e.preventDefault();
    if (!changed || problem) return;
    if (await props.run(() => api<{ me: Me }>("/api/me/name", { body: { name: value } }))) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }
  return (
    <form class="form" onSubmit={save}>
      <div class="field">
        <label class="field-label" for="nickname">
          {t("昵称")}
        </label>
        <div class="nick-row">
          <input
            id="nickname"
            value={name}
            maxLength={NICKNAME_MAX + 10}
            autocomplete="nickname"
            placeholder={me.googleName ?? me.email.split("@")[0]}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="button primary" disabled={props.busy || !changed || !!problem}>
            {saved ? t("已保存") : t("保存")}
          </button>
        </div>
        {problem ? (
          <span class="field-hint bad">{tm(problem)}</span>
        ) : (
          <span class="field-hint">
            {me.googleName
              ? t("留空就用 Google 账号的名字（{name}）。", { name: me.googleName })
              : t("留空就用邮箱的前半段。")}
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * Move and zoom the photo inside the circle (drag, pinch, wheel or the slider), then 保存: the
 * square behind the circle is drawn at AVATAR_SIDE and sent as JPEG, about 10-20 KB.
 */
function Cropper(props: {
  photo: ImageBitmap;
  busy: boolean;
  error: string;
  onSave: (base64: string) => void;
  onCancel: () => void;
}) {
  const { photo } = props;
  const fit = VIEW / Math.min(photo.width, photo.height);
  // The photo's top-left corner in the square, and its scale (screen px per photo px).
  const [view, setView] = useState(() => ({
    scale: fit,
    x: (VIEW - photo.width * fit) / 2,
    y: (VIEW - photo.height * fit) / 2,
  }));
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  /** Keeps the square covered: no empty edge shows. */
  const clamp = (v: { scale: number; x: number; y: number }) => {
    const scale = Math.min(Math.max(v.scale, fit), fit * MAX_ZOOM);
    const w = photo.width * scale,
      h = photo.height * scale;
    return { scale, x: Math.min(0, Math.max(VIEW - w, v.x)), y: Math.min(0, Math.max(VIEW - h, v.y)) };
  };
  /** Zoom around a point of the square (its centre for the slider). */
  const zoomTo = (scale: number, cx = VIEW / 2, cy = VIEW / 2) =>
    setView((v) => {
      const k = Math.min(Math.max(scale, fit), fit * MAX_ZOOM) / v.scale;
      return clamp({ scale: v.scale * k, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
    });

  useEffect(() => {
    const c = canvas.current!;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = VIEW * dpr;
    c.height = VIEW * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, VIEW, VIEW);
    g.imageSmoothingQuality = "high";
    g.drawImage(photo, view.x, view.y, photo.width * view.scale, photo.height * view.scale);
  }, [photo, view]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * VIEW) / r.width, y: ((e.clientY - r.top) * VIEW) / r.height };
  };
  function down(e: PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
  }
  function move(e: PointerEvent) {
    const p = pointers.current;
    const before = p.get(e.pointerId);
    if (!before) return;
    const now = local(e);
    if (p.size === 1) {
      setView((v) => clamp({ ...v, x: v.x + now.x - before.x, y: v.y + now.y - before.y }));
    } else if (p.size === 2) {
      const other = [...p.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(before.x - other.x, before.y - other.y);
      const d1 = Math.hypot(now.x - other.x, now.y - other.y);
      if (d0 > 0) zoomTo(view.scale * (d1 / d0), (now.x + other.x) / 2, (now.y + other.y) / 2);
    }
    p.set(e.pointerId, now);
  }
  const up = (e: PointerEvent) => pointers.current.delete(e.pointerId);

  function save() {
    const out = document.createElement("canvas");
    out.width = AVATAR_SIDE;
    out.height = AVATAR_SIDE;
    const g = out.getContext("2d")!;
    // JPEG has no transparency: a see-through PNG gets white behind it, not black.
    g.fillStyle = "#fff";
    g.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE);
    g.imageSmoothingQuality = "high";
    const side = VIEW / view.scale;
    g.drawImage(photo, -view.x / view.scale, -view.y / view.scale, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
    const url = out.toDataURL("image/jpeg", QUALITY);
    props.onSave(url.slice(url.indexOf(",") + 1));
  }

  return (
    <div class="avatar-crop" data-no-pull>
      <div class="crop-frame" style={{ width: `${VIEW}px`, height: `${VIEW}px` }}>
        <canvas
          ref={canvas}
          style={{ width: `${VIEW}px`, height: `${VIEW}px` }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={(e) => {
            e.preventDefault();
            const p = local(e);
            zoomTo(view.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y);
          }}
        />
        <span class="crop-ring" aria-hidden="true" />
      </div>
      <input
        type="range"
        class="crop-zoom"
        aria-label={t("缩放")}
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={view.scale / fit}
        onInput={(e) => zoomTo(fit * Number((e.target as HTMLInputElement).value))}
      />
      {props.error && (
        <p class="notice" role="alert">
          {props.error}
        </p>
      )}
      <div class="avatar-actions">
        <button type="button" class="button primary" disabled={props.busy} onClick={save}>
          {props.busy ? t("保存中…") : t("保存")}
        </button>
        <button type="button" class="button" disabled={props.busy} onClick={props.onCancel}>
          {t("取消")}
        </button>
      </div>
    </div>
  );
}
