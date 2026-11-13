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
const FESTAS = [
  { id: 'festival-de-marchinhas', nome: 'Festival de Marchinhas “Nhô Frade”', chita: 'amarela', quando: 'Em janeiro, antes do Carnaval', texto: 'Concurso de marchinhas inéditas que abre a temporada de Carnaval. Leva o nome do músico luizense Álvaro José Frade.' },
  { id: 'carnaval-de-marchinhas', nome: 'Carnaval de Marchinhas', chita: 'vermelha', datas: y => [mais(pascoa(y), -51), mais(pascoa(y), -47)], texto: 'Blocos, bonecões e marchinhas compostas na própria cidade tomam as ruas do centro histórico. A chita é a marca registrada das fantasias.' },
  { id: 'semana-santa', nome: 'Semana Santa', chita: 'azul', datas: y => [mais(pascoa(y), -7), pascoa(y)], texto: 'Procissões e celebrações pelas ruas do centro histórico.' },
  { id: 'festa-do-divino', nome: 'Festa do Divino Espírito Santo', chita: 'azul', datas: y => [mais(pascoa(y), 40), mais(pascoa(y), 49)], texto: 'Bandeiras do Divino, congadas, moçambiques, cavalhada e o afogado servido a todos. Termina no domingo de Pentecostes.' },
  { id: 'sao-luis-de-tolosa', nome: 'Festa de São Luís de Tolosa', chita: 'amarela', datas: y => [fixa(y, 8, 19), fixa(y, 8, 19)], texto: 'Dia do padroeiro da cidade, celebrado na Igreja Matriz.' },
  { id: 'festa-do-saci', nome: 'Festa do Saci', chita: 'vermelha', datas: y => [fixa(y, 10, 31), fixa(y, 10, 31)], texto: 'Em 31 de outubro a cidade celebra o folclore brasileiro e a tradição caipira.' },
].map(f => {
  if (!f.datas) return f;
  let [ini, fim] = f.datas(HOJE.getUTCFullYear());
  if (isoDia(fim) < isoDia(HOJE)) [ini, fim] = f.datas(HOJE.getUTCFullYear() + 1);
  const fmt = d => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return { ...f, ini: isoDia(ini), fim: isoDia(fim), quando: isoDia(ini) === isoDia(fim) ? `${fmt(ini)} de ${ini.getUTCFullYear()}` : `${fmt(ini)} a ${fmt(fim)} de ${fim.getUTCFullYear()}` };
}).sort((a, b) => (a.ini || '0').localeCompare(b.ini || '0'));
FESTAS.forEach(f => { f.pagina = `festas/${f.id}.html`; });
const proximaFesta = FESTAS.find(f => f.ini);

// ---------- layout ----------
const NAV = [['./', 'Início', 'index.html'], ['agenda.html', 'Agenda'], ['festas.html', 'Festas'], ['lugares.html', 'Lugares'], ['historia.html', 'História'], ['servicos.html', 'Serviços']];
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
function layoutBase({ arquivo, titulo, descricao, corpo, scripts = '', css = '', jsonld = [], migalha }) {
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
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css">
${css}
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
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

paginas.push({
  arquivo: 'index.html',
  titulo: 'São Luiz do Paraitinga: agenda ao vivo, festas e lugares',
  descricao: 'Veja no mapa o que está acontecendo agora em São Luiz do Paraitinga: eventos confirmados por moradores, festas tradicionais, lugares e serviços.',
  jsonld: [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.nome, inLanguage: 'pt-BR', description: cfg.descricao, ...(URL_SITE ? { url: URL_SITE + '/' } : {}) },
    { '@context': 'https://schema.org', '@type': 'City', name: 'São Luiz do Paraitinga', containedInPlace: { '@type': 'State', name: 'São Paulo' }, geo: { '@type': 'GeoCoordinates', latitude: -23.2219, longitude: -45.3104 } },
  ],
  scripts: '<script src="config.js"></script>\n<script type="module" src="home.js"></script>',
  corpo: `<section class="hero larg" aria-labelledby="titulo">
  <div class="hero-grade">
    <div class="hero-texto">
      <p class="olho">Vale do Paraíba · São Paulo</p>
      <h1 id="titulo">São Luiz do Paraitinga</h1>
      <p class="lema">O que está acontecendo na cidade, ao vivo no mapa.</p>
      <div class="painel-acoes"><a class="btn" href="agenda.html">Agenda completa</a><a class="btn btn-sec" href="agenda.html#novo">Avisar um evento</a></div>
    </div>
    <div class="mapa-caixa">
      <div id="mapa" class="mapa" role="application" aria-label="Mapa da cidade. Arraste para mover e use os botões para aproximar."></div>
      <div class="mapa-zoom"><button type="button" data-zoom="in" aria-label="Aproximar">+</button><button type="button" data-zoom="out" aria-label="Afastar">−</button><button type="button" data-zoom="reset" aria-label="Voltar à vista inicial">⌂</button></div>
      <article id="mapa-info" class="mapa-info" hidden aria-live="polite"></article>
    </div>
    <div id="vivo" class="vivo-lista" aria-live="polite"><p class="carregando">Carregando a agenda…</p></div>
  </div>
</section>

<div class="larg home-colunas">
  <section class="secao" aria-labelledby="t-prox">
    <div class="secao-topo"><h2 id="t-prox">Próximos eventos</h2><a class="link-seta" href="agenda.html">Ver calendário</a></div>
    <ul id="proximos" class="cartoes-evento"><li class="carregando">Carregando…</li></ul>
  </section>
  <div class="coluna-lateral">
    <section class="secao" aria-labelledby="t-festa">
      <div class="secao-topo"><h2 id="t-festa">Próxima festa</h2><a class="link-seta" href="festas.html">Todas as festas</a></div>
      <a class="explore-card destaque" href="${proximaFesta.pagina || 'festas.html'}" style="--chita:url(img/chita-${proximaFesta.chita}.svg)"><strong>${esc(proximaFesta.nome)}</strong><span>${esc(proximaFesta.quando)}</span><span class="contagem" data-contagem="${proximaFesta.ini}" data-fim="${proximaFesta.fim}"></span></a>
    </section>
  </div>
</div>

<section class="secao larg" aria-labelledby="t-explore">
  <div class="secao-topo"><h2 id="t-explore">Conheça a cidade</h2></div>
  <div class="explore explore-3">
    <a class="explore-card" href="lugares.html"><span class="selo">Lugares</span><strong>Praças, igrejas e o rio</strong><span>${pontos.length} lugares para conhecer, todos no mapa.</span></a>
    <a class="explore-card" href="historia.html"><span class="selo">História</span><strong>De 1769 até hoje</strong><span>A vila à beira do rio, Oswaldo Cruz e a reconstrução depois de 2010.</span></a>
    <a class="explore-card" href="servicos.html"><span class="selo">Serviços</span><strong>Telefones, tempo e avisos</strong><span>Prefeitura, emergências e previsão para a semana.</span></a>
  </div>
</section>`,
});

paginas.push({
  arquivo: 'agenda.html', migalha: 'Agenda',
  titulo: 'Agenda da cidade: eventos ao vivo',
  descricao: 'Agenda colaborativa de São Luiz do Paraitinga. Moradores adicionam eventos, confirmam o que está acontecendo agora e enviam fotos.',
  css: '<link rel="stylesheet" href="agenda.css">',
  scripts: '<script src="config.js"></script>\n<script type="module" src="agenda.js"></script>',
  corpo: `${cabecalhoPagina('Agenda colaborativa', 'Agenda da cidade', 'Feita por quem mora aqui: adicione eventos, confirme o que está acontecendo e mande uma foto.')}
<div class="larg agenda-conta"><span id="conta" class="conta"></span></div>
<div id="aviso-demo" class="aviso-demo" hidden><strong>Modo demonstração.</strong> Os eventos e fotos marcados “exemplo” são fictícios, e o que você adicionar fica só neste navegador. Ao ligar o banco de dados, a agenda passa a ser compartilhada por todos.</div>
<div class="agenda-pagina">
  <section aria-labelledby="t-agora" id="bloco-agora">
    <div class="cabecalho-secao"><h2 id="t-agora"><span class="ponto-vivo" aria-hidden="true"></span>Acontecendo agora</h2><button type="button" class="botao-primario" id="novo-evento">+ Adicionar evento</button></div>
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

<dialog id="dlg-evento" class="dialogo"><form method="dialog" id="form-evento">
  <h2>Adicionar evento</h2>
  <label>O que vai acontecer?<input name="titulo" required minlength="3" maxlength="120" placeholder="Ex.: Dança de fitas, show, missa, feira…"></label>
  <label>Onde?<input name="local" required minlength="2" maxlength="120" list="locais" placeholder="Ex.: Praça Dr. Oswaldo Cruz"></label>
  <datalist id="locais">${pontos.map(p => `<option value="${esc(p.nome)}">`).join('')}<option value="Mercado Municipal"></datalist>
  <div class="linha"><label>Dia<input name="dia" type="date" required></label><label>Começa<input name="hora_ini" type="time" required></label><label>Termina<input name="hora_fim" type="time" required></label></div>
  <label>Tipo<select name="categoria" id="sel-categoria"></select></label>
  <label>Detalhes (opcional)<textarea name="descricao" rows="3" maxlength="2000" placeholder="Quem organiza, se é gratuito, o que levar…"></textarea></label>
  <p class="erro" role="alert"></p>
  <div class="acoes"><button type="button" class="botao-sec" data-fechar>Cancelar</button><button class="botao-primario">Publicar</button></div>
</form></dialog>

<dialog id="dlg-foto" class="dialogo"><form method="dialog" id="form-foto">
  <h2>Mostre como está</h2><p class="nota" id="foto-evento"></p>
  <label class="seletor-foto"><input name="foto" type="file" accept="image/*" capture="environment"><img id="previa" alt="" hidden><span id="sem-foto">Tirar ou escolher uma foto (opcional)</span></label>
  <label>Legenda<input name="legenda" required maxlength="280" placeholder="Ex.: dança de fitas acontecendo agora na praça"></label>
  <p class="erro" role="alert"></p>
  <div class="acoes"><button type="button" class="botao-sec" data-fechar>Cancelar</button><button class="botao-primario">Publicar</button></div>
</form></dialog>

<dialog id="dlg-ver" class="dialogo dialogo-foto"><form method="dialog"><img id="foto-grande" alt=""><p id="legenda-grande"></p><div class="acoes"><button class="botao-sec">Fechar</button></div></form></dialog>
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
    ${FESTAS.map(f => `<article class="festa" id="${f.id}"><div class="festa-topo" style="--chita:url(img/chita-${f.chita}.svg)"></div><div class="festa-corpo"><p class="quando">${f.ini ? `<time datetime="${f.ini}">${esc(f.quando)}</time>` : esc(f.quando)}</p><h2><a href="${f.pagina}">${esc(f.nome)}</a></h2><p>${esc(f.texto)}</p>${f.ini ? `<p class="contagem" data-contagem="${f.ini}" data-fim="${f.fim}"></p>` : ''}<p class="mais"><a class="link-seta" href="${f.pagina}">História e detalhes</a></p></div></article>`).join('\n    ')}
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
await import('./festas-conteudo.mjs').then(m => m.gerar({ paginas, FESTAS, cabecalhoPagina, esc, lugarLD }));

fs.mkdirSync(aqui('./festas'), { recursive: true });
for (const p of paginas) fs.writeFileSync(aqui('./' + p.arquivo), layout(p));

// ---------- arquivos de SEO ----------
fs.writeFileSync(aqui('./img/favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -24 48 48">${FLOR_DESENHO}</svg>\n`);
// Logo completo (flor + nome) para usar fora do site: redes sociais, documentos, README.
fs.writeFileSync(aqui('./img/logo.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 64" role="img" aria-label="slparaitinga">`
  + `<g transform="translate(32 32) scale(1.25)">${FLOR_DESENHO}</g>`
  + `<text x="72" y="43" font-family="'Plus Jakarta Sans', system-ui, 'Segoe UI', Arial, sans-serif" font-weight="800" font-size="32" letter-spacing="-0.6" fill="#1d1b18">slparaitinga</text></svg>\n`);
fs.writeFileSync(aqui('./robots.txt'), `User-agent: *\nAllow: /\n${URL_SITE ? `Sitemap: ${URL_SITE}/sitemap.xml\n` : ''}`);
if (URL_SITE) {
  const urls = paginas.map(p => {
    const freq = ['index.html', 'agenda.html'].includes(p.arquivo) ? 'hourly' : p.arquivo.startsWith('eventos/') ? 'monthly' : 'weekly';
    return `  <url><loc>${URL_SITE}/${p.arquivo === 'index.html' ? '' : p.arquivo}</loc><lastmod>${isoDia(HOJE)}</lastmod><changefreq>${freq}</changefreq></url>`;
  });
  fs.writeFileSync(aqui('./sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
}
console.log('Páginas:', paginas.map(p => p.arquivo).join(', '));
console.log(URL_SITE ? `Domínio: ${URL_SITE} (canonical, Open Graph e sitemap.xml gerados)` : 'AVISO: "url" vazio em site.config.json: canonical, og:url, og:image e sitemap.xml não foram gerados.');
