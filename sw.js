// Service worker: app tetap bisa dibuka saat sinyal jelek. Naikkan VERSION setiap deploy perubahan.
const VERSION = 'prodiakon-v32';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isShell = e.request.method === 'GET' && (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net');
  if (!isShell) return; // API Supabase selalu langsung ke jaringan
  // network-first: selalu ambil versi terbaru, pakai cache bila offline.
  // File app sendiri dicek ulang ke server (cache: 'no-cache' → 304 bila sama), karena GitHub Pages
  // memberi max-age 10 menit sehingga update baru tidak langsung terlihat.
  const req = url.origin === location.origin ? fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request);
  e.respondWith(req.then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});

// Push notification (FCM, pesan data: {title, body, link}) — dikirim Edge Function "notify"
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { data: { body: e.data && e.data.text() } }; }
  const d = p.data || {}, n = p.notification || {};
  const title = d.title || n.title || 'Prodiakon';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || n.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag || title,
    data: { link: d.link || p.fcmOptions?.link || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = new URL(e.notification.data?.link || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) { open.focus(); return open.navigate(link).catch(() => {}); }
    return self.clients.openWindow(link);
  }));
});
