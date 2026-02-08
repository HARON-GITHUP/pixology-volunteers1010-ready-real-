// sw.js
const VERSION = "v1.0.0"; // 🔁 غيّرها كل مرة تعمل تحديث
const CACHE_NAME = `pixology-${VERSION}`;

// حط هنا ملفاتك الأساسية
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./index.js",
  "./firebase.js",
  "./ui.js",
  "./manifest.webmanifest",
  "./p.jpg",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)),
      );
      await self.clients.claim();
    })(),
  );
});

// ✅ HTML: شبكة أولاً (عشان أي تعديل يظهر فورًا)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // للصفحات (HTML)
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((c) => c || caches.match("./index.html")),
        ),
    );
    return;
  }

  // لباقي الملفات: كاش أولاً + تحديث بالخلف
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetcher = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);

      return cached || fetcher;
    }),
  );
});
