#!/usr/bin/env python3
"""Turns the TTB export (scripts/ttb_export.py) into SQL for D1, next to LWIN in the same tables.

    python3 scripts/ttb_import.py ttb.csv ttb.sql [LWIN.csv]

TTB rows get negative ids in the lwin table, so they never mix with real LWIN codes (the app only
keeps a positive one on a wine). The SQL replaces earlier TTB rows and leaves LWIN alone. Each brand
and fanciful name is kept once, as its latest approval, and skipped when LWIN (the CSV export of the
LWIN spreadsheet, optional) already has that producer and wine. Flavoured, fruit and honey wines are
left out.
"""
import csv
import re
import sys

from lwin_import import NOISE, name_key, q, words

# TTB class/type codes kept, and the colour each one means.
COLORS = {
    "80": "red",  # TABLE RED WINE
    "80A": "rose",  # ROSE WINE
    "81": "white",  # TABLE WHITE WINE
    "84": "sparkling",  # SPARKLING WINE/CHAMPAGNE
    "85": "sparkling",  # CARBONATED WINE
    "86": "dessert",  # DESSERT RED/WHITE/ROSE (TTB's own grouping)
    "88": "dessert",  # DESSERT /PORT/SHERRY/(COOKING) WINE
}
SMALL = {"and", "of", "the", "de", "du", "la", "le", "di", "del", "von", "van", "y", "et"}
KEEP_UPPER = {"llc", "inc", "usa", "ii", "iii", "iv", "ava", "nv"}


def title(s: str) -> str:
    """OLD OAKS WINERY -> Old Oaks Winery; SHANNON'S BLEND -> Shannon's Blend."""
    out = []
    for i, w in enumerate(s.strip().lower().split()):
        if w in KEEP_UPPER:
            out.append(w.upper())
        elif i and w in SMALL:
            out.append(w)
        else:
            out.append(re.sub(r"(^|[-/(.])([a-z])", lambda m: m.group(1) + m.group(2).upper(), w))
    return " ".join(out)


def key(producer: str, wine: str) -> str:
    p = " ".join(x for x in name_key(producer).split() if x not in NOISE) or name_key(producer)
    return f"{p}|{name_key(wine)}"


def main(src: str, dst: str, lwin_csv: str | None) -> None:
    known = set()
    if lwin_csv:
        for r in csv.DictReader(open(lwin_csv, encoding="utf-8")):
            if r["STATUS"] == "Live":
                producer = " ".join(x for x in (r["PRODUCER_TITLE"], r["PRODUCER_NAME"]) if x and x != "NA")
                wine = r["WINE"] if r["WINE"] not in ("", "NA") else producer
                known.add(key(producer, wine))
    latest = {}
    for r in csv.DictReader(open(src, encoding="utf-8-sig")):
        color = COLORS.get(r["Class/Type"].strip())
        brand = r["Brand Name"].strip()
        if not color or not brand:
            continue
        producer = title(brand)
        wine = title(r["Fanciful Name"]) or producer
        k = key(producer, wine)
        date = r["Completed Date"][6:] + r["Completed Date"][:2] + r["Completed Date"][3:5]
        if k not in latest or date >= latest[k][0]:
            latest[k] = (date, producer[:120], wine[:160], color, title(r["Origin Desc"]))
    rows = [v for k, v in latest.items() if k not in known]
    rows.sort(key=lambda v: (v[1], v[2]))
    with open(dst, "w", encoding="utf-8") as out:
        out.write("DELETE FROM lwin_words WHERE lwin < 0;\nDELETE FROM lwin WHERE lwin < 0;\n")
        lw, ww = [], []

        def flush():
            if lw:
                out.write("INSERT INTO lwin VALUES " + ",".join(lw) + ";\n")
                lw.clear()
            if ww:
                out.write("INSERT OR IGNORE INTO lwin_words VALUES " + ",".join(ww) + ";\n")
                ww.clear()

        for i, (_, producer, wine, color, state) in enumerate(rows, 1):
            region = None if state == "American" else state
            lw.append(f"({-i},{q(producer)},{q(wine)},{q(color)},'USA',{q(region)},NULL,NULL)")
            for w in words(producer, wine if wine != producer else ""):
                ww.append(f"({q(w)},{-i})")
            if len(lw) >= 200 or len(ww) >= 800:
                flush()
        flush()
    print(f"{len(latest)} TTB wines, {len(latest) - len(rows)} already in LWIN, {len(rows)} -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
