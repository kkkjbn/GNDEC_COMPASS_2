import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
  const full = path.join(dir, item.name);
  return item.isDirectory() ? walk(full) : [full];
});
const precache = walk(dist).map(file => `/${path.relative(dist, file).split(path.sep).join('/')}`).filter(url =>
  url === '/index.html' || url === '/manifest.webmanifest' || url === '/favicon.svg' ||
  url.startsWith('/data/') || /^\/assets\/[^/]+\.(js|css)$/.test(url)
);
const worker = `const CACHE = 'gndec-compass-v2';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('gndec-compass-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  if (!url.pathname.startsWith('/data/') && !url.pathname.startsWith('/img/')) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request);
    const update = fetch(request).then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    });
    if (cached) { event.waitUntil(update.catch(() => {})); return cached; }
    try { return await update; } catch { return Response.error(); }
  }));
});
`;
fs.writeFileSync(path.join(dist, 'sw.js'), worker);
console.log(`Generated offline worker with ${precache.length} core files.`);
