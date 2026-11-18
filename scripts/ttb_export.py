"""Export American wine label approvals from TTB's public COLA registry.

TTB's search exports at most 1,000 rows at a time, so this searches by date range and
halves any range that holds more. It waits between requests. Run on GitHub Actions
(Actions -> Export TTB); the CSV goes to the private R2 bucket, not the repository.

  python3 scripts/ttb_export.py 2005-01-01 "" ttb.csv     # "" = up to today
  python3 scripts/ttb_export.py 2026-10-01 2026-10-03 x.csv --probe   # one search, printed
"""

import csv
import datetime as dt
import io
import re
import subprocess
import sys
import time
import urllib.request

import certifi
import requests
from bs4 import BeautifulSoup

BASE = "https://ttbonline.gov/colasonline/"
PAUSE = 2.0  # seconds between requests
STATES = {
    "ALABAMA", "ALASKA", "ARIZONA", "ARKANSAS", "CALIFORNIA", "COLORADO", "CONNECTICUT", "DELAWARE",
    "DISTRICT OF COLUMBIA", "FLORIDA", "GEORGIA", "HAWAII", "IDAHO", "ILLINOIS", "INDIANA", "IOWA",
    "KANSAS", "KENTUCKY", "LOUISIANA", "MAINE", "MARYLAND", "MASSACHUSETTS", "MICHIGAN", "MINNESOTA",
    "MISSISSIPPI", "MISSOURI", "MONTANA", "NEBRASKA", "NEVADA", "NEW HAMPSHIRE", "NEW JERSEY",
    "NEW MEXICO", "NEW YORK", "NORTH CAROLINA", "NORTH DAKOTA", "OHIO", "OKLAHOMA", "OREGON",
    "PENNSYLVANIA", "RHODE ISLAND", "SOUTH CAROLINA", "SOUTH DAKOTA", "TENNESSEE", "TEXAS", "UTAH",
    "VERMONT", "VIRGINIA", "WASHINGTON", "WEST VIRGINIA", "WISCONSIN", "WYOMING", "AMERICAN",
}

probe = "--probe" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]


def session():
    # ttbonline.gov does not send its intermediate certificate; add it to the trusted set.
    der = urllib.request.urlopen("http://crt.sectigo.com/EntrustOVTLSIssuingRSACA2.crt", timeout=30).read()
    pem = subprocess.run(["openssl", "x509", "-inform", "der"], input=der, capture_output=True, check=True).stdout
    open("ttb-ca.pem", "wb").write(open(certifi.where(), "rb").read() + b"\n" + pem)
    s = requests.Session()
    s.verify = "ttb-ca.pem"
    s.headers["User-Agent"] = "Mozilla/5.0 (personal wine journal; one-off public data load)"
    return s


s = session()


def get(url, **kw):
    time.sleep(PAUSE)
    for attempt in range(5):
        try:
            r = s.request("POST" if "data" in kw else "GET", BASE + url, timeout=120, **kw)
            if r.status_code == 200:
                return r
            print("HTTP", r.status_code, url, file=sys.stderr)
        except requests.RequestException as e:
            print("error", e, file=sys.stderr)
        time.sleep(30 * (attempt + 1))
    raise SystemExit(f"giving up on {url}")


form = BeautifulSoup(get("publicSearchColasAdvanced.do").text, "html.parser")
origins = [
    o["value"]
    for o in form.select('select[name="searchCriteria.originCodeArray"] option')
    if o.get("value") and o.text.rsplit(" - ", 1)[0].strip().upper() in STATES
]
wines = [
    o["value"]
    for o in form.select('select[name="searchCriteria.classTypeCodeArrayByCode"] option')
    if re.fullmatch(r"8\d\w?", o.get("value", ""))
]
print(len(origins), "origins;", len(wines), "wine classes:", " ".join(wines), file=sys.stderr)


def search(a, b):
    """Search one date range; return (count, response)."""
    data = [
        ("searchCriteria.dateCompletedFrom", a.strftime("%m/%d/%Y")),
        ("searchCriteria.dateCompletedTo", b.strftime("%m/%d/%Y")),
        ("searchCriteria.productOrFancifulName", ""),
        ("searchCriteria.productNameSearchType", "E"),
        ("searchCriteria.classTypeDesired", "code"),
    ]
    data += [("searchCriteria.classTypeCodeArrayByCode", c) for c in wines]
    data += [("searchCriteria.originCodeArray", c) for c in origins]
    r = get("publicSearchColasAdvancedProcess.do?action=search", data=data)
    text = BeautifulSoup(r.text, "html.parser").get_text(" ", strip=True)
    m = re.search(r"(?:Total Matching Records|of)\s*:?\s*([\d,]+)", text)
    n = int(m.group(1).replace(",", "")) if m else -1
    if probe:
        print("SEARCH", a, b, "->", n, file=sys.stderr)
        print(text[:3000], file=sys.stderr)
        soup = BeautifulSoup(r.text, "html.parser")
        for x in soup.find_all(onclick=True):
            print("  ONCLICK", x.name, x.get("onclick")[:300], x.get_text(" ", strip=True)[:50], file=sys.stderr)
        for sc in soup.find_all("script"):
            t = sc.string or ""
            for m in re.finditer(r".{0,200}(File|csv|save).{0,300}", t, re.I | re.S):
                print("  SCRIPT", sc.get("src"), m.group(0).replace("\n", " ")[:500], file=sys.stderr)
            if sc.get("src"):
                print("  SCRIPT SRC", sc.get("src"), file=sys.stderr)
    return n, r


def download(r):
    """Fetch the results page's "Save Search Results To File" CSV."""
    m = re.search(r"popup\('(publicSaveSearchResultsToFile\.do[^']*)'", r.text)
    if not m:
        raise SystemExit("no Save Search Results To File link on the results page")
    f = get(m.group(1).replace("&amp;", "&"))
    body = f.content.decode("utf-8-sig", errors="replace")
    if probe:
        print("SAVE", m.group(1), f.headers.get("content-type"), f.headers.get("content-disposition"), file=sys.stderr)
        print(body[:1500], file=sys.stderr)
    if body.lstrip().startswith("<"):
        raise SystemExit("the save link returned a page, not a CSV")
    return list(csv.reader(io.StringIO(body)))


def walk(a, b, out, seen):
    n, r = search(a, b)
    if n < 0:
        raise SystemExit(f"could not read the result count for {a}..{b}")
    if n == 0:
        return
    # The registry never reports more than 1,000 matches, so 1,000 means "maybe more": split.
    if n >= 1000 and a < b:
        mid = a + (b - a) // 2
        walk(a, mid, out, seen)
        walk(mid + dt.timedelta(days=1), b, out, seen)
        return
    rows = download(r)
    header, rows = rows[0], rows[1:]
    if not seen:
        out.writerow(header)
        seen.add("__header__")
    new = 0
    for row in rows:
        if row and row[0] not in seen:
            seen.add(row[0])
            out.writerow(row)
            new += 1
    print(f"{a}..{b}: {n} found, {len(rows)} exported, {new} new", file=sys.stderr, flush=True)
    if n >= 1000:
        print(f"  warning: {a} alone reaches the 1,000-row limit; some may be missing", file=sys.stderr)


start = dt.date.fromisoformat(args[0])
end = dt.date.fromisoformat(args[1]) if args[1] else dt.date.today()
path = args[2]
with open(path, "w", newline="") as f:
    seen = set()
    if probe:
        n, r = search(start, end)
        if 0 < n <= 1000:
            rows = download(r)
            print(len(rows) - 1, "rows; first:", rows[:3], file=sys.stderr)
    else:
        out = csv.writer(f)
        a = start
        while a <= end:  # month by month, so progress shows and each walk stays small
            b = min((a.replace(day=1) + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1), end)
            walk(a, b, out, seen)
            f.flush()
            a = b + dt.timedelta(days=1)
print(max(len(seen) - 1, 0), "records", file=sys.stderr)
if not probe and len(seen) < 2:
    raise SystemExit("nothing exported")
