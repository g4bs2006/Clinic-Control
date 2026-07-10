// Service worker mínimo — habilita a instalação do PWA (o navegador exige um SW
// com handler de fetch) SEM cachear nada. Passthrough puro: toda requisição vai
// pra rede normalmente, então nunca serve conteúdo defasado após um deploy.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* sem respondWith: o navegador trata a requisição normalmente (rede) */
});
