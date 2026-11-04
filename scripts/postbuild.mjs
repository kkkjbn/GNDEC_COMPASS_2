import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = path.join(dir, item.name);
    return item.isDirectory() ? walk(full) : [full];
  });

const precache = walk(dist)
  .map((file) => `/${path.relative(dist, file).split(path.sep).join('/')}`)
  .filter(
    (url) =>
      url === '/index.html' ||
      url === '/manifest.webmanifest' ||
      url === '/favicon.svg' ||
      url === '/robots.txt' ||
      url === '/sitemap.xml' ||
      url.startsWith('/data/') ||
      /^\/assets\/[^/]+\.(js|css)$/.test(url),
  );

const version = crypto.createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 10);
const cacheName = `gndec-compass-v2-${version}`;

const worker = `const CACHE = '${cacheName}';
const CORE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('gndec-compass-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            // Clone synchronously, before the page starts consuming the body.
            const copy = response.clone();
            const cache = await caches.open(CACHE);
            await cache.put('/index.html', copy).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Campus photos may live in the user-triggered offline media cache.
  if (url.pathname.startsWith('/img/')) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE);
            await cache.put(request, copy).catch(() => {});
          }
          return response;
        } catch {
          return Response.error();
        }
      }),
    );
    return;
  }

  const cacheFirst =
    url.pathname.startsWith('/data/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.svg';

  if (!cacheFirst) return;

  // Content-hashed assets and versioned data are immutable inside one cache,
  // so serving the cached copy is enough. The cache name changes per build.
  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          const cache = await caches.open(CACHE);
          await cache.put(request, copy).catch(() => {});
        }
        return response;
      } catch {
        return Response.error();
      }
    }),
  );
});
`;

fs.writeFileSync(path.join(dist, 'sw.js'), worker);
console.log(`Generated offline worker ${cacheName} with ${precache.length} core files.`);
