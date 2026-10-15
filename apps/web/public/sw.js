/* Service worker de Tableau Clair : coquille de l'application et dernier état lu (lecture seule hors ligne).
 * Pas de skipWaiting automatique : la nouvelle version attend que la personne choisisse « Mettre à jour ». */
const VERSION = 'v1';
const SHELL = `tc-shell-${VERSION}`;
const API = 'tc-api';
const ASSETS = 'tc-assets';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('tc-shell-') && name !== SHELL) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
  // Déconnexion ou suppression du compte : les données mises en cache ne restent pas sur l'appareil.
  if (event.data === 'CLEAR_DATA') event.waitUntil(caches.delete(API));
});

/** Lecture d'API : réseau d'abord ; hors ligne, dernier état connu, marqué `x-from-cache`. */
async function apiRead(request) {
  const cache = await caches.open(API);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (!cached) throw error;
    const headers = new Headers(cached.headers);
    headers.set('x-from-cache', '1');
    return new Response(await cached.blob(), { status: cached.status, headers });
  }
}

async function navigate(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match('/')) ?? Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Authentification et redirections vers les URL signées : jamais en cache.
    if (url.pathname.startsWith('/api/auth') || url.pathname.endsWith('/content')) return;
    event.respondWith(apiRead(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(asset(request));
  }
});
