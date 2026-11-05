// 오뺀 - 순수 모바일 웹 전환 (기존 등록된 PWA 서비스워커 자동 해제)
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
  );
});
