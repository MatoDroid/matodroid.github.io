// Service worker pre /guma: aplikácia + mapové dlaždice sa držia v cache, takže stránka sa otvorí a dá používať aj bez signálu.
// Zabalenie (zabal.mjs) nahradí 1793907300243 časom zostavenia. Dáta (GitHub API) rieši aplikácia sama (IndexedDB), preto ich sem nepúšťame.
const BUILD = '__BUILD__', SHELL_CACHE = 'guma-shell-' + BUILD, TILE_CACHE = 'guma-tiles';
const SHELL = ['./', 'index.html', 'app.enc', 'C_ZAPPAR_spisska_nova_ves.geojson.enc',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'];
const TILE_HOSTS = ['tile.openstreetmap.org', 'ofmozaika.tiles.freemap.sk', 'tiles.arcgis.com', 'kataster.skgeodesy.sk'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('guma-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const okToCache = r => r && (r.ok || r.type === 'opaque');
async function networkFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  try { const r = await fetch(req); if (okToCache(r) && req.method === 'GET') c.put(req, r.clone()); return r; }
  catch (err) { const m = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await c.match('./', { ignoreSearch: true }) : null); if (m) return m; throw err; }
}
async function cacheFirst(req, cacheName) {
  const c = await caches.open(cacheName), m = await c.match(req);
  if (m) return m;
  const r = await fetch(req); if (okToCache(r)) c.put(req, r.clone()); return r;
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) e.respondWith(networkFirst(req, SHELL_CACHE));            // aplikácia: vždy najnovšia, offline z cache
  else if (u.hostname === 'cdnjs.cloudflare.com') e.respondWith(cacheFirst(req, SHELL_CACHE));  // Leaflet + jeho obrázky
  else if (TILE_HOSTS.includes(u.hostname)) e.respondWith(cacheFirst(req, TILE_CACHE).catch(() => Response.error()));   // dlaždice: už videné/stiahnuté z cache
});
