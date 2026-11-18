import { useState } from "preact/hooks";
import { nameKey } from "../shared/model";

/**
 * A text field with our own list of suggestions under it. Used instead of <datalist>, which iPhone Safari
 * only shows now and then (in the keyboard bar, and only for some typed letters). Tapping the field shows
 * the whole list; typing narrows it (words starting with what was typed come first). Anything can still
 * be typed.
 */
export function SuggestInput(props: {
  value: string;
  options: readonly string[];
  onInput: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const q = nameKey(filter);
  const shown = (
    q
      ? props.options
          .map((o) => ({ o, k: nameKey(o) }))
          .filter((x) => x.k.includes(q))
          .sort((a, b) => Number(!a.k.startsWith(q)) - Number(!b.k.startsWith(q)))
          .map((x) => x.o)
      : [...props.options]
  ).slice(0, 60);
  const pick = (o: string) => {
    setOpen(false);
    props.onInput(o);
  };
  return (
    <div class="suggest">
      <input
        name={props.name}
        value={props.value}
        maxLength={props.maxLength ?? 80}
        placeholder={props.placeholder}
        autocomplete="off"
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setFilter(v);
          setOpen(true);
          props.onInput(v);
        }}
        onFocus={() => {
          setFilter("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && shown.length > 0 && !(shown.length === 1 && shown[0] === props.value) && (
        <ul class="suggestions scroll" data-no-pull>
          {shown.map((o) => (
            <li key={o}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
