
"use strict";

const CACHE_NAME = "seby-runner-3d-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./games.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// ENSTALASYON: Mete fichye jwèt yo nan cache.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await Promise.all(
        APP_SHELL.map(async (path) => {
          try {
            const response = await fetch(path, {
              cache: "reload"
            });

            if (response.ok) {
              await cache.put(path, response);
            }
          } catch (error) {
            console.warn(
              "Fichye a poko disponib:",
              path
            );
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

// AKTIVASYON: Efase ansyen cache jwèt la.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("seby-runner-3d-") &&
              key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

// FONKSYONMAN: Eseye cache an premye.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const cached = await caches.match(request);

        if (cached) {
          return cached;
        }

        const response = await fetch(request);

        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE_NAME);

          await cache.put(
            request,
            response.clone()
          );
        }

        return response;
      } catch (error) {
        // Si paj la pa disponib, eseye retounen sou jwèt la.
        if (request.mode === "navigate") {
          const fallback = await caches.match(
            "./index.html"
          );

          if (fallback) {
            return fallback;
          }
        }

        return new Response(
          "Ou pa konekte ak entènèt la. Louvri jwèt la yon fwa ak entènèt anvan ou jwe offline.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      }
    })()
  );
});
