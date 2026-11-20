// ============================================================================
//  sw.js — Service Worker: hace que la app funcione SIN INTERNET tras la 1ª carga.
//  Estrategia:
//   - HTML (navegación): "network-first" → si hay internet trae la versión nueva
//     (así las actualizaciones llegan solas); si no hay, usa la copia guardada.
//   - Íconos/manifest/estáticos: "cache-first" (son fijos, se sirven al instante).
//  Sube VERSION cuando cambie el "shell" para limpiar caches viejas.
// ============================================================================
const VERSION = 'registro-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-180.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // no tocar otros orígenes

  // Navegación (el documento HTML): red primero, cache de respaldo sin internet
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Estáticos: cache primero, y si no está, buscar en red y guardar
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    }).catch(() => hit))
  );
});
