import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { PlaceDetails, PlaceKind, PlaceSuggestion } from "../shared/model";
import { t } from "./i18n";
import { api } from "./store";

const newSession = () =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();

/**
 * A text field with Google Places suggestions as you type (through our server; see worker/places.ts),
 * as jaysbadminton's address field does. Picking one hands back its name, address and position.
 * Offline, before the account is approved, or without a Google key it is a plain text field.
 */
export function PlaceInput(props: {
  label: ComponentChildren;
  value: string;
  placeholder?: string;
  maxLength?: number;
  /** What to look for first. */
  kind?: PlaceKind;
  /** false: a plain text field (a home's name). */
  suggest?: boolean;
  onInput: (v: string) => void;
  onPlace: (p: PlaceDetails) => void;
}) {
  const [list, setList] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const typed = useRef(false);
  // One Google billing session per place picked: keystrokes plus the final lookup.
  const session = useRef(newSession());
  const cache = useRef(new Map<string, PlaceSuggestion[]>());
  const kind = props.kind ?? "winery";

  useEffect(() => {
    const q = props.value.trim();
    if (!typed.current || props.suggest === false || q.length < 3 || !navigator.onLine) {
      setList([]);
      setSearching(false);
      return;
    }
    const ck = `${kind}|${q.toLowerCase()}`;
    const hit = cache.current.get(ck);
    if (hit) {
      setList(hit);
      setOpen(hit.length > 0);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api<{ places: PlaceSuggestion[] }>(
          `/api/places?q=${encodeURIComponent(q)}&t=${kind}&s=${session.current}`,
        );
        cache.current.set(ck, r.places);
        if (!live) return;
        setList(r.places);
        setOpen(r.places.length > 0);
      } catch {
        // offline or the lookup failed: the field still works as plain text
      } finally {
        if (live) setSearching(false);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [props.value, kind, props.suggest]);

  async function pick(s: PlaceSuggestion) {
    typed.current = false;
    setOpen(false);
    props.onInput(s.name);
    const r = await api<{ place: PlaceDetails | null }>(
      `/api/places/${encodeURIComponent(s.id)}?s=${session.current}`,
    ).catch(() => null);
    if (r?.place) props.onPlace(r.place);
    session.current = newSession();
  }

  return (
    <label class="field suggest">
      <span class="field-label">
        {props.label}
        {searching && <em class="searching"> {t("搜索中…")}</em>}
      </span>
      <input
        value={props.value}
        maxLength={props.maxLength ?? 120}
        placeholder={props.placeholder}
        onInput={(e) => {
          typed.current = true;
          props.onInput((e.target as HTMLInputElement).value);
        }}
        onFocus={() => setOpen(list.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul class="suggestions">
          {list.map((s) => (
            <li key={s.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                <strong>{s.name}</strong>
                <span>{s.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}

/** Google Maps for a place: by its Places id when it has one, else by name. */
export const mapsUrl = (name: string, id: string | null) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}${id ? `&query_place_id=${encodeURIComponent(id)}` : ""}`;
