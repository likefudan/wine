#!/usr/bin/env python3
"""Turns the LWIN spreadsheet (https://www.liv-ex.com/lwin/get-lwin-database) into SQL for D1.

    python3 scripts/lwin_import.py LWINdatabase.xlsx lwin.sql      # needs: pip install openpyxl
    npx wrangler d1 execute DB --remote [--env staging] --file lwin.sql

The SQL empties the lwin tables first, so loading a newer spreadsheet replaces the old one. Only live
wines are kept (no spirits, beer or cider). Search words come from the producer, the wine and its
appellation, made the way src/shared/model.ts nameKey() makes them, minus filler words, so the
Worker's search finds them.
"""
import re
import sys
import unicodedata

import openpyxl

# The same filler words as NOISE in src/shared/model.ts.
NOISE = {"winery", "wines", "wine", "vineyard", "vineyards", "cellar", "cellars", "estate", "estates",
         "domaine", "chateau", "bodega", "bodegas", "cantina", "weingut", "tenuta", "the", "de", "du", "la", "le"}


def name_key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not ("̀" <= c <= "ͯ")).lower()
    s = s.replace("&", " and ")
    s = re.sub(r"['’`]", "", s)
    s = re.sub(r"[\W_]+", " ", s)
    return " ".join(s.split())


def words(*names: str) -> set[str]:
    out = set()
    for n in names:
        for w in name_key(n).split():
            if w not in NOISE and len(w) >= 2:
                out.add(w)
    return out


def na(v):
    return None if v in (None, "", "NA") else str(v).strip()


def color(colour, typ, sub):
    if sub == "Sparkling":
        return "sparkling"
    if typ == "Fortified Wine" or sub in ("Sweet", "Port", "Sherry", "Madeira"):
        return "dessert"
    return {"Red": "red", "White": "white", "Rose": "rose"}.get(colour)


def q(v):
    return "NULL" if v is None else "'" + v.replace("'", "''") + "'"


def main(src: str, dst: str) -> None:
    ws = openpyxl.load_workbook(src, read_only=True).active
    rows = ws.iter_rows(values_only=True)
    head = next(rows)
    n = 0
    with open(dst, "w", encoding="utf-8") as out:
        out.write("DELETE FROM lwin_words;\nDELETE FROM lwin;\n")
        lw, ww = [], []

        def flush():
            if lw:
                out.write("INSERT INTO lwin VALUES " + ",".join(lw) + ";\n")
                lw.clear()
            if ww:
                out.write("INSERT OR IGNORE INTO lwin_words VALUES " + ",".join(ww) + ";\n")
                ww.clear()

        for r in rows:
            d = dict(zip(head, r))
            if d["STATUS"] != "Live" or d["TYPE"] not in ("Wine", "Fortified Wine"):
                continue
            code = int(d["LWIN"])
            producer = " ".join(x for x in (na(d["PRODUCER_TITLE"]), na(d["PRODUCER_NAME"])) if x)
            if not producer:
                continue
            wine = na(d["WINE"]) or producer
            appellation = na(d["SUB_REGION"])
            lw.append("(" + ",".join([str(code), q(producer[:120]), q(wine[:160]),
                                      q(color(d["COLOUR"], d["TYPE"], d["SUB_TYPE"])), q(na(d["COUNTRY"])),
                                      q(na(d["REGION"])), q(appellation), q(na(d["CLASSIFICATION"]))]) + ")")
            for w in words(producer, wine if wine != producer else "", appellation or ""):
                ww.append(f"({q(w)},{code})")
            n += 1
            if len(lw) >= 200 or len(ww) >= 800:
                flush()
        flush()
    print(f"{n} wines -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
