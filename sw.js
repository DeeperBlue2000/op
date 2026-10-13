// Control — service worker (F3.8 do roadmap): o app abre sem rede e as atualizações chegam sozinhas.
// Estratégia:
//  · index.html (navegação): REDE PRIMEIRO com limite de 3 s, revalidando o cache HTTP (cache:"no-cache") —
//    online sempre abre a versão mais nova; offline (ou rede lenta) abre a última versão guardada.
//  · supabase-js (CDN) e Google Fonts: cache primeiro (mudam raramente; garantem o app inteiro offline).
//  · API/Auth do Supabase: nunca passa pelo cache (dados sempre da rede; o app já é offline-first via localStorage).
// Este arquivo NÃO precisa mudar a cada versão do app (a versão vive no index.html).
const CACHE = "control-shell-v1";
const SHELL = "./index.html";
const NET_TIMEOUT = 3000;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.add(new Request(SHELL, { cache: "no-cache" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function networkFirstShell(req) {
  return caches.open(CACHE).then(cache => new Promise(resolve => {
    let done = false;
    const fallback = () => cache.match(SHELL).then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } });
    const timer = setTimeout(fallback, NET_TIMEOUT);
    fetch(req, { cache: "no-cache" }).then(resp => {
      clearTimeout(timer);
      if (resp && resp.ok) cache.put(SHELL, resp.clone());
      if (!done) { done = true; resolve(resp); }
    }).catch(() => { clearTimeout(timer); fallback(); });
  }));
}

function cacheFirst(req) {
  return caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const resp = await fetch(req);
      if (resp && (resp.ok || resp.type === "opaque")) cache.put(req, resp.clone());
      return resp;
    } catch (err) {
      return Response.error();
    }
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return;                       // dados: sempre rede
  if (req.mode === "navigate") { e.respondWith(networkFirstShell(req)); return; }
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(req));
  }
});
