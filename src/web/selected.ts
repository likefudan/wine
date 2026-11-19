import { createContext } from "preact";
import { useContext } from "preact/hooks";

/**
 * The open book (book.tsx): the id of what the right page shows (a 品鉴, a wine, a glass in a 品鉴),
 * so the left page's list can mark it. Null on a phone, where there is one page.
 */
export const Selected = createContext<string | null>(null);
export const useSelected = () => useContext(Selected);
