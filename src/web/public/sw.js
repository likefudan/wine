// 离线也能打开 (docs/design.zh.md §2): keeps the app's page and code so it opens with no signal.
// The notes themselves live in IndexedDB (store.ts), never here; /api is never cached.
// v3: drops what v2 kept from every release before this one.
const CACHE = "shell-v3";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/", "/icon.svg", "/favicon.svg", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Pages: the network first (a release shows at once), the kept page when there is none.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            e.waitUntil(
              caches
                .open(CACHE)
                .then((c) => c.put("/", copy))
                .then(prune)
                .catch(() => {}),
            );
          }
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  // Scripts, styles and fonts never change under one name: kept on first use.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

/**
 * Every release has new file names, and this cache would otherwise keep them all. After a page comes
 * from the network, keep only the files it uses: the ones it names, and the ones those scripts and
 * styles name (code loaded later, fonts).
 */
const ASSET = /\/assets\/[\w.-]+/g;
/** Chunks a script loads by a name relative to itself ("./browser-x.js"). */
const SIBLING = /\.\/([\w.-]+\.(?:js|css))/g;
async function prune() {
  const cache = await caches.open(CACHE);
  const page = await cache.match("/");
  if (!page) return;
  const keep = new Set((await page.text()).match(ASSET) ?? []);
  for (const path of [...keep]) {
    if (!/\.(js|css)$/.test(path)) continue;
    const res = (await cache.match(path)) ?? (await fetch(path).catch(() => null));
    if (!res?.ok) return; // offline or mid-release: try again next time rather than drop too much
    const text = await res.text();
    for (const p of text.match(ASSET) ?? []) keep.add(p);
    for (const m of text.matchAll(SIBLING)) keep.add(`/assets/${m[1]}`);
  }
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/assets/") && !keep.has(path)) await cache.delete(req);
  }
}
