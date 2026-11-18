/**
 * 我 vs 专业 (docs/design.zh.md §3.5, §3.7): my aroma tags on a wine set against the ones the shared
 * pro lookup found. Ids from the one vocabulary (descriptors.ts), so the language I tagged in does
 * not matter. No right or wrong: the page says what we both found, what the reviews mention that I
 * didn't note (with a "close" when I noted another word of the same family), and what only I found.
 */
import { DESCRIPTOR_BY_ID } from "./descriptors";

export interface Versus {
  /** Both of us. */
  both: string[];
  /** In the reviews, not in my notes; `near` is a word of mine from the same family. */
  missed: { id: string; near: string | null }[];
  /** Only in my notes. */
  mine: string[];
}

export function versus(myIds: Iterable<string>, proIds: readonly string[]): Versus {
  const mine = [...new Set(myIds)].filter((id) => DESCRIPTOR_BY_ID.has(id));
  const pro = [...new Set(proIds)].filter((id) => DESCRIPTOR_BY_ID.has(id));
  const mineSet = new Set(mine);
  const proSet = new Set(pro);
  const family = (id: string) => DESCRIPTOR_BY_ID.get(id)!.family;
  const onlyMine = mine.filter((id) => !proSet.has(id));
  return {
    both: pro.filter((id) => mineSet.has(id)),
    missed: pro
      .filter((id) => !mineSet.has(id))
      .map((id) => ({ id, near: onlyMine.find((m) => family(m) === family(id)) ?? null })),
    mine: onlyMine,
  };
}
