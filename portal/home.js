// Home: mapa no topo com o que está acontecendo agora em destaque.
import { criarBackend, janelaAberta, acontecendo } from './backend.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(dr|doutor|de|do|da|dos|das)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const corta = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hora = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaTodo = e => hora(e.inicio) === '00:00' && hora(e.fim) === '23:59'; // sem horário definido
const ate = e => (diaTodo(e) ? 'dia todo' : `até ${hora(e.fim)}`);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CORES = { praca: '#2f6b4f', igreja: '#c8452c', cultura: '#b98900', servico: '#2c5f7c' };
const TIPOS = { praca: 'Praça e natureza', igreja: 'Igreja', cultura: 'Cultura', servico: 'Serviço' };
const semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;

// A agenda (rede) carrega em paralelo com o mapa e não segura o desenho dele.
const apiPronta = criarBackend().catch(e => (console.warn('[home] agenda indisponível', e), null));
const [pontos, svgTexto] = await Promise.all([
  fetch('data/pontos.json').then(r => r.json()).catch(() => []),
  fetch('mapa.svg').then(r => r.text()).catch(() => null),
]);
let api = null, demo = false;

let eventos = [], registros = [], vivos = [];
function lugarDe(ev) {
  const a = norm(ev.local); if (a.length < 5) return null;
  return pontos.find(p => { const b = norm(p.nome); return a.includes(b) || b.includes(a); }) || null;
}
const vivosEm = p => vivos.filter(e => lugarDe(e) === p);

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
    } catch (e) { console.warn('[home] erro ao carregar a agenda', e); }
  }
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
      `<button type="button" class="vivo-item" data-ev="${e.id}"><strong>${esc(e.titulo)}${demo ? '<span class="tag-exemplo">exemplo</span>' : ''}</strong>
        <span>${esc(e.local)} · ${ate(e)}</span>${e.confirmacoes ? `<span class="conf">✔ ${e.confirmacoes} ${e.confirmacoes === 1 ? 'pessoa confirmou' : 'pessoas confirmaram'}</span>` : ''}</button>`).join('')
      + (demo ? '<p class="demo-nota">Demonstração: estes eventos são fictícios e somem quando a agenda for ligada ao banco de dados.</p>' : '');
  } else {
    const prox = eventos.find(e => new Date(e.inicio) > Date.now());
    el.innerHTML = `<p class="vivo-nada">Nada marcado neste momento.${prox ? ` <b>Próximo:</b> ${esc(prox.titulo)}, ${quando(prox.inicio)}.` : ' Sabe de algo? Avise na agenda.'}</p>`;
  }
}
$('#vivo').addEventListener('click', e => {
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
function renderProximos() {
  // Feriados nacionais ficam só na agenda: na home entram os eventos da cidade.
  const prox = eventos.filter(e => new Date(e.inicio) > Date.now() && !FERIADO_NACIONAL.test(e.titulo)).slice(0, 5);
  $('#proximos').innerHTML = prox.length ? prox.map(e => {
    const d = new Date(e.inicio);
    return `<li><a href="agenda.html"><div class="dia-bloco"><b>${d.getDate()}</b><small>${MESES[d.getMonth()]}</small></div><div><strong>${esc(e.titulo)}</strong><span>${diaTodo(e) ? 'Dia todo' : hora(d)} · ${esc(e.local)}</span></div></a></li>`;
  }).join('') : '<li class="carregando">Nenhum evento adicionado para os próximos dias. <a href="agenda.html#novo">Adicione o primeiro</a>.</li>';
}

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
    const g = novo('g', { class: 'pino', tabindex: 0, role: 'button', 'aria-label': p.nome, style: `--cor:${CORES[p.tipo] || '#6a655d'}` }, camadaPinos);
    g.dataset.slug = p.slug;
    novo('circle', { r: 6 }, g); novo('text', { x: 12, y: 4 }, g).textContent = p.nome;
    return { g, p };
  });
  let marcas = []; // { g, p }

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
    aplicar();
    if (!info.hidden && info.dataset.slug) { const p = pontos.find(x => x.slug === info.dataset.slug); if (p) abrirInfo(p); }
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
      <div class="acoes-info">${evs.length ? '<a class="link-seta" href="agenda.html">Confirmar ou enviar foto</a>' : ''}<a class="link-seta" href="lugares.html#${p.slug}">Sobre este lugar</a></div>`;
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
