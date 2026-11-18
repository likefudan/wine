"""Temporary: print the TTB public COLA search forms (run on GitHub Actions)."""

import re
import subprocess
import sys
import urllib.request

import certifi
import requests
from bs4 import BeautifulSoup

# ttbonline.gov does not send its intermediate certificate; add it to the trusted set.
der = urllib.request.urlopen("http://crt.sectigo.com/EntrustOVTLSIssuingRSACA2.crt", timeout=30).read()
pem = subprocess.run(["openssl", "x509", "-inform", "der"], input=der, capture_output=True, check=True).stdout
open("ttb-ca.pem", "wb").write(open(certifi.where(), "rb").read() + b"\n" + pem)

s = requests.Session()
s.verify = "ttb-ca.pem"
s.headers["User-Agent"] = "Mozilla/5.0 (wine journal; one-off public data load)"
for url in sys.argv[1:]:
    r = s.get(url, timeout=60)
    print("=" * 30, url, r.status_code, len(r.text))
    soup = BeautifulSoup(r.text, "html.parser")
    for f in soup.find_all("form"):
        print("FORM", f.get("method"), f.get("action"), f.get("name"))
        for i in f.find_all(["input", "select", "textarea"]):
            opts = [(o.get("value"), o.text.strip()[:30]) for o in i.find_all("option")]
            print("  ", i.name, i.get("type"), i.get("name"), repr(i.get("value"))[:40], opts[:12], len(opts))
    for a in soup.find_all("a", href=True):
        if re.search(r"csv|file|save|search|result", a["href"], re.I):
            print("LINK", a["href"], a.text.strip()[:40])
    text = soup.get_text(" ", strip=True)
    for m in re.finditer(r"[^.]{0,120}(1,?000|maximum|limit)[^.]{0,120}", text, re.I):
        print("NOTE", m.group(0))
