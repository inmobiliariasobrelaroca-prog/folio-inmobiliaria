// Service Worker de Sobre la Roca
// Estrategia: el shell de la app se guarda en cache y se sirve desde ahi.
// Las llamadas a Supabase NUNCA se cachean: siempre van a la red.

const VERSION = 'slr-v2';
const SHELL = VERSION + '-shell';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      // uno por uno: si un archivo falla, no se cae la instalacion entera
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;      // Supabase, fuentes externas
  if (url.pathname.startsWith('/rest/')) return;
  if (url.pathname.startsWith('/auth/')) return;

  // Navegacion: red primero, cache si no hay conexion.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  // Assets: cache primero, y se actualiza en segundo plano.
  e.respondWith(
    caches.match(req).then((hit) => {
      const red = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copia = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => hit);   // sin conexion: se devuelve la copia, sin error suelto
      return hit || red;
    })
  );
});
