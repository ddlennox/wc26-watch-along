/* Pub Kickoff service worker — makes the site installable & usable offline.
   Network-first for the page shell (so updates show), and it NEVER touches
   /api/ requests so live scores, plans and bets always hit the network. */
const CACHE = "pk-v3";
const SHELL = [
  "/", "/index.html", "/matchcentre.css", "/matchcentre.js", "/extras.js",
  "/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;            // never cache POST/DELETE (plans, bets)
  if (url.pathname.startsWith("/api/")) return;      // always go to network for live data
  if (url.origin !== self.location.origin) return;   // leave cross-origin (weather, fonts) alone
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});
