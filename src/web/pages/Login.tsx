import { useState } from "preact/hooks";
import type { Me } from "../../shared/model";
import { LangSwitch } from "../LangSwitch";
import { LegalLinks } from "../LegalLinks";
import { Logo } from "../Logo";
import { t, tk } from "../i18n";
import { api, getState, unsentCount } from "../store";

export const inWeChat = () => /MicroMessenger/i.test(navigator.userAgent);
export const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** What the app does, for someone (or Google's sign-in review) seeing it for the first time. */
const FEATURES = [
  tk("拍一下酒标，自动认出酒庄、酒名和年份"),
  tk("用大白话一步步带你看颜色、闻香气、尝口感，记下自己的评分"),
  tk("和朋友一起品鉴，先各自打分再对比；还能对照专业评价"),
  tk("管理酒窖，到了适饮期提醒你"),
];

const ERRORS: Record<string, string> = {
  disabled: tk("这个账号已被停用。"),
  not_configured: tk("Google 登录还没有开通。"),
  cancelled: tk("登录已取消。"),
  invalid_state: tk("登录超时了，请再试一次。"),
  failed: tk("登录失败，请再试一次。"),
};

export function Login(props: { session: { google: boolean; dev: boolean; me: Me | null } | null }) {
  const error = new URLSearchParams(location.search).get("error");
  const [email, setEmail] = useState("");
  const wechat = inWeChat();
  const devLogin = async (e: Event) => {
    e.preventDefault();
    await api("/api/auth/dev", { body: { email } });
    location.href = "/";
  };
  return (
    <div class="login">
      <div class="login-top">
        <LangSwitch />
      </div>
      <div class="login-hero">
        <div class="login-glasses" aria-hidden="true">
          {["#ece9a8", "#e8d27a", "#ea9878", "#a4243b", "#6b1d48"].map((c) => (
            <span
              key={c}
              class="glass"
              style={{
                background: `radial-gradient(circle, ${c} 0 50%, color-mix(in srgb, ${c} 60%, #fff) 72%, transparent 100%)`,
              }}
            />
          ))}
        </div>
        <div class="lockup">
          <Logo size={56} />
          <h1 class="brand">{t("品酒日记")}</h1>
        </div>
        <p class="lead">{t("在酒庄 30 秒记下一款酒，回家后随时都能搜到。不懂品酒术语也能上手。")}</p>
      </div>
      {unsentCount(getState()) > 0 && (
        <p class="notice" role="status">
          {t("这部手机上还有 {n} 条记录没上传。登录过期了，重新登录后会自动上传。", {
            n: unsentCount(getState()),
          })}
        </p>
      )}
      {error && ERRORS[error] && (
        <p class="notice" role="alert">
          {t(ERRORS[error]!)}
        </p>
      )}
      {wechat ? (
        <div class="notice">
          <strong>{t("微信里不能用 Google 登录")}</strong>
          <br />
          {isIos() ? t("点右上角「⋯」，选「在 Safari 中打开」") : t("点右上角「⋯」，选「在浏览器打开」")}
        </div>
      ) : (
        <a class="button primary big" href="/api/auth/google">
          {t("用 Google 登录")}
        </a>
      )}
      {props.session && !props.session.google && !props.session.dev && (
        <p class="muted center">{t("Google 登录还没有开通。")}</p>
      )}
      {props.session?.dev && (
        <form class="dev-login" onSubmit={devLogin}>
          <input
            type="email"
            placeholder="email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="button">
            Dev login
          </button>
        </form>
      )}
      <p class="muted center small">{t("任何 Google 账号都能注册。新用户有时要等站长审核，审核前也能正常记录。")}</p>
      <ul class="login-features">
        {FEATURES.map((f) => (
          <li key={f}>{t(f)}</li>
        ))}
      </ul>
      <p class="muted small">
        {t("用 Google 登录只用来确认你是谁：网站只会拿到你的姓名、邮箱和头像，用来建立账号、显示你的名字。")}
      </p>
      <LegalLinks />
    </div>
  );
}
