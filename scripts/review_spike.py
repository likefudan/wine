"""Pro-review source spike (design doc 3.2): can we read Wine-Searcher / CellarTracker, and what does
Claude web search find, for ~20 common Napa wines? Runs once on GitHub Actions (Actions -> Review spike).

Polite by design: one wine at a time, a pause of several seconds between requests to the same site,
two pages per wine per site at most. It writes spike/results.json and spike/pages.tar.gz.

    python3 scripts/review_spike.py out_dir
"""

import io
import json
import os
import re
import sys
import tarfile
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote_plus

import anthropic
import requests

AZURE_HOST = "https://happy-badminton-jay-main-1.openai.azure.com"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
)
PAUSE = 6  # seconds between requests to the same site

WINES = [
    ("Opus One", "Opus One", 2019),
    ("Caymus Vineyards", "Cabernet Sauvignon Napa Valley", 2021),
    ("Silver Oak", "Napa Valley Cabernet Sauvignon", 2018),
    ("Stag's Leap Wine Cellars", "Cask 23 Cabernet Sauvignon", 2019),
    ("Joseph Phelps", "Insignia", 2019),
    ("Silverado Vineyards", "Estate Cabernet Sauvignon", 2019),
    ("The Hess Collection", "Mount Veeder Cabernet Sauvignon", 2019),
    ("Pine Ridge", "Stags Leap District Cabernet Sauvignon", 2019),
    ("Shafer", "Hillside Select Cabernet Sauvignon", 2018),
    ("Duckhorn", "Napa Valley Merlot", 2020),
    ("Frog's Leap", "Napa Valley Cabernet Sauvignon", 2019),
    ("Robert Mondavi", "To Kalon Reserve Cabernet Sauvignon", 2018),
    ("Heitz Cellar", "Martha's Vineyard Cabernet Sauvignon", 2016),
    ("Chateau Montelena", "Napa Valley Chardonnay", 2020),
    ("Far Niente", "Cabernet Sauvignon Oakville", 2019),
    ("Cakebread Cellars", "Napa Valley Chardonnay", 2021),
    ("Quintessa", "Quintessa", 2019),
    ("Dominus Estate", "Dominus", 2019),
    ("Spottswoode", "Estate Cabernet Sauvignon", 2019),
    ("Faust", "Napa Valley Cabernet Sauvignon", 2020),
    ("Chateau Lynch-Bages", "Pauillac", 2016),
    ("Chateau Montrose", "Saint-Estephe", 2015),
]

BLOCK_MARKERS = [
    "px-captcha", "perimeterx", "press & hold", "access to this page has been denied",
    "cf-chl", "just a moment", "attention required", "captcha", "are you a robot",
    "unusual traffic", "request blocked", "access denied",
]


def ws_url(producer: str, name: str, vintage: int) -> str:
    q = f"{producer} {name}" if producer.lower() not in name.lower() else name
    slug = re.sub(r"[^a-z0-9]+", "+", q.lower().replace("'", "")).strip("+")
    return f"https://www.wine-searcher.com/find/{slug}/{vintage}"


def ct_search_url(producer: str, name: str, vintage: int) -> str:
    q = f"{producer} {name} {vintage}" if producer.lower() not in name.lower() else f"{name} {vintage}"
    return f"https://www.cellartracker.com/list.asp?Table=List&iUserOverride=0&szSearch={quote_plus(q)}"


def fetch(url: str, pages: dict, key: str) -> dict:
    t0 = time.time()
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9",
                                       "Accept": "text/html,application/xhtml+xml"}, timeout=25)
        html = r.text
        pages[key] = html
        low = html.lower()
        title = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
        return {
            "url": url, "final_url": r.url, "status": r.status_code, "bytes": len(html),
            "ms": int((time.time() - t0) * 1000),
            "title": (title.group(1).strip()[:160] if title else None),
            "block_markers": [m for m in BLOCK_MARKERS if m in low],
            "server": r.headers.get("server"),
        }
    except Exception as e:  # noqa: BLE001 - recorded, not raised
        return {"url": url, "error": repr(e)[:300], "ms": int((time.time() - t0) * 1000)}


def parse_ws(html: str) -> dict:
    out: dict = {"jsonld_types": [], "scores_100": [], "avg_price": None}
    for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(m.group(1))
        except Exception:  # noqa: BLE001
            continue
        for d in data if isinstance(data, list) else [data]:
            if isinstance(d, dict):
                out["jsonld_types"].append(d.get("@type"))
                if d.get("aggregateRating"):
                    out["aggregate_rating"] = d["aggregateRating"]
                if d.get("offers"):
                    o = d["offers"]
                    out["offers"] = {k: o.get(k) for k in ("lowPrice", "highPrice", "price", "priceCurrency", "offerCount")} if isinstance(o, dict) else str(o)[:200]
    out["scores_100"] = sorted(set(re.findall(r"\b(\d{2,3})\s*/\s*100\b", html)))[:20]
    m = re.search(r"Avg\.?\s*Price[^$]{0,200}\$\s?([\d,]+)", html, re.I | re.S)
    if m:
        out["avg_price"] = m.group(1)
    out["critic_names"] = [c for c in ("Robert Parker", "Wine Advocate", "Wine Spectator", "James Suckling",
                                       "Vinous", "Wine Enthusiast", "Jeb Dunnuck", "Decanter")
                           if c.lower() in html.lower()]
    return out


def parse_ct_search(html: str) -> dict:
    ids = re.findall(r"wine\.asp\?iWine=(\d+)", html)
    login = bool(re.search(r"(sign in|log in|password)", html, re.I)) and not ids
    return {"wine_ids": list(dict.fromkeys(ids))[:5], "looks_like_login": login}


def parse_ct_wine(html: str) -> dict:
    out: dict = {}
    m = re.search(r"avg\.?\s*([\d.]+)\s*pts?\.?.{0,80}?(\d+)\s*(?:notes|community)", html, re.I | re.S)
    if m:
        out["community_avg"], out["community_n"] = m.group(1), m.group(2)
    m = re.search(r"Community Tasting Notes.{0,120}", html, re.I | re.S)
    if m:
        out["ctn_snippet"] = re.sub(r"<[^>]+>", " ", m.group(0))[:160]
    out["scores_any"] = sorted(set(re.findall(r"\b(\d{2}(?:\.\d)?)\s*(?:pts|points)\b", html, re.I)))[:15]
    return out


PROMPT = """You are checking published reviews for one wine.
Wine: {producer} {name}, vintage {vintage}.
Use web search. Prefer wine-searcher.com and cellartracker.com pages, then the winery's tech sheet and critic
sites (Wine Advocate / Robert Parker, Wine Spectator, James Suckling, Vinous, Wine Enthusiast, Jeb Dunnuck, Decanter).
Report a score only if a page you read shows that exact number for this exact wine AND vintage. Never estimate.
Return only one JSON object, no prose:
{{"critic_scores":[{{"critic":"...","score":95,"source_url":"...","evidence":"quote of at most 15 words showing the score"}}],
 "community":{{"source":"CellarTracker","avg":92.1,"count":120,"source_url":"..."}} or null,
 "price_usd":{{"avg":450,"source_url":"..."}} or null,
 "drink_window":"2025-2045" or null,
 "aromas":["up to 8 English descriptors used by reviewers"],
 "summary":"2 sentences in English",
 "pages":{{"wine_searcher":"url or null","cellartracker":"url or null"}}}}"""

FETCH_PROMPT = """Fetch each URL below with the web_fetch tool, then report for each one, as one JSON object, no prose:
{{"<url>":{{"fetched":true/false,"blocked_or_captcha":true/false,"what_the_page_shows":"one sentence",
 "critic_scores":[{{"critic":"...","score":0}}],"community_avg":null,"avg_price_usd":null}}}}
Only report numbers that are on the page. URLs:
{urls}"""


def client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ["AZURE_FOUNDRY_API_KEY"], base_url=f"{AZURE_HOST}/anthropic",
                               timeout=240, max_retries=1)


def run_claude(model: str, prompt: str, tools: list, betas: list | None = None) -> dict:
    t0 = time.time()
    c = client()
    messages: list = [{"role": "user", "content": prompt}]
    blocks: list = []
    usage = {"input": 0, "output": 0, "cache_read": 0, "web_search_requests": 0, "web_fetch_requests": 0}
    try:
        for _ in range(4):  # follow pause_turn
            kwargs = dict(model=model, max_tokens=8000, messages=messages, tools=tools)
            if betas:
                kwargs["extra_headers"] = {"anthropic-beta": ",".join(betas)}
            resp = c.messages.create(**kwargs)
            u = resp.usage
            usage["input"] += u.input_tokens
            usage["output"] += u.output_tokens
            usage["cache_read"] += getattr(u, "cache_read_input_tokens", 0) or 0
            stu = getattr(u, "server_tool_use", None)
            if stu:
                usage["web_search_requests"] += getattr(stu, "web_search_requests", 0) or 0
                usage["web_fetch_requests"] += getattr(stu, "web_fetch_requests", 0) or 0
            blocks.extend(b.model_dump() for b in resp.content)
            if resp.stop_reason != "pause_turn":
                break
            messages = [*messages, {"role": "assistant", "content": resp.content}]
        text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        citations = [
            {"url": ci.get("url"), "title": ci.get("title"), "cited_text": ci.get("cited_text")}
            for b in blocks if b.get("type") == "text" for ci in (b.get("citations") or [])
        ]
        searches = [b.get("input") for b in blocks if b.get("type") == "server_tool_use"]
        results = []
        for b in blocks:
            if b.get("type") in ("web_search_tool_result", "web_fetch_tool_result"):
                content = b.get("content")
                if isinstance(content, list):
                    results.append({"type": b["type"], "urls": [r.get("url") for r in content][:10]})
                elif isinstance(content, dict):
                    doc = content.get("content") or {}
                    src = doc.get("source") if isinstance(doc, dict) else None
                    data = (src or {}).get("data") if isinstance(src, dict) else None
                    results.append({"type": b["type"], "url": content.get("url"),
                                    "error_code": content.get("error_code"),
                                    "doc_chars": len(data) if isinstance(data, str) else None,
                                    "doc_head": data[:600] if isinstance(data, str) else None})
        m = re.search(r"\{.*\}", text, re.S)
        parsed = None
        if m:
            try:
                parsed = json.loads(m.group(0))
            except Exception:  # noqa: BLE001
                parsed = None
        return {"model": model, "s": round(time.time() - t0, 1), "usage": usage, "parsed": parsed,
                "text": text[:4000], "citations": citations[:40], "tool_calls": searches, "tool_results": results}
    except Exception as e:  # noqa: BLE001
        return {"model": model, "s": round(time.time() - t0, 1), "error": repr(e)[:500], "usage": usage}


SEARCH_TOOL = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}]
FETCH_TOOL = [{"type": "web_fetch_20250910", "name": "web_fetch", "max_uses": 3, "max_content_tokens": 30000}]


def claude_for(w: tuple) -> dict:
    producer, name, vintage = w
    p = PROMPT.format(producer=producer, name=name, vintage=vintage)
    out = {
        "search_sonnet": run_claude("claude-sonnet-5-5", p, SEARCH_TOOL),
        "search_haiku": run_claude("claude-haiku-5-5-2", p, SEARCH_TOOL),
    }
    urls = "\n".join([ws_url(*w), ct_search_url(*w)])
    f = run_claude("claude-sonnet-5-5", FETCH_PROMPT.format(urls=urls), FETCH_TOOL)
    if f.get("error"):  # Foundry may still want the beta header for web fetch
        f = run_claude("claude-sonnet-5-5", FETCH_PROMPT.format(urls=urls), FETCH_TOOL, ["web-fetch-2025-09-10"])
    out["fetch_sonnet"] = f
    return out


def main() -> None:
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    only = int(os.environ.get("SPIKE_LIMIT") or len(WINES))
    wines = WINES[:only]
    pages: dict = {}
    results: list = [{"wine": {"producer": p, "name": n, "vintage": v}} for p, n, v in wines]

    with ThreadPoolExecutor(max_workers=4) as pool:
        claude_futures = [pool.submit(claude_for, w) for w in wines]

        # Direct fetches, one site request every PAUSE seconds.
        for i, w in enumerate(wines):
            r = results[i]
            r["ws_direct"] = fetch(ws_url(*w), pages, f"ws_{i}.html")
            if pages.get(f"ws_{i}.html") and r["ws_direct"].get("status") == 200:
                r["ws_direct"]["parsed"] = parse_ws(pages[f"ws_{i}.html"])
            r["ct_direct"] = fetch(ct_search_url(*w), pages, f"ct_search_{i}.html")
            if pages.get(f"ct_search_{i}.html"):
                r["ct_direct"]["parsed"] = parse_ct_search(pages[f"ct_search_{i}.html"])
                ids = r["ct_direct"]["parsed"]["wine_ids"]
                if ids:
                    time.sleep(PAUSE)
                    r["ct_wine"] = fetch(f"https://www.cellartracker.com/wine.asp?iWine={ids[0]}", pages, f"ct_wine_{i}.html")
                    if pages.get(f"ct_wine_{i}.html"):
                        r["ct_wine"]["parsed"] = parse_ct_wine(pages[f"ct_wine_{i}.html"])
            print(f"[{i + 1}/{len(wines)}] {w[0]} {w[2]}: WS {r['ws_direct'].get('status')} "
                  f"{r['ws_direct'].get('block_markers')} | CT {r['ct_direct'].get('status')}", flush=True)
            time.sleep(PAUSE)

        for i, f in enumerate(claude_futures):
            results[i].update(f.result())
            s = results[i]["search_sonnet"]
            print(f"claude {wines[i][0]}: {s.get('s')}s {s.get('usage')} err={s.get('error')}", flush=True)

    with open(os.path.join(out_dir, "results.json"), "w") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=1)
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for k, v in pages.items():
            data = v.encode("utf-8", "replace")
            ti = tarfile.TarInfo(k)
            ti.size = len(data)
            tar.addfile(ti, io.BytesIO(data))
    with open(os.path.join(out_dir, "pages.tar.gz"), "wb") as fh:
        fh.write(buf.getvalue())


if __name__ == "__main__":
    main()
