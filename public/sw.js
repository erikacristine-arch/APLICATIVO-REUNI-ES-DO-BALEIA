// Escoteiros do Baleia: permite instalar o app no celular e abrir mesmo com internet fraca.
// Páginas: tenta a internet primeiro e usa a cópia guardada se cair. Logos e ícones: cópia guardada.
// A API (/api) nunca é guardada: salvar e ler dados sempre fala com o servidor.
const CACHE = 'baleia-v1'
const PAGINAS = ['/', '/seguranca.html', '/manifest.webmanifest']
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PAGINAS)).catch(() => {}))
  self.skipWaiting()
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin || url.pathname.startsWith('/api') || url.pathname === '/saude') return
  if (url.pathname.startsWith('/logos/') || url.pathname.startsWith('/icones/')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res })))
    return
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)) }
    return res
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('/'))))
})
