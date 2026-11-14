// Gera as páginas do site (HTML estático, bom para buscadores) a partir de um layout único.
// Uso: node portal/build-site.mjs   (rode depois de collect.mjs para atualizar os avisos)
// Preencha "url" em site.config.json com o domínio final para ativar canonical, Open Graph e sitemap.
import fs from 'fs';

const aqui = f => new URL(f, import.meta.url);
const ler = (f, padrao) => { try { return JSON.parse(fs.readFileSync(aqui(f), 'utf8')); } catch { return padrao; } };
const cfg = ler('./site.config.json', {});
const URL_SITE = (cfg.url || '').replace(/\/$/, '');
const pontos = ler('./data/pontos.json', []);
const pref = ler('./data/prefeitura.json', { itens: [] });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HOJE = new Date();
const isoDia = d => d.toISOString().slice(0, 10);

// ---------- festas (datas pelo calendário religioso e popular) ----------
function pascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
}
const mais = (d, n) => new Date(d.getTime() + n * 864e5);
const fixa = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
// Conexão pública do Supabase (a mesma chave "publishable" do site), lida de config.js.
const CONFIG_JS = fs.readFileSync(aqui('./config.js'), 'utf8');
const SUPABASE = (CONFIG_JS.match(/supabaseUrl:\s*'([^']+)'/) || [])[1];
const SUPABASE_KEY = (CONFIG_JS.match(/supabaseKey:\s*'([^']+)'/) || [])[1];

// As festas vêm do banco (painel /admin). A regra da data vira uma função: dias em relação à Páscoa ou dia fixo no ano.
const { carregarFestas, gerar: gerarFestas } = await import('./festas-conteudo.mjs');
const { limparHtml, secoesParaHtml } = await import('./html-seguro.js');
const urlImagemFesta = caminho => (caminho && SUPABASE ? `${SUPABASE}/storage/v1/object/public/festas/${caminho.split('/').map(encodeURIComponent).join('/')}` : null);
const regraDatas = f => {
  if (f.data_tipo === 'pascoa' && Number.isInteger(f.pascoa_ini)) return y => [mais(pascoa(y), f.pascoa_ini), mais(pascoa(y), f.pascoa_fim ?? f.pascoa_ini)];
  if (f.data_tipo === 'fixa' && f.fixa_ini) {
    const [mi, di] = f.fixa_ini.split('-').map(Number), [mf, df] = (f.fixa_fim || f.fixa_ini).split('-').map(Number);
    return y => { const ini = fixa(y, mi, di); let fim = fixa(y, mf, df); if (fim < ini) fim = fixa(y + 1, mf, df); return [ini, fim]; };
  }
  return null;
};
const FESTAS = (await carregarFestas({ supabaseUrl: SUPABASE, supabaseKey: SUPABASE_KEY })).map(f => ({
  id: f.id, nome: f.nome, chita: f.chita, texto: f.resumo, olho: f.olho, lema: f.lema, veja: f.veja,
  // conteúdo do editor (HTML limpo aqui de novo, por segurança); festas antigas ainda em seções viram HTML na hora
  conteudo: f.conteudo ? limparHtml(f.conteudo) : secoesParaHtml(f.secoes), campos: Array.isArray(f.campos) ? f.campos : [], imagem_url: urlImagemFesta(f.imagem),
  quando: f.quando_texto || 'Data a confirmar', datas: regraDatas(f),
})).map(f => {
  if (!f.datas) return f;
  let [ini, fim] = f.datas(HOJE.getUTCFullYear());
  if (isoDia(fim) < isoDia(HOJE)) [ini, fim] = f.datas(HOJE.getUTCFullYear() + 1);
  const fmt = d => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return { ...f, ini: isoDia(ini), fim: isoDia(fim), quando: isoDia(ini) === isoDia(fim) ? `${fmt(ini)} de ${ini.getUTCFullYear()}` : `${fmt(ini)} a ${fmt(fim)} de ${fim.getUTCFullYear()}` };
}).sort((a, b) => (a.ini || '0').localeCompare(b.ini || '0'));
FESTAS.forEach(f => { f.pagina = `festas/${f.id}.html`; });
const proximaFesta = FESTAS.find(f => f.ini);

// ---------- fotos da home (painel /admin, aba "Home") ----------
// capa do topo e os cartões de "Conheça a cidade". Sem banco, usa a última cópia salva; sem foto, o site usa a estampa de chita.
const COPIA_IMAGENS = aqui('./data/site-imagens.json');
async function carregarImagensSite() {
  try {
    const r = await fetch(`${SUPABASE}/rest/v1/site_imagens?select=chave,imagem,legenda`, { headers: { apikey: SUPABASE_KEY }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lista = await r.json();
    fs.writeFileSync(COPIA_IMAGENS, JSON.stringify(lista, null, 1) + '\n');
    console.log('Fotos da home: lidas do banco', lista.filter(x => x.imagem).length);
    return lista;
  } catch (err) {
    console.warn('Fotos da home: banco indisponível, usando a última cópia:', err.message);
    return ler('./data/site-imagens.json', []);
  }
}
const urlImagemSite = caminho => (caminho && SUPABASE ? `${SUPABASE}/storage/v1/object/public/site/${caminho.split('/').map(encodeURIComponent).join('/')}` : null);
// O painel envia duas versões: a grande (caminho salvo) e uma menor para celular (mesmo nome com "-p" antes do .jpg).
const IMAGENS = Object.fromEntries((SUPABASE ? await carregarImagensSite() : []).filter(x => x.imagem).map(x => [x.chave, {
  url: urlImagemSite(x.imagem), urlP: urlImagemSite(x.imagem.replace(/\.jpg$/, '-p.jpg')), legenda: x.legenda || '',
}]));
const fotoSite = (chave, { classe, sizes, prioridade = false, alt = '' }) => {
  const f = IMAGENS[chave]; if (!f) return '';
  return `<img class="${classe}" src="${esc(f.url)}" srcset="${esc(f.urlP)} 900w, ${esc(f.url)} 1800w" sizes="${sizes}" alt="${esc(f.legenda || alt)}"${prioridade ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
};

// ---------- layout ----------
const NAV = [['./', 'Início', 'index.html'], ['agenda.html', 'Agenda'], ['festas.html', 'Festas'], ['lugares.html', 'Lugares'], ['historia.html', 'História'], ['servicos.html', 'Serviços']];
// Barra fixa no rodapé do celular: as seções mais usadas a um toque (História fica no menu do topo).
const ICONE = d => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const BARRA = [
  ['./', 'Início', 'index.html', 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10'],
  ['agenda.html', 'Agenda', 'agenda.html', 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'],
  ['festas.html', 'Festas', 'festas.html', 'M2 5q10 6 20 0M4.5 6.4l1.3 5.3 3.3-4.1zM10 7.9l2 5.1 2-5.1zM14.9 7.6l3.3 4.1 1.3-5.3zM3 15q9 6 18 0M7.5 16.9l1 4 2.4-3.1zM13.1 17.8l2.4 3.1 1-4z'],
  ['lugares.html', 'Lugares', 'lugares.html', 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  ['servicos.html', 'Serviços', 'servicos.html', 'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1z'],
];
// Logomarca: flor de chita "Clássica" (5 pétalas, 2 folhas, miolo pontilhado). Fonte única para o topo, o rodapé, o favicon e img/logo.svg.
const MARCA = { petala: '#e5243b', miolo: '#ffd23f', folha: '#22a35a', ponto: '#ffffff' };
const FLOR_DESENHO = `<g fill="${MARCA.folha}">${[36, 252].map(a => `<ellipse rx="4.5" ry="10" cy="-13" transform="rotate(${a})"/>`).join('')}</g>`
  + `<g fill="${MARCA.petala}">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="6.5" ry="10" cy="-9" transform="rotate(${a})"/>`).join('')}</g>`
  + `<circle r="5.5" fill="${MARCA.miolo}"/>`
  + `<g fill="${MARCA.ponto}"><circle r="1.1" cy="-2.4"/><circle r="1.1" cx="2.3" cy=".8"/><circle r="1.1" cx="-2.3" cy=".8"/></g>`;
const FLOR = `<svg class="flor" viewBox="-24 -24 48 48" aria-hidden="true">${FLOR_DESENHO}</svg>`;

function layout(p) {
  const html = layoutBase(p);
  if (!p.arquivo.includes('/')) return html;
  const sobe = '../'.repeat(p.arquivo.split('/').length - 1);
  const rel = u => /^([a-z]+:|#|\/)/i.test(u) ? u : sobe + (u === './' ? '' : u);
  return html.replace(/(href|src)="([^"]*)"/g, (_, a, u) => a + '="' + rel(u) + '"').replace(/url\((img\/[^)]*)\)/g, (_, u) => 'url(' + sobe + u + ')');
}
function layoutBase({ arquivo, titulo, descricao, corpo, scripts = '', css = '', jsonld = [], migalha, dicas = "", privada = false }) {
  const canon = URL_SITE ? `${URL_SITE}/${arquivo === 'index.html' ? '' : arquivo}` : '';
  const tituloCompleto = arquivo === 'index.html' ? titulo : `${titulo} · São Luiz do Paraitinga`;
  const ld = [...jsonld];
  if (URL_SITE && migalha) ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: URL_SITE + '/' }, { '@type': 'ListItem', position: 2, name: migalha, item: canon }] });
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloCompleto)}</title>
<meta name="description" content="${esc(descricao)}">
${privada ? '<meta name="robots" content="noindex, nofollow">' : ''}
${canon ? `<link rel="canonical" href="${canon}">` : ''}
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${esc(cfg.nome)}">
<meta property="og:title" content="${esc(tituloCompleto)}">
<meta property="og:description" content="${esc(descricao)}">
${canon ? `<meta property="og:url" content="${canon}">\n<meta property="og:image" content="${URL_SITE}/img/og.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#e0263d">
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"></noscript>
<link rel="stylesheet" href="site.css">
${dicas}
${css}
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body${privada ? '' : ' class="com-barra"'}>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo">
  <div class="topo-in">
    <a class="logo" href="./" aria-label="slparaitinga, página inicial">${FLOR}<span>slparaitinga</span></a>
    <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu"><span></span><span class="sr">Abrir menu</span></button>
    <nav id="menu" class="menu" aria-label="Principal">
      ${NAV.map(([href, nome, arq]) => `<a href="${href}"${(arq || href) === arquivo || (href === 'festas.html' && arquivo.startsWith('festas/')) ? ' aria-current="page"' : ''}>${nome}</a>`).join('\n      ')}
    </nav>
    <a class="clima-chip" href="servicos.html#tempo" data-clima-chip aria-label="Tempo agora"></a>
  </div>
</header>
<main id="conteudo">
${corpo}
</main>
<footer class="rodape">
  <div class="rodape-in">
    <div><a class="logo" href="./">${FLOR}<span>slparaitinga</span></a><p>Agenda, festas e lugares de São Luiz do Paraitinga, feito com quem mora aqui.</p></div>
    <nav aria-label="Rodapé">${NAV.map(([href, nome]) => `<a href="${href}">${nome}</a>`).join('')}</nav>
    <p class="creditos">Mapa: © <a href="https://www.openstreetmap.org/copyright" rel="noopener">colaboradores do OpenStreetMap</a>. Previsão do tempo: Open-Meteo. A agenda é enviada pelos moradores; confirme horários com os organizadores.</p>
  </div>
</footer>
${privada ? '' : `<nav class="barra-nav" aria-label="Atalhos">${BARRA.map(([href, nome, arq, d]) => `<a href="${href}"${arq === arquivo || (arq === 'festas.html' && arquivo.startsWith('festas/')) ? ' aria-current="page"' : ''}>${ICONE(d)}<span>${nome}</span></a>`).join('')}</nav>`}
<script type="module" src="site.js"></script>
${scripts}
</body>
</html>
`;
}

const cabecalhoPagina = (olho, h1, texto) => `<header class="pagina-topo"><div class="larg"><p class="olho">${olho}</p><h1>${h1}</h1><p class="lema">${texto}</p></div></header>`;
const TIPOS = { praca: 'Praças e natureza', igreja: 'Igrejas', cultura: 'Cultura', servico: 'Serviços' };
const lugarLD = { '@type': 'Place', name: 'São Luiz do Paraitinga', address: { '@type': 'PostalAddress', addressLocality: 'São Luiz do Paraitinga', addressRegion: 'SP', addressCountry: 'BR' } };

// ---------- avisos da prefeitura ----------
const UTEIS = ['Concursos e seleções', 'Educação', 'Cultura', 'Saúde', 'Comunicados', 'Esportes', 'Obras', 'Meio ambiente'];
const avisos = (pref.itens || []).filter(n => UTEIS.includes(n.categoria));
const avisoHTML = n => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener"><span class="selo">${esc(n.categoria)}</span><strong>${esc(n.titulo)}</strong><time datetime="${esc(n.data)}">${new Date(n.data).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' })}</time></a></li>`;

// ---------- páginas ----------
const paginas = [];
const SETA_ESQ = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SETA_DIR = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Festas na home: as que têm data, da mais próxima para a mais distante, e depois as de data livre.
const festasHome = [...FESTAS.filter(f => f.ini), ...FESTAS.filter(f => !f.ini)].slice(0, 8);
// Dicas de carregamento: a agenda fala com o Supabase, então já abrimos a conexão e baixamos o módulo cedo.
const dicasAgenda = (extra = '') => (SUPABASE ? `<link rel="preconnect" href="${SUPABASE}" crossorigin>` : '') + '<link rel="modulepreload" href="backend.js">' + extra;

const secaoFestas = `<section class="secao larg" aria-labelledby="t-festa">
  <div class="secao-topo"><h2 id="t-festa">Próximas festas</h2>
    <div class="carrossel-ctrl"><button type="button" class="icone-btn" data-carrossel="-1" aria-label="Festas anteriores" hidden>${SETA_ESQ}</button><button type="button" class="icone-btn" data-carrossel="1" aria-label="Próximas festas" hidden>${SETA_DIR}</button><a class="link-seta" href="festas.html">Todas as festas</a></div></div>
  <ul class="carrossel carrossel-festas" tabindex="0" aria-label="Próximas festas (role para o lado)">
    ${festasHome.map(f => `<li><a class="cartao-ev cartao-festa" href="${f.pagina}" data-festa="${esc(f.id)}" data-resumo="${esc(f.texto)}" data-lema="${esc(f.lema || '')}" data-campos="${esc(JSON.stringify((f.campos || []).filter(c => c.nome && c.valor).slice(0, 6)))}"><div class="cartao-ev-capa" style="--chita:url(img/chita-${f.chita}.svg)">${f.imagem_url ? `<img src="${esc(f.imagem_url)}" alt="" loading="lazy" decoding="async">` : ''}<span class="festa-estampa" aria-hidden="true"></span>${f.ini ? `<span class="cartao-ev-data"><b>${Number(f.ini.slice(8, 10))}</b>${MESES_ABREV[Number(f.ini.slice(5, 7)) - 1]}</span>` : ''}${f.ini ? `<span class="contagem festa-contagem" data-contagem="${f.ini}" data-fim="${f.fim}"></span>` : ''}</div><div class="cartao-ev-corpo"><span class="selo">Festa</span><strong>${esc(f.nome)}</strong><span>${esc(f.quando)}</span></div></a></li>`).join('')}
  </ul>
</section>`;
// "Conheça a cidade": cada cartão tem espaço para uma foto (painel, aba "Home"); sem foto, mostra a estampa de chita.
const cartaoExplorar = (chave, href, chita, selo, titulo, texto) => `<a class="explore-card${IMAGENS[chave] ? ' com-foto' : ''}" href="${href}"><span class="explore-foto" style="--chita:url(img/chita-${chita}.svg)">${fotoSite(chave, { classe: '', sizes: '(max-width: 760px) 100vw, 380px' })}</span><span class="explore-txt"><span class="selo">${selo}</span><strong>${titulo}</strong><span>${texto}</span></span></a>`;
const secaoExplorar = `<section class="secao larg" aria-labelledby="t-explore">
  <div class="secao-topo"><h2 id="t-explore">Conheça a cidade</h2></div>
  <div class="explore explore-3">
    ${cartaoExplorar('lugares', 'lugares.html', 'azul', 'Lugares', 'Praças, igrejas e o rio', `${pontos.length} lugares para conhecer, todos no mapa.`)}
    ${cartaoExplorar('historia', 'historia.html', 'amarela', 'História', 'De 1769 até hoje', 'A vila à beira do rio, Oswaldo Cruz e a reconstrução depois de 2010.')}
    ${cartaoExplorar('servicos', 'servicos.html', 'vermelha', 'Serviços', 'Telefones, tempo e avisos', 'Prefeitura, emergências e previsão para a semana.')}
  </div>
</section>`;
// Festa a mais de 45 dias: "Conheça a cidade" sobe e as festas ficam para depois.
const festasLonge = !proximaFesta || (new Date(proximaFesta.ini + 'T00:00:00Z') - HOJE) / 864e5 > 45;

paginas.push({
  arquivo: 'index.html',
  titulo: 'São Luiz do Paraitinga: agenda ao vivo, festas e lugares',
  descricao: 'Veja no mapa o que está acontecendo agora em São Luiz do Paraitinga: eventos confirmados por moradores, festas tradicionais, lugares e serviços.',
  jsonld: [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.nome, inLanguage: 'pt-BR', description: cfg.descricao, ...(URL_SITE ? { url: URL_SITE + '/' } : {}) },
    { '@context': 'https://schema.org', '@type': 'City', name: 'São Luiz do Paraitinga', containedInPlace: { '@type': 'State', name: 'São Paulo' }, geo: { '@type': 'GeoCoordinates', latitude: -23.2219, longitude: -45.3104 } },
  ],
  dicas: dicasAgenda('<link rel="modulepreload" href="home.js"><link rel="preload" href="data/pontos.json" as="fetch" crossorigin><link rel="preload" href="mapa.svg" as="fetch" crossorigin>'
    + (IMAGENS.capa ? `<link rel="preload" as="image" href="${esc(IMAGENS.capa.url)}" imagesrcset="${esc(IMAGENS.capa.urlP)} 900w, ${esc(IMAGENS.capa.url)} 1800w" imagesizes="(max-width: 899px) 100vw, 420px" fetchpriority="high">` : '')),
  scripts: '<script src="config.js"></script>\n<script type="module" src="home.js"></script>',
  corpo: `<section class="hero larg" aria-labelledby="titulo">
  <div class="hero-grade">
    <div class="hero-capa${IMAGENS.capa ? ' com-foto' : ''}" style="--chita:url(img/chita-vermelha.svg)">
      ${fotoSite('capa', { classe: 'hero-foto', sizes: '(max-width: 899px) 100vw, 420px', prioridade: true, alt: 'Centro histórico de São Luiz do Paraitinga' })}
      <div class="hero-texto">
        <p class="olho">Vale do Paraíba · São Paulo</p>
        <h1 id="titulo">São Luiz do Paraitinga</h1>
        <p class="lema">Festas, tradição e o que está acontecendo agora na cidade, ao vivo no mapa.</p>
        <div class="painel-acoes"><a class="btn btn-claro" href="agenda.html">Ver a agenda</a><a class="btn btn-vidro" href="agenda.html#novo">Avisar um evento</a></div>
      </div>
    </div>
    <div class="mapa-caixa">
      <div id="mapa" class="mapa" role="application" aria-label="Mapa da cidade. Arraste para mover e use os botões para aproximar."></div>
      <div class="mapa-zoom"><button type="button" data-zoom="in" aria-label="Aproximar">+</button><button type="button" data-zoom="out" aria-label="Afastar">−</button><button type="button" data-zoom="reset" aria-label="Voltar à vista inicial">⌂</button></div>
      <article id="mapa-info" class="mapa-info" hidden aria-live="polite"></article>
    </div>
    <div id="vivo" class="vivo-lista" aria-live="polite"><div class="prox-card carregando-card"><span class="prox-data"></span><span class="prox-txt"><span class="sr">Carregando a agenda…</span><span class="esqueleto" style="width:38%" aria-hidden="true"></span><span class="esqueleto" style="width:82%;height:1.1em;margin-top:6px" aria-hidden="true"></span><span class="esqueleto" style="width:60%;margin-top:6px" aria-hidden="true"></span></span></div></div>
  </div>
</section>

<section class="secao larg" aria-labelledby="t-prox">
  <div class="secao-topo"><h2 id="t-prox">Próximos eventos</h2>
    <div class="carrossel-ctrl"><button type="button" class="icone-btn" data-carrossel="-1" aria-label="Eventos anteriores" hidden>${SETA_ESQ}</button><button type="button" class="icone-btn" data-carrossel="1" aria-label="Próximos eventos" hidden>${SETA_DIR}</button><a class="link-seta" href="agenda.html">Ver calendário</a></div></div>
  <ul id="proximos" class="carrossel" tabindex="0" aria-label="Próximos eventos (role para o lado)"><li class="carregando">Carregando…</li></ul>
</section>

<section class="larg secao-cta" aria-label="Avisar um evento">
  <div class="cta-avisar"><span class="cta-flor" aria-hidden="true">${FLOR}</span><div><strong>Sabe de algo acontecendo na cidade?</strong><span>Avise na agenda: o evento aparece no mapa e nos próximos eventos para todo mundo.</span></div><a class="btn btn-claro" href="agenda.html#novo">Avisar um evento</a></div>
</section>

${festasLonge ? secaoExplorar + '\n\n' + secaoFestas : secaoFestas + '\n\n' + secaoExplorar}

<dialog id="dlg-card" class="modal-card" aria-labelledby="card-titulo"><button type="button" class="card-x" data-fechar-card aria-label="Fechar">×</button><div class="card-modal" id="card-modal"><div id="card-conteudo"></div></div></dialog>`,
});

paginas.push({
  arquivo: 'agenda.html', migalha: 'Agenda',
  titulo: 'Agenda da cidade: eventos ao vivo',
  descricao: 'Agenda colaborativa de São Luiz do Paraitinga. Moradores adicionam eventos, confirmam o que está acontecendo agora e enviam fotos.',
  css: '<link rel="stylesheet" href="agenda.css">',
  dicas: dicasAgenda('<link rel="modulepreload" href="agenda.js">'),
  scripts: '<script src="config.js"></script>\n<script type="module" src="agenda.js"></script>',
  corpo: `${cabecalhoPagina('Agenda colaborativa', 'Agenda da cidade', 'Feita por quem mora aqui: adicione eventos, confirme o que está acontecendo e mande uma foto.')}
<div class="larg agenda-conta"><span id="conta" class="conta"></span></div>
<div id="aviso-demo" class="aviso-demo" hidden><strong>Modo demonstração.</strong> Os eventos e fotos marcados “exemplo” são fictícios, e o que você adicionar fica só neste navegador. Ao ligar o banco de dados, a agenda passa a ser compartilhada por todos.</div>
<div class="agenda-pagina">
  <section aria-labelledby="t-agora" id="bloco-agora">
    <div class="cabecalho-secao"><div class="agora-titulo"><h2 id="t-agora"><span class="ponto-vivo" id="ponto-agora" aria-hidden="true"></span><span id="t-agora-txt">Acontecendo agora</span></h2><p id="agora-proximo" class="agora-proximo" hidden></p></div><button type="button" class="botao-primario" id="novo-evento">+ Adicionar evento</button></div>
    <div id="agora" class="lista-agora"></div>
  </section>
  <section aria-labelledby="cal-titulo" id="bloco-cal">
    <div class="cal-barra">
      <h2 id="cal-titulo" aria-live="polite">Calendário</h2>
      <div class="cal-ctrl">
        <button type="button" class="botao-sec" id="cal-hoje">Hoje</button>
        <span class="cal-nav">
          <button type="button" class="icone-btn" id="cal-ant" aria-label="Mês anterior"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" class="icone-btn" id="cal-prox" aria-label="Próximo mês"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </span>
        <span class="seg" role="group" aria-label="Forma de exibição"><button type="button" id="vis-mes" aria-pressed="true">Mês</button><button type="button" id="vis-lista" aria-pressed="false">Lista</button></span>
      </div>
    </div>
    <div id="filtro-cat" class="filtros" role="toolbar" aria-label="Filtrar por tipo"></div>
    <div id="bloco-mes" class="cal-layout">
      <div class="cal-quadro">
        <div class="cal-semana" aria-hidden="true"><span>dom</span><span>seg</span><span>ter</span><span>qua</span><span>qui</span><span>sex</span><span>sáb</span></div>
        <div id="cal-grade" class="cal-grade"></div>
      </div>
      <aside id="cal-dia" class="cal-dia" aria-live="polite" aria-label="Eventos do dia selecionado"></aside>
    </div>
    <div id="proximos" hidden></div>
  </section>
  <section class="como-funciona" aria-labelledby="t-como">
    <h2 id="t-como">Como funciona</h2>
    <ol>
      <li><b>Viu um evento marcado?</b> Entre e adicione na agenda: o que é, onde e quando.</li>
      <li><b>Está rolando agora?</b> Na hora do evento aparece o botão <em>“Está acontecendo”</em>. Quanto mais gente confirma, mais confiável fica.</li>
      <li><b>Mande uma foto com legenda</b> para quem está em casa saber como está: “dança de fitas acontecendo agora na praça”.</li>
    </ol>
    <p class="nota">Confirmações e fotos são aceitas de 30 minutos antes até 2 horas depois do fim do evento. Conteúdo denunciado por 3 pessoas sai do ar até ser revisado.</p>
  </section>
</div>

<dialog id="dlg-entrar" class="dialogo"><form method="dialog" id="form-entrar">
  <h2>Entrar</h2><p class="nota" id="entrar-explica"></p>
  <label>Seu nome (como vai aparecer)<input name="nome" required minlength="2" maxlength="60" autocomplete="name"></label>
  <button type="button" class="botao-google" id="entrar-google" hidden><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.29h5.9a5.05 5.05 0 0 1-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.08z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.74 1.05-2.87 0-5.3-1.94-6.17-4.55H2.17v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.83 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.17a11 11 0 0 0 0 9.86l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.17 7.07l3.66 2.84C6.7 7.32 9.13 5.38 12 5.38z"/></svg>Continuar com o Google</button>
  <p class="ou" id="entrar-ou" hidden>ou receba um link por e-mail</p>
  <label id="campo-email">E-mail<input name="email" type="email" autocomplete="email"></label>
  <p class="erro" role="alert"></p>
  <div class="acoes"><button type="button" class="botao-sec" data-fechar>Cancelar</button><button class="botao-primario">Entrar</button></div>
</form></dialog>

<dialog id="dlg-evento" class="dialogo dialogo-evento"><form method="dialog" id="form-evento" autocomplete="off">
  <header class="fe-cab"><h2>Novo evento</h2><button type="button" class="fe-x" data-fechar aria-label="Fechar">×</button></header>
  <div class="fe-corpo">
    <label class="campo">Título<small>O projeto ou programa. Ex.: Bosque das Artes</small>
      <input name="titulo" required minlength="3" maxlength="120" placeholder="Nome do evento" autocapitalize="sentences" enterkeyhint="next"></label>
    <label class="campo">Subtítulo<small>O assunto ou quem vai se apresentar</small>
      <input name="subtitulo" maxlength="140" placeholder="Ex.: Camilo Frade e Caio Frade" autocapitalize="sentences" enterkeyhint="next"></label>

    <fieldset class="bloco"><legend>Quando</legend>
      <div class="atalhos" role="group" aria-label="Atalhos de data"><button type="button" data-dia-atalho="0">Hoje</button><button type="button" data-dia-atalho="1">Amanhã</button><button type="button" data-dia-atalho="sab">Sábado</button><button type="button" data-dia-atalho="dom">Domingo</button></div>
      <label class="campo">Dia<input name="dia" type="date" required></label>
      <div class="horas"><label class="campo">Começa<input name="hora_ini" type="time" required></label><label class="campo">Termina<input name="hora_fim" type="time" required></label></div>
      <label class="marca"><input type="checkbox" name="dia_todo"> Dia todo ou não sei o horário</label>
    </fieldset>

    <label class="campo">Onde<input name="local" required minlength="2" maxlength="120" list="locais" placeholder="Praça, igreja, rua…" enterkeyhint="next"></label>
    <datalist id="locais">${pontos.map(p => `<option value="${esc(p.nome)}">`).join('')}</datalist>

    <fieldset class="bloco"><legend>Tipo</legend><div class="tipos" id="tipos-evento"></div></fieldset>

    <label class="campo">Descrição completa<small>Programação, quem organiza, se é gratuito, o que levar</small>
      <textarea name="descricao" rows="5" maxlength="2000" placeholder="Conte tudo que quem vai precisa saber"></textarea><span class="contador" id="conta-desc" aria-hidden="true">0/2000</span></label>

    <label class="seletor-foto seletor-capa">Cartaz ou imagem (opcional)<input name="imagem" type="file" accept="image/*"><img id="previa-capa" alt="" hidden><span id="sem-capa">Toque para escolher o cartaz ou uma foto</span></label>
    <p class="erro" role="alert"></p>
  </div>
  <footer class="fe-rodape"><button type="button" class="botao-sec" data-fechar>Cancelar</button><button class="botao-primario">Publicar evento</button></footer>
</form></dialog>

<dialog id="dlg-foto" class="dialogo"><form method="dialog" id="form-foto">
  <h2>Mostre como está</h2><p class="nota" id="foto-evento"></p>
  <label class="seletor-foto"><input name="foto" type="file" accept="image/*" capture="environment"><img id="previa" alt="" hidden><span id="sem-foto">Tirar ou escolher uma foto (opcional)</span></label>
  <label>Legenda<input name="legenda" required maxlength="280" placeholder="Ex.: dança de fitas acontecendo agora na praça"></label>
  <p class="erro" role="alert"></p>
  <div class="acoes"><button type="button" class="botao-sec" data-fechar>Cancelar</button><button class="botao-primario">Publicar</button></div>
</form></dialog>

<dialog id="dlg-ver" class="dialogo dialogo-foto"><form method="dialog"><img id="foto-grande" alt=""><p id="legenda-grande"></p><div class="acoes"><button type="button" class="botao-sec" id="den-foto" hidden>Denunciar</button><button class="botao-sec">Fechar</button></div></form></dialog>
<div id="toast" class="toast" role="status" aria-live="polite"></div>`,
});

paginas.push({
  arquivo: 'festas.html', migalha: 'Festas',
  titulo: 'Festas e tradições: Carnaval de Marchinhas, Festa do Divino e mais',
  descricao: 'Calendário das festas de São Luiz do Paraitinga: Carnaval de Marchinhas, Festa do Divino, Festival de Marchinhas, Festa do Saci e Semana Santa.',
  jsonld: FESTAS.filter(f => f.ini).map(f => ({ '@context': 'https://schema.org', '@type': 'Festival', name: `${f.nome} de São Luiz do Paraitinga`, description: f.texto, startDate: f.ini, endDate: f.fim, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', eventStatus: 'https://schema.org/EventScheduled', location: lugarLD })),
  corpo: `${cabecalhoPagina('Calendário cultural', 'Festas e tradições', 'Marchinha, Divino, Saci: o ano de São Luiz do Paraitinga é marcado pelas festas de rua.')}
<div class="chita-faixa" aria-hidden="true"></div>
<section class="secao larg">
  <div class="festas">
    ${FESTAS.map(f => `<article class="festa" id="${f.id}"><div class="festa-topo${f.imagem_url ? ' com-imagem' : ''}" style="--chita:url(img/chita-${f.chita}.svg)">${f.imagem_url ? `<img src="${esc(f.imagem_url)}" alt="" loading="lazy" decoding="async">` : ''}</div><div class="festa-corpo"><p class="quando">${f.ini ? `<time datetime="${f.ini}">${esc(f.quando)}</time>` : esc(f.quando)}</p><h2><a href="${f.pagina}">${esc(f.nome)}</a></h2><p>${esc(f.texto)}</p>${f.ini ? `<p class="contagem" data-contagem="${f.ini}" data-fim="${f.fim}"></p>` : ''}<p class="mais"><a class="link-seta" href="${f.pagina}">História e detalhes</a></p></div></article>`).join('\n    ')}
  </div>
  <p class="nota">As datas seguem o calendário religioso e popular e podem mudar. Confirme a programação com a Prefeitura e os organizadores. Eventos do dia a dia ficam na <a href="agenda.html">agenda da cidade</a>.</p>
</section>`,
});

paginas.push({
  arquivo: 'lugares.html', migalha: 'Lugares',
  titulo: 'Lugares para conhecer: praças, igrejas e o Rio Paraitinga',
  descricao: 'Praça Dr. Oswaldo Cruz, Igreja Matriz, Capela das Mercês, Casa de Oswaldo Cruz e outros lugares de São Luiz do Paraitinga, com localização no mapa.',
  jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Lugares de São Luiz do Paraitinga', itemListElement: pontos.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': p.tipo === 'igreja' ? 'Church' : p.tipo === 'servico' ? 'CivicStructure' : 'TouristAttraction', name: p.nome, ...(p.texto ? { description: p.texto } : {}), address: lugarLD.address } })) }],
  corpo: `${cabecalhoPagina('Guia da cidade', 'Lugares', 'O centro histórico cabe numa caminhada. Estes são os pontos de referência de quem mora e de quem visita.')}
${Object.entries(TIPOS).filter(([t]) => pontos.some(p => p.tipo === t)).map(([t, nome]) => `<section class="secao larg" aria-labelledby="t-${t}">
  <div class="secao-topo"><h2 id="t-${t}">${nome}</h2></div>
  <ul class="lugares">
    ${pontos.filter(p => p.tipo === t).map(p => `<li class="lugar" id="${p.slug}" data-tipo="${t}"><h3>${esc(p.nome)}</h3><p>${esc(p.texto)}</p><a class="link-seta" href="./?lugar=${p.slug}">Ver no mapa</a></li>`).join('\n    ')}
  </ul>
</section>`).join('\n')}`,
});

paginas.push({
  arquivo: 'historia.html', migalha: 'História',
  titulo: 'História: da fundação em 1769 à reconstrução depois da enchente',
  descricao: 'A história de São Luiz do Paraitinga: a fundação em 1769, o nascimento de Oswaldo Cruz, a enchente de 2010 e a reconstrução do centro histórico.',
  corpo: `${cabecalhoPagina('Nossa história', 'Um pouco de história', 'Uma cidade que nasceu à beira do rio, e que aprendeu a recomeçar com ele.')}
<section class="secao larg estreita">
  <ol class="linha-tempo">
    <li><span class="ano">1769</span><div><h2>A vila à beira do rio</h2><p>São Luiz do Paraitinga é fundada às margens do Rio Paraitinga, no caminho entre o Vale do Paraíba e o litoral.</p></div></li>
    <li><span class="ano">1872</span><div><h2>Nasce Oswaldo Cruz</h2><p>O médico sanitarista Oswaldo Cruz nasce na cidade. A casa onde nasceu fica no centro, e a praça principal leva o seu nome.</p></div></li>
    <li><span class="ano">2010</span><div><h2>A enchente</h2><p>Na virada do ano, a cheia do rio inunda o centro histórico e derruba a Igreja Matriz. A cidade se mobiliza e reconstrói a Matriz e o casario.</p></div></li>
    <li><span class="ano">Hoje</span><div><h2>Cidade de festa e tradição</h2><p>Cerca de 10,7 mil luizenses, um centro histórico preservado e um dos carnavais de marchinha mais tradicionais do país.</p></div></li>
  </ol>
  <p class="nota">Este resumo é um ponto de partida. Tem uma história, foto antiga ou correção? A ideia é que os moradores ajudem a completar esta página.</p>
  <p><a class="btn" href="lugares.html">Conhecer os lugares</a> <a class="btn btn-sec" href="festas.html">Ver as festas</a></p>
</section>`,
});

paginas.push({
  arquivo: 'servicos.html', migalha: 'Serviços',
  titulo: 'Serviços: telefones úteis, previsão do tempo e avisos da Prefeitura',
  descricao: 'Telefones úteis de São Luiz do Paraitinga, previsão do tempo para a semana e os avisos mais recentes da Prefeitura: concursos, educação, cultura e saúde.',
  corpo: `${cabecalhoPagina('Para o dia a dia', 'Serviços', 'Telefones, previsão do tempo e o que a Prefeitura publicou de útil para o morador.')}
<section class="secao larg" aria-labelledby="t-tel">
  <div class="secao-topo"><h2 id="t-tel">Telefones úteis</h2></div>
  <ul class="telefones">
    <li><span>SAMU</span><a href="tel:192">192</a></li><li><span>Bombeiros</span><a href="tel:193">193</a></li><li><span>Polícia Militar</span><a href="tel:190">190</a></li><li><span>Defesa Civil</span><a href="tel:199">199</a></li>
    <li class="largo"><span>Prefeitura · Praça Dr. Oswaldo Cruz, 62</span><a href="tel:+551236717000">(12) 3671-7000</a></li>
  </ul>
  <p class="nota"><a href="https://www.saoluizdoparaitinga.sp.gov.br/" target="_blank" rel="noopener">Site da Prefeitura</a> · <a href="https://www.saoluizdoparaitinga.sp.gov.br/agenda" target="_blank" rel="noopener">Agenda oficial</a></p>
</section>
<section class="secao larg" id="tempo" aria-labelledby="t-tempo">
  <div class="secao-topo"><h2 id="t-tempo">Previsão do tempo</h2></div>
  <div class="tempo" data-clima-semana><p class="carregando">Carregando a previsão…</p></div>
</section>
<section class="secao larg" id="avisos" aria-labelledby="t-avisos">
  <div class="secao-topo"><h2 id="t-avisos">Avisos da Prefeitura</h2><a class="link-seta" href="https://www.saoluizdoparaitinga.sp.gov.br/noticias" target="_blank" rel="noopener">Todas as publicações</a></div>
  <ul class="avisos">${avisos.slice(0, 9).map(avisoHTML).join('') || '<li>Sem avisos recentes.</li>'}</ul>
  <p class="nota">Leis e licitações ficam no site da Prefeitura. Atualizado em ${pref.atualizado ? new Date(pref.atualizado).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : '—'}.</p>
</section>`,
});

// ---------- uma página para cada festa (SEO) ----------
gerarFestas({ paginas, FESTAS, cabecalhoPagina, esc, lugarLD });

// ---------- painel /admin (fora do menu, do sitemap e dos buscadores) ----------
const opcoesData = [['pascoa', 'Em relação à Páscoa'], ['fixa', 'Dia fixo no ano'], ['livre', 'Só texto']];
paginas.push({
  arquivo: 'admin/index.html', privada: true,
  titulo: 'Painel',
  descricao: 'Painel de administração do slparaitinga.',
  css: '<link rel="stylesheet" href="agenda.css"><link rel="stylesheet" href="admin.css">',
  dicas: dicasAgenda(),
  scripts: '<script src="config.js"></script>\n<script type="module" src="admin.js"></script>',
  corpo: `<div class="admin-topo"><div class="larg admin-topo-in">
  <h1>Painel</h1>
  <nav id="abas" class="abas" aria-label="Seções do painel" hidden><a href="#agenda">Agenda</a><a href="#festas">Festas</a><a href="#home">Fotos da home</a><a href="#usuarios" data-so-admin hidden>Usuários</a></nav>
  <div id="admin-conta" class="admin-conta"></div>
</div></div>
<section id="admin" class="larg admin-corpo" aria-live="polite"><p class="carregando">Carregando…</p></section>

<dialog id="dlg-evento" class="dialogo"><form method="dialog" id="form-ev">
  <h2 id="ev-titulo-dlg">Evento</h2>
  <label>Título<small class="ed-dica">O projeto ou programa. Ex.: Bosque das Artes</small><input name="titulo" required minlength="3" maxlength="120"></label>
  <label>Subtítulo<small class="ed-dica">O assunto ou quem vai se apresentar</small><input name="subtitulo" maxlength="140"></label>
  <label>Local<input name="local" required minlength="2" maxlength="120" list="locais-admin"></label>
  <datalist id="locais-admin">${pontos.map(p => `<option value="${esc(p.nome)}">`).join('')}<option value="Centro histórico"></datalist>
  <label>Tipo<select name="categoria"></select></label>
  <div class="linha"><label>Começa<input name="inicio" type="datetime-local" required></label><label>Termina<input name="fim" type="datetime-local" required></label></div>
  <label class="check"><input type="checkbox" id="ev-dia-todo"> Dia todo (00:00 a 23:59)</label>
  <label>Detalhes<textarea name="descricao" rows="4" maxlength="2000"></textarea></label>
  <label class="seletor-foto seletor-capa">Imagem do evento<input name="imagem" type="file" accept="image/*"><img id="ev-previa" alt="" hidden><span id="ev-sem-capa">Escolher imagem (cartaz, foto do local…)</span></label>
  <label class="check" id="ev-remover-wrap" hidden><input type="checkbox" name="remover_imagem"> Remover a imagem atual</label>
  <p class="erro" role="alert"></p>
  <div class="acoes"><button type="button" class="botao-sec" data-fechar>Cancelar</button><button class="botao-primario">Salvar</button></div>
</form></dialog>

<dialog id="dlg-link" class="dialogo"><form method="dialog" id="form-link">
  <h2>Inserir link</h2>
  <label>Endereço<input id="link-url" type="text" inputmode="url" maxlength="2000" placeholder="https://… ou historia.html" autocomplete="off"></label>
  <small class="ed-dica">Selecione antes o texto que vai virar link. Deixe vazio para cancelar.</small>
  <div class="acoes"><button type="button" class="botao-sec" data-fechar>Cancelar</button><button class="botao-primario">Aplicar</button></div>
</form></dialog>

<dialog id="dlg-confirmar" class="dialogo"><form method="dialog">
  <h2>Tem certeza?</h2><p id="confirmar-texto"></p>
  <div class="acoes"><button value="cancelar" class="botao-sec">Cancelar</button><button value="ok" class="botao-primario perigo" id="confirmar-ok">Excluir</button></div>
</form></dialog>
<div id="toast" class="toast" role="status" aria-live="polite"></div>`,
});

fs.mkdirSync(aqui('./festas'), { recursive: true });
fs.mkdirSync(aqui('./admin'), { recursive: true });
for (const p of paginas) fs.writeFileSync(aqui('./' + p.arquivo), layout(p));

// ---------- arquivos de SEO ----------
fs.writeFileSync(aqui('./img/favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -24 48 48">${FLOR_DESENHO}</svg>\n`);
// Logo completo (flor + nome) para usar fora do site: redes sociais, documentos, README.
fs.writeFileSync(aqui('./img/logo.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 64" role="img" aria-label="slparaitinga">`
  + `<g transform="translate(32 32) scale(1.25)">${FLOR_DESENHO}</g>`
  + `<text x="72" y="43" font-family="'Plus Jakarta Sans', system-ui, 'Segoe UI', Arial, sans-serif" font-weight="800" font-size="32" letter-spacing="-0.6" fill="#1d1b18">slparaitinga</text></svg>\n`);
fs.writeFileSync(aqui('./robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n${URL_SITE ? `Sitemap: ${URL_SITE}/sitemap.xml\n` : ''}`);
if (URL_SITE) {
  const urls = paginas.filter(p => !p.privada).map(p => {
    const freq = ['index.html', 'agenda.html'].includes(p.arquivo) ? 'hourly' : p.arquivo.startsWith('eventos/') ? 'monthly' : 'weekly';
    return `  <url><loc>${URL_SITE}/${p.arquivo === 'index.html' ? '' : p.arquivo}</loc><lastmod>${isoDia(HOJE)}</lastmod><changefreq>${freq}</changefreq></url>`;
  });
  fs.writeFileSync(aqui('./sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
}
console.log('Páginas:', paginas.map(p => p.arquivo).join(', '));
console.log(URL_SITE ? `Domínio: ${URL_SITE} (canonical, Open Graph e sitemap.xml gerados)` : 'AVISO: "url" vazio em site.config.json: canonical, og:url, og:image e sitemap.xml não foram gerados.');
