/* Deepforge service worker: lets the installed app open offline.
   Network first for the game's own files (so updates you upload show up right
   away when online), falling back to the saved copy when offline. Fonts come
   from the saved copy and refresh in the background. Everything else (the AI
   Worker, the on-device AI download) is left alone. */
const CACHE = 'deepforge-v28';
const MUSIC = 'deepforge-music-v1'; // the soundtrack: saved the first time each track plays, kept across updates
const offline = new Set(); // pages that opened from the saved copy
const APP_FILES = ['./', 'index.html', 'css/styles.css', 'js/data.js', 'js/prompts.js', 'js/sprites.js', 'js/ai.js', 'js/audio.js', 'js/game.js', 'js/ui.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  // Save the game's files so it opens offline.
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(APP_FILES.map((f) => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // Only clear out our own old copies: the on-device AI keeps its big download in other caches.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('deepforge-') && k !== CACHE && k !== MUSIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (/\/music\/[^/]+\.mp3$/.test(url.pathname)) { // music files never change: saved copy first
    event.respondWith(caches.open(MUSIC).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true }); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
    return;
  }
  const saved = async () => (await caches.match(req, { ignoreSearch: true })) ||
    (req.mode === 'navigate' ? (await caches.match('index.html')) || (await caches.match('./')) : null);
  // A page that opened from the saved copy loads all its files from the saved copy too,
  // so every piece of the game comes from the same version.
  if (req.mode !== 'navigate' && offline.has(event.clientId)) {
    event.respondWith(saved().then((hit) => hit || fetch(req)));
    return;
  }
  const net = fetch(req, { cache: 'no-cache' }) // always ask GitHub whether there's a newer copy
    .then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    });
  const useSaved = async () => {
    const hit = await saved();
    if (hit && req.mode === 'navigate' && event.resultingClientId) offline.add(event.resultingClientId);
    return hit;
  };
  if (req.mode === 'navigate') {
    // Only the page itself waits at most 4 seconds (Wi-Fi connected but the internet is down).
    // Its files then come from the same place the page did.
    const slow = new Promise((r) => setTimeout(r, 4000)).then(async () => (await useSaved()) || net);
    event.respondWith(Promise.race([net, slow]).catch(async () => (await useSaved()) || Response.error()));
  } else {
    event.respondWith(net.catch(async () => (await saved()) || Response.error()));
  }
});
