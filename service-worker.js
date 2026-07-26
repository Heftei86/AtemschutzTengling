const CACHE_NAME = 'atemschutz-cache-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];
// Für den Excel-Export wird die SheetJS-Bibliothek von einem CDN geladen.
// Damit der Export auch ohne Internetverbindung funktioniert, wird sie
// beim ersten (Online-)Aufruf mit im Cache abgelegt.
const XLSX_LIB_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Jede Datei einzeln mit eigenem Fehlerfang cachen: schlägt eine davon fehl
      // (z.B. kurzer Netzwerkaussetzer), darf das NICHT die komplette Installation
      // verhindern – sonst bleibt der Service Worker inaktiv und Benachrichtigungen
      // funktionieren auf Android/Smartphones dann gar nicht mehr.
      Promise.all(
        ASSETS.map((url) => cache.add(url).catch((e) => console.warn('SW: Datei konnte nicht gecacht werden:', url, e)))
      ).then(() => cache.add(XLSX_LIB_URL).catch(() => {}))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Netzwerk zuerst: Bei bestehender Internetverbindung wird immer die aktuellste
// Version geladen und im Cache aktualisiert. Nur wenn kein Netz verfügbar ist
// (z.B. im Keller/Einsatz ohne Empfang), greift der zuletzt gespeicherte Stand.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isXlsxLib = event.request.url === XLSX_LIB_URL;
  // Nur Requests an die eigene Origin abfangen/cachen (plus die eine
  // XLSX-Bibliothek als gezielte Ausnahme für den Offline-Export).
  // Firebase (Firestore, Auth, gstatic-Module) läuft über eigene Verbindungen
  // (u.a. WebChannel/WebSocket) und darf vom Service Worker nicht beeinflusst werden.
  if (!isXlsxLib && !event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
