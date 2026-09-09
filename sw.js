/**
 * Service worker do RitmoPatrimar — Mapa dos Trilhos · Embalagem.
 *
 * Existe por dois motivos, nessa ordem de importância:
 *   1. o tablet abre o app sem rede e continua montando o mapa;
 *   2. quando sai versão nova, o líder é avisado em vez de ficar meses
 *      numa versão velha sem saber.
 *
 * Ao publicar uma versão nova, mude VERSAO aqui e em index.html. É a troca
 * de bytes deste arquivo que faz o navegador procurar atualização.
 */
const VERSAO = "3.9.0";
const CACHE = "trilhos-" + VERSAO;

const CASCA = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./logo-patrimar.png"
];

/* O mapa salvo nunca entra em cache: dois tablets editam o mesmo produto e
   servir uma cópia velha faria um sobrescrever o trabalho do outro. Sem
   rede, a leitura falha e o app já sabe avisar — e o rascunho local
   segura o que está na tela. */
const AO_VIVO = ["script.google.com", "script.googleusercontent.com"];

self.addEventListener("install", ev => {
  // sem skipWaiting: quem decide a hora de trocar é o líder, pelo botão.
  // Trocar no meio de um mapa pela metade seria perder o trabalho dele.
  // cache: "reload" ignora o cache HTTP do navegador: sem isto, a versão
  // nova podia instalar com o index.html velho que o CDN ainda servia.
  ev.waitUntil(caches.open(CACHE).then(c =>
    c.addAll(CASCA.map(u => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", ev => {
  if (ev.data && ev.data.tipo === "ATUALIZAR") self.skipWaiting();
  if (ev.data && ev.data.tipo === "VERSAO") {
    ev.source && ev.source.postMessage({ tipo: "VERSAO", versao: VERSAO });
  }
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (AO_VIVO.some(h => url.hostname.endsWith(h))) return;   // deixa passar direto

  // Navegação: rede primeiro, para a versão nova chegar assim que existir.
  // Sem rede, entrega a casca do cache e o app abre igual.
  if (req.mode === "navigate") {
    ev.respondWith((async () => {
      try {
        const res = await fetch(req);
        // Só guarda resposta boa: deploy no meio ou host fora do ar devolvia
        // 404/500, e a página de erro virava a casca offline do tablet.
        if (res && res.ok) {
          const c = await caches.open(CACHE);
          try { await c.put("./index.html", res.clone()); } catch (e2) {}
        }
        return res;
      } catch (e) {
        return (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // Fontes do Google: cache primeiro, revalidando por trás. São estáveis, e
  // sem elas a interface fica com a fonte errada no meio do turno.
  const fonte = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (fonte || url.origin === self.location.origin) {
    ev.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(req);
      const rede = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return guardado || (await rede) || Response.error();
    })());
  }
});
