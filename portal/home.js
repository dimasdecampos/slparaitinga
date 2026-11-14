// Home: mapa no topo com o que está acontecendo agora em destaque.
import { criarBackend, janelaAberta, acontecendo } from './backend.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(dr|doutor|de|do|da|dos|das)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1);
const corta = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hora = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaTodo = e => hora(e.inicio) === '00:00' && hora(e.fim) === '23:59'; // sem horário definido
const ate = e => (diaTodo(e) ? 'dia todo' : `até ${hora(e.fim)}`);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CORES = { praca: '#2f6b4f', igreja: '#c8452c', cultura: '#b98900', servico: '#2c5f7c' };
const TIPOS = { praca: 'Praça e natureza', igreja: 'Igreja', cultura: 'Cultura', servico: 'Serviço' };
const semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Ícones desenhados (o emoji 📍 muda de cara em cada sistema; no Windows nem parece um pino).
const ICONE_PINO = '<svg class="icone-pino" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s-7.5-6.6-7.5-12.2a7.5 7.5 0 0 1 15 0C19.5 15.4 12 22 12 22z" fill="#c8452c"/><circle cx="12" cy="9.8" r="2.8" fill="#fff"/></svg>';
const ICONE_CAL = '<svg class="icone-pino" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" fill="none" stroke="#c8452c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// Lugares com o nome sempre à mostra no mapa (os outros mostram ao passar o mouse ou ao aproximar).
const FIXOS = new Set(['praca-dr-oswaldo-cruz', 'igreja-matriz-sao-luis-de-tolosa', 'casa-de-oswaldo-cruz', 'mercado-municipal']);

// Última agenda vista fica guardada neste navegador: na próxima visita os cartões aparecem na hora, e a rede só atualiza.
const CACHE = 'home-agenda-v1', CACHE_VALIDADE = 12 * 36e5;
function lerCache() {
  try { const c = JSON.parse(localStorage.getItem(CACHE)); return c && Date.now() - c.t < CACHE_VALIDADE && Array.isArray(c.eventos) ? c.eventos : null; } catch { return null; }
}
function gravarCache(lista) {
  try { localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), eventos: lista.filter(e => new Date(e.fim) > Date.now()).slice(0, 60).map(e => ({ ...e, descricao: (e.descricao || '').slice(0, 900) })) })); } catch { /* sem armazenamento: tudo bem */ }
}

// A agenda (rede) carrega em paralelo com o mapa e não segura o desenho dele.
const apiPronta = criarBackend().catch(e => (console.warn('[home] agenda indisponível', e), null));
const [pontos, svgTexto] = await Promise.all([
  fetch('data/pontos.json').then(r => r.json()).catch(() => []),
  fetch('mapa.svg').then(r => r.text()).catch(() => null),
]);
let api = null, demo = false, agendaFalhou = false;

let eventos = [], registros = [], vivos = [];
function lugarDe(ev) {
  const a = norm(ev.local); if (a.length < 5) return null;
  return pontos.find(p => { const b = norm(p.nome); return a.includes(b) || b.includes(a); }) || null;
}
const vivosEm = p => vivos.filter(e => lugarDe(e) === p);
// Sem nada ao vivo, o mapa destaca o PRÓXIMO evento de verdade (só feriados nacionais ficam de fora). Local genérico
// ("Centro histórico", "São Luiz do Paraitinga") vai para a praça principal. Se o lugar não está no mapa (ex.: Mercado
// Municipal, Catuçaba), p fica nulo: o evento aparece numa etiqueta sobre o mapa, em vez de ser pulado por outro mais longe.
const GENERICO = /^(centro( historico)?|sao luiz( paraitinga)?|cidade)$/;
function proximoNoMapa() {
  if (vivos.length) return null;
  for (const e of eventos) {
    if (new Date(e.inicio) <= Date.now() || FERIADO_NACIONAL.test(e.titulo)) continue;
    return { e, p: lugarDe(e) || (GENERICO.test(norm(e.local)) ? pontos[0] : null) };
  }
  return null;
}

const pedido = new URLSearchParams(location.search).get('lugar');
const mapa = svgTexto ? montarMapa() : null;
apiPronta.then(a => { api = a; demo = a?.modo === 'demo'; return atualizar(true); });
setInterval(() => { if (!document.hidden) atualizar(false); }, 60_000);
// Ao voltar para a aba, atualiza, mas não se a última busca foi há pouco (evita buscar duas vezes ao abrir).
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - ultimaBusca > 20_000) atualizar(false); });

if (pedido && mapa) { const p = pontos.find(x => x.slug === pedido); if (p) { mapa.focar(p.x, p.y, 520); mapa.abrirInfo(p); $('#mapa').scrollIntoView({ block: 'start' }); } }

let ultimaBusca = 0;
async function atualizar(primeira) {
  ultimaBusca = Date.now();
  if (api) {
    try {
      eventos = await api.listarEventos(new Date(Date.now() - 864e5), new Date(Date.now() + 30 * 864e5));
      agendaFalhou = false;
      if (!demo) gravarCache(eventos);
    } catch (e) { console.warn('[home] erro ao carregar a agenda', e); agendaFalhou = !eventos.length; }
  } else agendaFalhou = !eventos.length;
  vivos = eventos.filter(e => acontecendo(e));
  renderPainel(); renderProximos();
  if (mapa) { mapa.marcarVivos(); if (primeira && !pedido) mapa.vistaInicial(false); }
  // As fotos só aparecem ao abrir um lugar: carregam depois, sem atrasar o resto.
  if (api) {
    try { registros = (await api.listarRegistros(eventos.filter(e => janelaAberta(e)).map(e => e.id))).filter(r => new Date(r.criado_em).toDateString() === new Date().toDateString()); } catch (e) { console.warn('[home] erro ao carregar as fotos', e); }
  }
}

function renderPainel() {
  const el = $('#vivo');
  if (vivos.length) {
    el.innerHTML = `<p class="vivo-titulo"><span class="ponto-vivo"></span>Acontecendo agora</p>` + vivos.map(e =>
      `<button type="button" class="vivo-item" data-ev="${e.id}"><strong>${esc(e.titulo)}${demo ? '<span class="tag-exemplo">exemplo</span>' : ''}</strong>${e.subtitulo ? `<span class="sub">${esc(e.subtitulo)}</span>` : ''}
        <span>${esc(e.local)} · ${ate(e)}</span>${e.confirmacoes ? `<span class="conf">✔ ${e.confirmacoes} ${e.confirmacoes === 1 ? 'pessoa confirmou' : 'pessoas confirmaram'}</span>` : ''}</button>`).join('')
      + (demo ? '<p class="demo-nota">Demonstração: estes eventos são fictícios e somem quando a agenda for ligada ao banco de dados.</p>' : '');
  } else {
    // Nada ao vivo: em vez de "nada acontecendo", mostra o próximo evento num cartão que abre os detalhes.
    const prox = proximoNoMapa()?.e || eventos.find(e => new Date(e.inicio) > Date.now() && !FERIADO_NACIONAL.test(e.titulo));
    if (prox) {
      const d = new Date(prox.inicio);
      el.innerHTML = `<button type="button" class="prox-card" data-prox="${prox.id}"><span class="prox-data" aria-hidden="true"><b>${d.getDate()}</b>${MESES[d.getMonth()]}</span>
        <span class="prox-txt"><span class="selo">Próximo evento</span><strong>${esc(prox.titulo)}</strong>${prox.subtitulo ? `<span class="prox-sub">${esc(prox.subtitulo)}</span>` : ''}<span>${esc(maiuscula(quando(prox.inicio)))} · ${esc(prox.local)}</span></span><span class="prox-seta" aria-hidden="true">›</span></button>`;
    } else if (agendaFalhou) el.innerHTML = '<p class="vivo-nada">Não deu para carregar a agenda agora. <a href="agenda.html">Abrir a agenda</a></p>';
    else el.innerHTML = '<p class="vivo-nada">Nenhum evento marcado para os próximos dias. <a href="agenda.html#novo">Sabe de algum? Avise na agenda</a></p>';
  }
}
$('#vivo').addEventListener('click', e => {
  const pc = e.target.closest('.prox-card[data-prox]');
  if (pc) { const ev = eventos.find(x => String(x.id) === pc.dataset.prox); if (ev) cardEvento(ev); return; }
  const b = e.target.closest('.vivo-item'); if (!b) return;
  const ev = vivos.find(x => String(x.id) === b.dataset.ev), p = ev && lugarDe(ev);
  if (!p || !mapa) { location.href = 'agenda.html'; return; }
  mapa.focar(p.x, p.y, mapa.celular() ? 380 : 560); mapa.abrirInfo(p);
  if (mapa.celular()) $('#mapa').scrollIntoView({ behavior: semMovimento ? 'auto' : 'smooth', block: 'start' });
});
function quando(iso) {
  const d = new Date(iso), a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0);
  const n = Math.round((b - a) / 864e5);
  return `${n === 0 ? 'hoje' : n === 1 ? 'amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}${hora(d) === '00:00' ? '' : ` às ${hora(d)}`}`;
}
const FERIADO_NACIONAL = /^(dia da consci[eê]ncia negra|dia do trabalho(?:ador)?|tiradentes|independ[eê]ncia do brasil|(?:dia da )?proclama[cç][aã]o da rep[uú]blica|finados|dia de finados|nossa senhora aparecida|confraterniza[cç][aã]o universal|ano novo|natal|sexta-feira santa)$/i;
// Cor de cada tipo de evento (a mesma da agenda): pinta a capa dos eventos que não têm imagem.
const COR_CAT = { 'Festa e tradição': '#e0263d', 'Música': '#d6338a', 'Religioso': '#2c5f7c', 'Esporte': '#2f6b4f', 'Cultura': '#d99a00', 'Feira e comércio': '#c8452c', 'Comunidade': '#6b5ca5', 'Outros': '#6a655d' };
// Evento sem cartaz: estampa de chita na cor do tipo + o ícone do tipo.
const CHITA_CAT = { 'Festa e tradição': 'vermelha', 'Música': 'amarela', 'Religioso': 'azul', 'Esporte': 'azul', 'Cultura': 'amarela', 'Feira e comércio': 'vermelha', 'Comunidade': 'azul', 'Outros': 'amarela' };
const ICONE_CAT = {
  'Festa e tradição': 'M2 5q10 6 20 0M4.5 6.4l1.3 5.3 3.3-4.1zM10 7.9l2 5.1 2-5.1zM14.9 7.6l3.3 4.1 1.3-5.3zM3 15q9 6 18 0M7.5 16.9l1 4 2.4-3.1zM13.1 17.8l2.4 3.1 1-4z',
  'Música': 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  'Religioso': 'M12 2v5M9.5 4.5h5M5 21V12l7-5 7 5v9M10 21v-5h4v5M3 21h18',
  'Esporte': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5l3.8 2.8-1.4 4.5H9.6l-1.4-4.5zM12 3v4.5M15.8 10.3l4.6-1.6M14.4 14.8l2.8 4M9.6 14.8l-2.8 4M8.2 10.3L3.6 8.7',
  'Cultura': 'M12 3a9 9 0 0 0 0 18c1.1 0 1.7-.9 1.2-1.9-.5-1 0-2.1 1.2-2.1H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  'Feira e comércio': 'M3 9h18l-2 11H5zM8 9l4-6 4 6M9 13v4M15 13v4',
  'Comunidade': 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6',
  'Outros': 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
};
const capaSemImagem = cat => `<span class="sem-imagem" style="--chita:url(img/chita-${CHITA_CAT[cat] || 'amarela'}.svg)" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${ICONE_CAT[cat] || ICONE_CAT.Outros}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
function renderProximos() {
  // Carrossel: até 10 eventos da cidade (feriados nacionais ficam só na agenda), com a imagem do evento quando houver.
  const prox = eventos.filter(e => new Date(e.inicio) > Date.now() && !FERIADO_NACIONAL.test(e.titulo)).slice(0, 10);
  $('#proximos').innerHTML = prox.length ? prox.map(e => {
    const d = new Date(e.inicio);
    return `<li><a class="cartao-ev" href="agenda.html" data-ev="${e.id}" style="--c:${COR_CAT[e.categoria] || COR_CAT.Outros}">
      <div class="cartao-ev-capa">${e.imagem_url ? `<img src="${esc(e.imagem_url)}" alt="" loading="lazy" decoding="async">` : capaSemImagem(e.categoria)}
        <span class="cartao-ev-data"><b>${d.getDate()}</b>${MESES[d.getMonth()]}</span></div>
      <div class="cartao-ev-corpo"><span class="selo">${esc(e.categoria)}</span><strong>${esc(e.titulo)}</strong>${e.subtitulo ? `<span class="cartao-ev-sub">${esc(e.subtitulo)}</span>` : ''}
        <span>${esc(maiuscula(quando(e.inicio)))}</span><span>${ICONE_PINO}${esc(e.local)}</span></div></a></li>`;
  }).join('') : agendaFalhou ? '<li class="carrossel-vazio">Não deu para carregar a agenda agora. <a href="agenda.html">Abrir a agenda</a></li>'
    : '<li class="carrossel-vazio">Nenhum evento adicionado para os próximos dias. <a href="agenda.html#novo">Adicione o primeiro</a>.</li>';
  atualizarSetas();
}
// Setas dos carrosséis (no celular basta arrastar para o lado; as setas aparecem só quando há mais para ver).
const carrosseis = [...document.querySelectorAll('.carrossel-ctrl')].map(ctrl => ({ ctrl, trilho: ctrl.closest('section').querySelector('.carrossel') })).filter(c => c.trilho);
function atualizarSetas() {
  for (const { ctrl, trilho } of carrosseis) {
    const sobra = trilho.scrollWidth - trilho.clientWidth > 4;
    ctrl.querySelectorAll('[data-carrossel]').forEach(b => {
      b.hidden = !sobra;
      b.disabled = b.dataset.carrossel === '-1' ? trilho.scrollLeft < 4 : trilho.scrollLeft > trilho.scrollWidth - trilho.clientWidth - 4;
    });
  }
}
for (const { ctrl, trilho } of carrosseis) {
  ctrl.querySelectorAll('[data-carrossel]').forEach(b => b.addEventListener('click', () => {
    const card = trilho.querySelector('li'); const passo = card ? card.getBoundingClientRect().width + 14 : 300;
    trilho.scrollBy({ left: Number(b.dataset.carrossel) * passo * Math.max(1, Math.floor(trilho.clientWidth / passo)), behavior: semMovimento ? 'auto' : 'smooth' });
  }));
  trilho.addEventListener('scroll', () => requestAnimationFrame(atualizarSetas), { passive: true });
  new ResizeObserver(atualizarSetas).observe(trilho);
}
atualizarSetas();

// Agenda da última visita: desenha já, sem esperar a rede (a busca de verdade substitui em seguida).
{
  const guardados = !eventos.length && lerCache();
  if (guardados?.length) {
    eventos = guardados; vivos = eventos.filter(e => acontecendo(e));
    renderPainel(); renderProximos();
    if (mapa) { mapa.marcarVivos(); if (!pedido) mapa.vistaInicial(false); }
  }
}

// ---------------- modal dos cartões ----------------
const dlgCard = $('#dlg-card'), corpoCard = $('#card-conteudo');
const quandoLongo = e => {
  const ini = new Date(e.inicio), fim = new Date(e.fim), dia = ini.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (diaTodo(e)) return maiuscula(dia) + ' · dia todo';
  const mesmo = ini.toDateString() === fim.toDateString();
  return `${maiuscula(dia)} · ${hora(ini)} ${mesmo ? 'às ' + hora(fim) : 'até ' + fim.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ' ' + hora(fim)}`;
};
const linkAgenda = e => {
  const f = d => d.toISOString().replace(/[-:]|.d{3}/g, '');
  const ini = new Date(e.inicio), fim = new Date(e.fim);
  const datas = diaTodo(e) ? `${ini.toLocaleDateString('sv').replace(/-/g, '')}/${new Date(+fim + 864e5).toLocaleDateString('sv').replace(/-/g, '')}` : `${f(ini)}/${f(fim)}`;
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.titulo + (e.subtitulo ? ' – ' + e.subtitulo : '')) + '&dates=' + datas + '&location=' + encodeURIComponent(e.local + ', São Luiz do Paraitinga') + '&details=' + encodeURIComponent((e.descricao || '').slice(0, 900));
};
function abrirModal(html, imagem) {
  $('#card-modal').classList.toggle('sem-imagem', !imagem);
  corpoCard.innerHTML = (imagem ? `<div class="card-img"><img src="${esc(imagem)}" alt=""></div>` : '') + `<div class="card-texto">${html}</div>`;
  dlgCard.showModal(); dlgCard.querySelector('.card-modal').scrollTop = 0;
}
function cardEvento(e) {
  const p = lugarDe(e) || (GENERICO.test(norm(e.local)) ? pontos[0] : null), agora = Date.now();
  const estado = acontecendo(e, agora) ? '<span class="pill-modal vivo">Acontecendo agora</span>' : new Date(e.inicio) > agora ? `<span class="pill-modal">${esc(maiuscula(quando(e.inicio).split(' às')[0]))}</span>` : '';
  abrirModal(`<div class="card-selos"><span class="selo" style="color:${COR_CAT[e.categoria] || COR_CAT.Outros}">${esc(e.categoria)}</span>${estado}</div>
    <h2 id="card-titulo">${esc(e.titulo)}</h2>${e.subtitulo ? `<p class="card-sub">${esc(e.subtitulo)}</p>` : ''}
    <ul class="card-info"><li><span>${ICONE_CAL}</span><div>${esc(quandoLongo(e))}</div></li><li><span>${ICONE_PINO}</span><div>${esc(e.local)}</div></li></ul>
    <div class="card-acoes">${p && mapa ? '<button type="button" class="btn btn-sec" data-card-mapa>Ver no mapa</button>' : ''}<a class="btn btn-sec" href="${esc(linkAgenda(e))}" target="_blank" rel="noopener">Adicionar ao meu calendário</a><a class="btn" href="agenda.html">Ver na agenda</a></div>
    ${e.descricao ? `<div class="card-desc">${esc(e.descricao)}</div>` : ''}
    ${e.autor ? `<p class="card-autor">Adicionado por ${esc(e.autor)}</p>` : ''}`, e.imagem_url);
  const bt = corpoCard.querySelector('[data-card-mapa]');
  if (bt) bt.onclick = () => { dlgCard.close(); mapa.focar(p.x, p.y, mapa.celular() ? 380 : 560); mapa.abrirInfo(p); $('#mapa').scrollIntoView({ behavior: semMovimento ? 'auto' : 'smooth', block: 'start' }); };
}
function cardFesta(a) {
  let campos = []; try { campos = JSON.parse(a.dataset.campos || '[]'); } catch { /* sem campos */ }
  const nome = a.querySelector('strong').textContent, quandoTxt = a.querySelector('.cartao-ev-corpo span:not(.selo)')?.textContent || '', cont = a.querySelector('.festa-contagem')?.textContent || '';
  const img = a.querySelector('.cartao-ev-capa img')?.getAttribute('src') || null;
  abrirModal(`<div class="card-selos"><span class="selo" style="color:var(--telha)">Festa</span>${cont ? `<span class="pill-modal">${esc(cont)}</span>` : ''}</div>
    <h2 id="card-titulo">${esc(nome)}</h2>${a.dataset.lema ? `<p class="card-sub">${esc(a.dataset.lema)}</p>` : ''}
    <ul class="card-info"><li><span>${ICONE_CAL}</span><div>${esc(quandoTxt)}</div></li></ul>
    ${a.dataset.resumo ? `<div class="card-desc">${esc(a.dataset.resumo)}</div>` : ''}
    ${campos.length ? `<dl class="festa-info">${campos.map(c => `<div><dt>${esc(c.nome)}</dt><dd>${esc(c.valor)}</dd></div>`).join('')}</dl>` : ''}
    <div class="card-acoes"><a class="btn" href="${esc(a.getAttribute('href'))}">Ler a página da festa</a><a class="btn btn-sec" href="festas.html">Todas as festas</a></div>`, img);
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-fechar-card]')) { dlgCard.close(); return; }
  if (e.target === dlgCard) { dlgCard.close(); return; } // clique no fundo escuro
  const a = e.target.closest('a.cartao-ev'); if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.dataset.festa) { e.preventDefault(); cardFesta(a); return; }
  const ev = a.dataset.ev && eventos.find(x => String(x.id) === a.dataset.ev);
  if (ev) { e.preventDefault(); cardEvento(ev); }
});

// ---------------- mapa ----------------
function montarMapa() {
  const area = $('#mapa'), info = $('#mapa-info');
  area.innerHTML = svgTexto;
  const svg = area.querySelector('svg'), NS = 'http://www.w3.org/2000/svg';
  const bv = svg.viewBox.baseVal, B = { x: bv.x, y: bv.y, w: bv.width, h: bv.height };
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const novo = (tag, attrs = {}, pai) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); pai?.append(el); return el; };
  const camadaPinos = novo('g', { id: 'g-pinos' }, svg), camadaVivos = novo('g', { id: 'g-vivos' }, svg);
  const celular = () => matchMedia('(max-width: 899px)').matches; // página em coluna única
  const estreito = () => area.clientWidth < 620;                  // mapa pequeno: mostra uma área menor da cidade

  const pinos = pontos.map(p => {
    const g = novo('g', { class: FIXOS.has(p.slug) ? 'pino fixo' : 'pino', tabindex: 0, role: 'button', 'aria-label': p.nome, style: `--cor:${CORES[p.tipo] || '#6a655d'}` }, camadaPinos);
    g.dataset.slug = p.slug;
    novo('circle', { r: 6 }, g); novo('text', { x: 12, y: 4 }, g).textContent = p.nome;
    return { g, p };
  });
  let marcas = []; // { g, p }
  // legenda das cores (só os tipos que existem no mapa)
  const LEGENDA = { praca: 'Praças', igreja: 'Igrejas', cultura: 'Cultura', servico: 'Serviços' };
  const legenda = document.createElement('div'); legenda.className = 'mapa-legenda'; legenda.setAttribute('aria-hidden', 'true');
  legenda.innerHTML = Object.entries(LEGENDA).filter(([t]) => pontos.some(p => p.tipo === t)).map(([t, nome]) => `<span><i style="--cor:${CORES[t]}"></i>${nome}</span>`).join('')
    + '<span class="leg-vivo"><i></i>Ao vivo</span><span class="leg-prox"><i></i>Próximo</span>';
  area.parentElement.append(legenda);

  // ----- vista -----
  const vb = { ...B }; const MINW = 220; let upp = 1, anim = 0;
  function aplicar() {
    const r = area.getBoundingClientRect(); if (!r.width || !r.height) return;
    const asp = r.height / r.width, maxW = Math.min(B.w, B.h / asp);
    vb.w = clamp(vb.w, MINW, maxW); vb.h = vb.w * asp;
    vb.x = clamp(vb.x, B.x, B.x + B.w - vb.w); vb.y = clamp(vb.y, B.y, B.y + B.h - vb.h);
    svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`);
    upp = vb.w / r.width; const k = Math.min(upp, 2.6).toFixed(3);
    for (const { g, p } of pinos) g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${k})`);
    for (const { g, p } of marcas) g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${k})`);
    area.classList.toggle('perto', upp < 0.42);
  }
  // centro do mapa em pixels (um pouco abaixo do meio, para o balão do evento caber acima do pino)
  function centroLivre() {
    const r = area.getBoundingClientRect();
    return { cx: r.width / 2, cy: r.height * 0.56, r };
  }
  let garantia = 0;
  const pararAnim = () => { cancelAnimationFrame(anim); clearTimeout(garantia); };
  function irPara(alvo, animar = true) {
    pararAnim();
    if (!animar || semMovimento) { Object.assign(vb, alvo); aplicar(); return; }
    // se o navegador pausar a animação (aba em segundo plano), chega ao destino mesmo assim
    garantia = setTimeout(() => { cancelAnimationFrame(anim); Object.assign(vb, alvo); aplicar(); }, 700);
    const de = { ...vb }, t0 = performance.now();
    const passo = t => { const q = clamp((t - t0) / 550, 0, 1), e = 1 - Math.pow(1 - q, 3); vb.x = de.x + (alvo.x - de.x) * e; vb.y = de.y + (alvo.y - de.y) * e; vb.w = de.w + (alvo.w - de.w) * e; aplicar(); if (q < 1) anim = requestAnimationFrame(passo); };
    anim = requestAnimationFrame(passo);
  }
  function focar(x, y, w, animar = true) {
    const { cx, cy, r } = centroLivre(); if (!r.width) return;
    const W = clamp(w, MINW, Math.min(B.w, B.h * r.width / r.height)), u = W / r.width;
    irPara({ x: x - cx * u, y: y - cy * u, w: W }, animar);
  }
  function zoom(f, px, py) { // px,py em pixels dentro do mapa
    const { cx, cy, r } = centroLivre(); px ??= cx; py ??= cy;
    const mx = vb.x + px * upp, my = vb.y + py * upp, W = clamp(vb.w * f, MINW, B.w), u = W / r.width;
    irPara({ x: mx - px * u, y: my - py * u, w: W }, false);
  }
  function vistaInicial(animar = true) {
    const comLugar = marcas.map(m => m.p);
    if (comLugar.length) {
      const xs = comLugar.map(p => p.x), ys = comLugar.map(p => p.y);
      const larg = Math.max(...xs) - Math.min(...xs), alt = Math.max(...ys) - Math.min(...ys);
      focar((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2 - 20, Math.max(estreito() ? 430 : 600, larg * 2.4, alt * 3.2), animar);
    } else focar(20, 40, estreito() ? 620 : 900, animar);
  }

  // ----- destaque do que está acontecendo -----
  function marcarVivos() {
    camadaVivos.replaceChildren(); marcas = [];
    for (const { g, p } of pinos) {
      const evs = vivosEm(p); g.classList.toggle('tem-vivo', evs.length > 0);
      if (!evs.length) continue;
      const m = novo('g', { class: 'vivo-marca', tabindex: 0, role: 'button', 'aria-label': `Acontecendo agora: ${evs[0].titulo}, ${p.nome}` }, camadaVivos);
      m.dataset.slug = p.slug;
      novo('circle', { class: 'onda', r: 10 }, m); novo('circle', { class: 'onda b', r: 10 }, m); novo('circle', { class: 'nucleo', r: 9 }, m);
      const b = novo('g', { class: 'balao' }, m), H = 64, base = -22;
      const caixa = novo('rect', { rx: 12, height: H, y: base - H }, b); novo('path', { d: `M-9 ${base - 1} L0 ${base + 9} L9 ${base - 1}Z` }, b);
      const t1 = novo('text', { class: 'b-agora', y: base - H + 19 }, b); t1.textContent = '● ACONTECENDO AGORA';
      const t2 = novo('text', { class: 'b-titulo', y: base - H + 38 }, b); t2.textContent = corta(evs[0].titulo, 30) + (evs.length > 1 ? ` +${evs.length - 1}` : '');
      const t3 = novo('text', { class: 'b-local', y: base - H + 54 }, b); t3.textContent = corta(p.nome, 34);
      const medir = t => { try { return t.getComputedTextLength(); } catch { return 0; } };
      const larg = Math.max(150, ...[t1, t2, t3].map(t => medir(t) || t.textContent.length * 7.6)) + 28;
      caixa.setAttribute('width', larg); caixa.setAttribute('x', -larg / 2);
      for (const t of [t1, t2, t3]) t.setAttribute('x', -larg / 2 + 14);
      marcas.push({ g: m, p });
    }
    const prox = proximoNoMapa();
    atualizarEtiquetaProximo(prox && !prox.p ? prox.e : null);
    if (prox && prox.p) { // nada ao vivo: destaca o próximo evento (ponto amarelo parado, sem a onda do "ao vivo")
      const { e, p } = prox, d = new Date(e.inicio);
      const dia = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').toUpperCase();
      const m = novo('g', { class: 'vivo-marca proximo-marca', tabindex: 0, role: 'button', 'aria-label': `Próximo evento: ${e.titulo}, ${quando(e.inicio)}, ${p.nome}` }, camadaVivos);
      m.dataset.slug = p.slug;
      novo('circle', { class: 'nucleo', r: 9 }, m);
      const b = novo('g', { class: 'balao' }, m), H = 64, base = -22;
      const caixa = novo('rect', { rx: 12, height: H, y: base - H }, b); novo('path', { d: `M-9 ${base - 1} L0 ${base + 9} L9 ${base - 1}Z` }, b);
      const t1 = novo('text', { class: 'b-agora', y: base - H + 19 }, b); t1.textContent = `PRÓXIMO · ${dia}${diaTodo(e) ? '' : `, ${hora(d)}`}`;
      const t2 = novo('text', { class: 'b-titulo', y: base - H + 38 }, b); t2.textContent = corta(e.titulo, 30);
      const t3 = novo('text', { class: 'b-local', y: base - H + 54 }, b); t3.textContent = corta(lugarDe(e) ? p.nome : e.local, 34);
      const medir = t => { try { return t.getComputedTextLength(); } catch { return 0; } };
      const larg = Math.max(150, ...[t1, t2, t3].map(t => medir(t) || t.textContent.length * 7.6)) + 28;
      caixa.setAttribute('width', larg); caixa.setAttribute('x', -larg / 2);
      for (const t of [t1, t2, t3]) t.setAttribute('x', -larg / 2 + 14);
      marcas.push({ g: m, p });
    }
    aplicar();
    if (!info.hidden && info.dataset.slug) { const p = pontos.find(x => x.slug === info.dataset.slug); if (p) abrirInfo(p); }
  }

  // etiqueta sobre o mapa para o próximo evento cujo lugar não tem ponto no mapa
  function atualizarEtiquetaProximo(e) {
    let el = document.getElementById('mapa-proximo');
    if (!e) { el?.remove(); return; }
    if (!el) { el = document.createElement('a'); el.id = 'mapa-proximo'; el.className = 'mapa-proximo'; el.href = 'agenda.html'; area.parentElement.append(el); }
    el.innerHTML = `<span class="selo">Próximo evento</span><strong>${esc(corta(e.titulo, 40))}</strong>${e.subtitulo ? `<span>${esc(corta(e.subtitulo, 50))}</span>` : ''}<span>${esc(maiuscula(quando(e.inicio)))} · ${esc(e.local)}</span>`;
  }

  // ----- ficha do lugar -----
  function abrirInfo(p) {
    const evs = vivosEm(p);
    for (const x of pinos) x.g.classList.toggle('sel', x.p === p);
    document.querySelectorAll('.vivo-item').forEach(b => b.classList.toggle('sel', evs.some(e => String(e.id) === b.dataset.ev)));
    info.dataset.slug = p.slug;
    info.innerHTML = `<button type="button" class="fechar" aria-label="Fechar">×</button><span class="selo">${esc(TIPOS[p.tipo] || '')}</span><h2>${esc(p.nome)}</h2>${p.texto ? `<p>${esc(p.texto)}</p>` : ''}
      ${evs.map(e => { const fotos = registros.filter(r => r.evento_id === e.id && r.foto_url).slice(0, 4);
        return `<div class="ao-vivo"><p class="vivo-titulo"><span class="ponto-vivo"></span>Acontecendo agora</p><strong>${esc(e.titulo)}${demo ? '<span class="tag-exemplo">exemplo</span>' : ''}</strong><span>${ate(e)}${e.confirmacoes ? ` · ✔ ${e.confirmacoes} ${e.confirmacoes === 1 ? 'confirmação' : 'confirmações'}` : ''}</span>
          ${fotos.length ? `<div class="fotinhas">${fotos.map(r => `<img src="${esc(r.foto_url)}" alt="${esc(r.legenda)}" loading="lazy">`).join('')}</div>` : ''}</div>`; }).join('')}
      ${(() => { const prox = proximoNoMapa(); if (!prox || prox.p !== p) return ''; const e = prox.e;
        return `<div class="ao-vivo proximo"><p class="vivo-titulo">Próximo evento</p><strong>${esc(e.titulo)}</strong>${e.subtitulo ? `<span>${esc(e.subtitulo)}</span>` : ''}<span>${esc(maiuscula(quando(e.inicio)))}${lugarDe(e) ? '' : ` · ${esc(e.local)}`}</span></div>`; })()}
      <div class="acoes-info">${evs.length ? '<a class="link-seta" href="agenda.html">Confirmar ou enviar foto</a>' : proximoNoMapa()?.p === p ? '<a class="link-seta" href="agenda.html">Ver na agenda</a>' : ''}<a class="link-seta" href="lugares.html#${p.slug}">Sobre este lugar</a></div>`;
    info.hidden = false;
    info.querySelector('.fechar').onclick = fecharInfo;
  }
  function fecharInfo() { info.hidden = true; delete info.dataset.slug; pinos.forEach(x => x.g.classList.remove('sel')); document.querySelectorAll('.vivo-item.sel').forEach(b => b.classList.remove('sel')); }
  const alvoDe = el => { const g = el?.closest?.('.vivo-marca, .pino'); return g ? pontos.find(p => p.slug === g.dataset.slug) : null; };
  svg.addEventListener('keydown', e => { const p = alvoDe(e.target); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirInfo(p); } });

  // ----- arrastar, pinça, zoom -----
  const toques = new Map(); let inicio = null, arrastou = false;
  const guardar = () => { inicio = toques.size ? { vb: { ...vb }, upp, pts: [...toques.values()].map(p => [...p]) } : null; };
  area.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pararAnim(); toques.set(e.pointerId, [e.clientX, e.clientY]); arrastou = false; guardar();
  });
  area.addEventListener('pointermove', e => {
    if (!toques.has(e.pointerId) || !inicio) return;
    toques.set(e.pointerId, [e.clientX, e.clientY]); const pts = [...toques.values()];
    if (pts.length === 1 && inicio.pts.length === 1) {
      const dx = pts[0][0] - inicio.pts[0][0], dy = pts[0][1] - inicio.pts[0][1];
      if (!arrastou && Math.hypot(dx, dy) < 5) return;
      if (!arrastou) { arrastou = true; area.classList.add('arrastando'); try { area.setPointerCapture(e.pointerId); } catch {} }
      vb.x = inicio.vb.x - dx * inicio.upp; vb.y = inicio.vb.y - dy * inicio.upp; vb.w = inicio.vb.w; aplicar();
    } else if (pts.length === 2 && inicio.pts.length === 2) {
      arrastou = true;
      const d0 = Math.hypot(inicio.pts[0][0] - inicio.pts[1][0], inicio.pts[0][1] - inicio.pts[1][1]), d1 = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      const r = area.getBoundingClientRect(), px = (pts[0][0] + pts[1][0]) / 2 - r.left, py = (pts[0][1] + pts[1][1]) / 2 - r.top;
      Object.assign(vb, inicio.vb); upp = inicio.upp; zoom(d0 / Math.max(d1, 1), px, py);
    }
  });
  const soltar = e => {
    if (!toques.has(e.pointerId)) return;
    toques.delete(e.pointerId); area.classList.remove('arrastando');
    if (!arrastou && e.type === 'pointerup') { const p = alvoDe(document.elementFromPoint(e.clientX, e.clientY)); if (p) abrirInfo(p); }
    guardar();
  };
  area.addEventListener('pointerup', soltar); area.addEventListener('pointercancel', soltar);
  area.addEventListener('wheel', e => { // roda do mouse rola a página; Ctrl + roda (ou pinça no touchpad) aproxima
    if (!e.ctrlKey && !e.metaKey) return; e.preventDefault();
    const r = area.getBoundingClientRect(); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  area.addEventListener('dblclick', e => { const r = area.getBoundingClientRect(); const { x, y, w } = vb; zoom(1 / 1.7, e.clientX - r.left, e.clientY - r.top); const alvo = { ...vb }; Object.assign(vb, { x, y, w }); irPara(alvo); });
  document.querySelector('.mapa-zoom').addEventListener('click', e => {
    const z = e.target.closest('button')?.dataset.zoom; if (!z) return;
    if (z === 'reset') { fecharInfo(); vistaInicial(); return; }
    const { x, y, w } = vb; zoom(z === 'in' ? 1 / 1.6 : 1.6); const alvo = { ...vb }; Object.assign(vb, { x, y, w }); irPara(alvo);
  });
  new ResizeObserver(aplicar).observe(area);

  focar(20, 40, estreito() ? 620 : 900, false);
  return { focar, abrirInfo, marcarVivos, vistaInicial, celular };
}
