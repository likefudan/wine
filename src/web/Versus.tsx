import { DESCRIPTOR_BY_ID, FAMILIES } from "../shared/descriptors";
import { versus } from "../shared/versus";
import { p, t } from "./i18n";
import { saveTasting, useStore } from "./store";

/**
 * 我 vs 专业 under the shared pro lookup: which of its aromas I also noted, which I didn't (with the
 * everyday hint, and "close" when I noted a word of the same family), and which only I found. Only
 * the shared, checked lookup takes part, never what someone pasted back from their own AI. Nothing is
 * marked right or wrong; "找到了" after smelling again adds the word to my latest note on this wine,
 * and the row stays where it is with the button pressed, so a mistaken tap is taken back by tapping
 * again. Only words added here can be taken back here: ones noted on the tasting form are not touched.
 */
/** `tastingId:descriptorId` of the words added with 找到了 since the page was opened. */
const foundHere = new Set<string>();

export function AromaVersus(props: { vintageId: string; pro: string[] }) {
  const tastings = useStore((s) => s.tastings.filter((x) => x.vintageId === props.vintageId));
  if (!props.pro.length) return null;
  const latest = [...tastings].sort((a, b) => b.tastedAt.localeCompare(a.tastedAt))[0];
  const v = versus(
    tastings.flatMap((x) => x.descriptors.map((d) => d.id)),
    props.pro,
  );
  const name = (id: string) => p(DESCRIPTOR_BY_ID.get(id)!.name);
  const familyName = (id: string) => {
    const f = FAMILIES.find((x) => x.id === DESCRIPTOR_BY_ID.get(id)!.family);
    return f ? p(f.name) : "";
  };
  const isFound = (id: string) =>
    !!latest && foundHere.has(`${latest.id}:${id}`) && latest.descriptors.some((d) => d.id === id);
  const toggle = (id: string) => {
    if (!latest) return;
    const key = `${latest.id}:${id}`;
    if (isFound(id)) {
      foundHere.delete(key);
      saveTasting({ ...latest, descriptors: latest.descriptors.filter((d) => d.id !== id), location: undefined });
    } else if (!latest.descriptors.some((d) => d.id === id)) {
      foundHere.add(key);
      saveTasting({ ...latest, descriptors: [...latest.descriptors, { id, intensity: 1 }], location: undefined });
    }
  };
  // Words found here keep their row, in the reviews' order, instead of jumping up to the chips.
  const both = v.both.filter((id) => !isFound(id));
  const missedById = new Map(v.missed.map((m) => [m.id, m]));
  const rows = [...new Set(props.pro)]
    .filter((id) => missedById.has(id) || isFound(id))
    .map((id) => missedById.get(id) ?? { id, near: null });
  const noted = v.both.length + v.mine.length > 0;
  return (
    <div class="pro-card versus">
      <h3 class="versus-title">{t("我 vs 专业")}</h3>
      <p class="small">
        {noted
          ? t("酒评里提到 {n} 种香气，你也记下了 {k} 种。", { n: props.pro.length, k: v.both.length })
          : t("你还没记香气。酒评里提到了这些，拿起杯子闻闻看，找到了就点一下。")}
      </p>
      {both.length > 0 && (
        <>
          <p class="versus-label small">{t("都闻到了")}</p>
          <div class="chips">
            {both.map((id) => (
              <span key={id} class="chip static on">
                ✓ {name(id)}
              </span>
            ))}
          </div>
        </>
      )}
      {rows.length > 0 && (
        <>
          {noted && <p class="versus-label small">{t("酒评里有，你没记的")}</p>}
          <ul class="versus-missed">
            {rows.map((m) => {
              const on = isFound(m.id);
              const hint = DESCRIPTOR_BY_ID.get(m.id)!.hint;
              return (
                <li key={m.id}>
                  <span class="versus-word">
                    <strong>{name(m.id)}</strong>
                    {hint && <span class="muted small">{p(hint)}</span>}
                    {m.near && (
                      <span class="hint">
                        {t("你记了{near}，都属于{family}，方向是对的。", {
                          near: name(m.near),
                          family: familyName(m.id),
                        })}
                      </span>
                    )}
                  </span>
                  {latest && (
                    <button
                      type="button"
                      class={`button small${on ? " on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggle(m.id)}
                    >
                      {on && "✓ "}
                      {t("找到了")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {v.mine.length > 0 && (
        <>
          <p class="versus-label small">{t("只有你闻到的")}</p>
          <div class="chips">
            {v.mine.map((id) => (
              <span key={id} class="chip static">
                {name(id)}
              </span>
            ))}
          </div>
        </>
      )}
      <p class="small muted">{t("没有对错：每个人的鼻子不一样，酒在杯里也会变。评论家写下的只是他们闻到的那几样。")}</p>
    </div>
  );
}
