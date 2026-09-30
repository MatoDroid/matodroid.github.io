// Minimalny service worker: staci na instalaciu PWA a zaradenie do menu
// "Zdielat". Nic nekesuje, vsetko ide po sieti (prepisy su vzdy cerstve).
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function () { /* predvoleny sietovy priebeh */ });
