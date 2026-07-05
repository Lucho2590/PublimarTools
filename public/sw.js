// Service worker mínimo para la PWA de Punto de Venta (/pos).
// Es online-only: no cachea nada. Solo existe para habilitar la
// instalación de la PWA (Chrome/Android exigen un SW con handler de fetch).
// Al no llamar a respondWith, el navegador hace el fetch normal: cero cambio
// de comportamiento en la app.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // no-op: se deja pasar la request a la red normalmente.
});
