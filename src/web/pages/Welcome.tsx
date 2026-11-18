import type { Depth } from "../../shared/model";
import { LangSwitch } from "../LangSwitch";
import { DEPTH_INFO } from "../depths";
import { t, tk } from "../i18n";
import { updateMe } from "../store";

const OPTIONS: { depth: Depth; answer: string }[] = [
  { depth: "beginner", answer: tk("刚开始认真喝，想学怎么品") },
  { depth: "standard", answer: tk("喝过不少，想有个体系") },
  { depth: "expert", answer: tk("老手，要完整的品鉴表") },
  { depth: "quick", answer: tk("只想快速记个分") },
];

/** First sign-in: 「你平时怎么喝酒？」 picks the default depth (docs/design.zh.md §3.4). */
export function Welcome() {
  return (
    <div class="welcome">
      <div class="login-top">
        <LangSwitch />
      </div>
      <h1 class="brand">{t("你平时怎么喝酒？")}</h1>
      <p class="lead">{t("选一个最像你的。以后每款酒都能临时换深度，也可以在「我的」里改。")}</p>
      <div class="depth-cards">
        {OPTIONS.map((o) => (
          <button key={o.depth} type="button" class="depth-card" onClick={() => updateMe({ depth: o.depth })}>
            <strong>{t(o.answer)}</strong>
            <span>
              {t(DEPTH_INFO[o.depth].name)} · {t(DEPTH_INFO[o.depth].who)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
