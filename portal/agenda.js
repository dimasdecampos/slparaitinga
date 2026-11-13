import { criarBackend, CATEGORIAS, janelaAberta, acontecendo, encerrado } from './backend.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hora = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DIAS_FRENTE = 45;
// Eventos sem horário definido ficam gravados de 00:00 a 23:59 e aparecem como "Dia todo".
const diaTodo = e => hora(e.inicio) === '00:00' && hora(e.fim) === '23:59';
const dataCurta = d => new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
function faixa(e) { // [texto grande, texto pequeno] do horário nos cartões
  if (!diaTodo(e)) return [hora(e.inicio), `até ${hora(e.fim)}`];
  return ['Dia todo', new Date(e.inicio).toDateString() === new Date(e.fim).toDateString() ? '' : `${dataCurta(e.inicio)} a ${dataCurta(e.fim)}`];
}

// Cor de cada tipo de evento (usada nos blocos do calendário e nos filtros).
const COR_CAT = { 'Festa e tradição': '#e0263d', 'Música': '#d6338a', 'Religioso': '#2c5f7c', 'Esporte': '#2f6b4f', 'Cultura': '#d99a00', 'Feira e comércio': '#c8452c', 'Comunidade': '#6b5ca5', 'Outros': '#6a655d' };
const corDe = c => COR_CAT[c] || COR_CAT.Outros;
const chave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // AAAA-MM-DD no fuso local
const doDia = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const primeiroDia = d => new Date(d.getFullYear(), d.getMonth(), 1);
const maiuscula = s => s[0].toUpperCase() + s.slice(1);
const mesmoMes = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const lerVisao = () => { try { return localStorage.getItem('agenda-visao') === 'lista' ? 'lista' : 'mes'; } catch { return 'mes'; } };

const api = await criarBackend();
let eventos = [], registros = [], filtro = 'Todos', eventoFoto = null;
let mes = primeiroDia(new Date()), diaSel = chave(new Date()), visao = lerVisao();

$('#aviso-demo').hidden = api.modo !== 'demo';
$('#sel-categoria').innerHTML = CATEGORIAS.map(c => `<option>${esc(c)}</option>`).join('');

// ---------- utilidades ----------
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }
function haQuanto(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 6e4);
  if (m < 1) return 'agora mesmo'; if (m < 60) return `há ${m} min`; const h = Math.round(m / 60); return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}
function rotuloDia(d) {
  const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0);
  const n = Math.round((b - a) / 864e5);
  if (n === 0) return 'Hoje'; if (n === 1) return 'Amanhã';
  const s = b.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1);
}
// Reduz a foto antes de enviar (economiza dados no celular). O <img> já aplica a rotação da câmera (EXIF).
// Se algo falhar, envia o arquivo original.
async function comprimir(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    await Promise.race([img.decode(), new Promise((_, n) => setTimeout(() => n(new Error('tempo esgotado')), 8000))]);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    return blob || file;
  } catch (e) { console.warn('[agenda] não foi possível reduzir a foto', e); return file; }
  finally { URL.revokeObjectURL(url); }
}
function exigirLogin(depois) {
  if (api.usuario()) return true;
  abrirEntrar(depois); return false;
}

// ---------- conta ----------
function renderConta() {
  const u = api.usuario();
  $('#conta').innerHTML = u ? `Olá, <b>${esc(u.nome)}</b> <button type="button" id="sair">Sair</button>` : `<button type="button" id="entrar">Entrar para participar</button>`;
  $('#sair')?.addEventListener('click', async () => { await api.sair(); toast('Você saiu.'); });
  $('#entrar')?.addEventListener('click', () => abrirEntrar());
}
api.aoMudarUsuario(() => { renderConta(); carregar(); });
let aposEntrar = null;
function abrirEntrar(depois) {
  aposEntrar = depois || null;
  const f = $('#form-entrar');
  f.querySelector('.erro').textContent = '';
  $('#campo-email').hidden = !api.precisaEmail; f.email.required = api.precisaEmail;
  $('#entrar-google').hidden = $('#entrar-ou').hidden = !api.google;
  $('#entrar-explica').textContent = api.google
    ? 'Entre com a sua conta Google, sem criar senha. Ou receba um link de acesso no e-mail.'
    : api.precisaEmail
      ? 'Enviamos um link de acesso para o seu e-mail. Não precisa criar senha.'
      : 'Na demonstração basta um nome. Com o banco ligado, o acesso será por um link enviado ao e-mail.';
  api.preparar?.(); // baixa o módulo de login enquanto a pessoa escolhe
  $('#dlg-entrar').showModal();
}
$('#entrar-google').addEventListener('click', async e => {
  const btn = e.currentTarget, erro = $('#form-entrar').querySelector('.erro');
  btn.disabled = true; erro.textContent = '';
  try { await api.entrarComGoogle(); } // redireciona para o Google; ao voltar a sessão já está ativa
  catch (err) { erro.textContent = err.message; btn.disabled = false; }
});
$('#form-entrar').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, btn = f.querySelector('.botao-primario');
  btn.disabled = true;
  try {
    const r = await api.entrar({ nome: f.nome.value.trim(), email: f.email.value.trim() });
    $('#dlg-entrar').close();
    if (r.aguardandoEmail) toast('Pronto! Abra o link que enviamos para o seu e-mail.');
    else { toast(`Bem-vindo(a), ${f.nome.value.trim()}!`); aposEntrar?.(); }
  } catch (err) { f.querySelector('.erro').textContent = err.message; }
  finally { btn.disabled = false; }
});
document.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- dados ----------
async function carregar() {
  try {
    // Busca os próximos dias (para "acontecendo agora" e a lista) e também o mês que está na tela.
    let de = new Date(Date.now() - 864e5), ate = new Date(Date.now() + DIAS_FRENTE * 864e5);
    const [gIni, gFim] = limitesGrade(mes);
    if (gIni < de) de = gIni;
    if (gFim > ate) ate = gFim;
    eventos = await api.listarEventos(de, ate);
    render();                                   // o calendário aparece sem esperar as fotos
    const vivos = eventos.filter(e => janelaAberta(e));
    registros = await api.listarRegistros(vivos.map(e => e.id));
    render();
  } catch (err) { console.error(err); toast(err.message || 'Erro ao carregar a agenda.'); }
}

// ---------- renderização ----------
function render() {
  const agora = Date.now();
  const vivos = eventos.filter(e => !encerrado(e) && (acontecendo(e, agora) || (janelaAberta(e, agora) && new Date(e.inicio) <= agora)));
  const vivosIds = new Set(vivos.map(e => e.id));
  const u = api.usuario();

  $('#agora').innerHTML = vivos.length ? vivos.map(e => {
    const regs = registros.filter(r => r.evento_id === e.id);
    const encerrado = agora > new Date(e.fim);
    const conf = e.confirmacoes > 0
      ? `<span class="selo-conf">✔ ${e.confirmacoes} ${e.confirmacoes === 1 ? 'pessoa confirmou' : 'pessoas confirmaram'}</span><span class="meta">última confirmação ${haQuanto(e.ultima_confirmacao)}</span>`
      : `<span class="selo-conf zero">Ninguém confirmou ainda. Você está lá?</span>`;
    return `<article class="vivo" data-id="${e.id}">
      <span class="selo">${esc(e.categoria)}${encerrado ? ' · terminou agora há pouco' : ''}</span>
      <h3>${esc(e.titulo)}</h3>
      <div class="onde">📍 ${esc(e.local)} · ${diaTodo(e) ? 'dia todo' : `${hora(e.inicio)}–${hora(e.fim)}`}</div>
      ${e.descricao ? `<p class="desc">${esc(e.descricao)}</p>` : ''}
      <div class="termometro">${conf}</div>
      <div class="acoes-vivo">
        ${e.eu_confirmei
          ? `<button type="button" class="botao-primario ja" disabled>✔ Você confirmou</button>`
          : `<button type="button" class="botao-primario" data-acao="confirmar">✋ Está acontecendo</button>`}
        <button type="button" class="botao-sec" data-acao="foto">📷 Enviar foto</button>
        ${e.eu_encerrei
          ? `<button type="button" class="botao-sec" disabled>🏁 Você avisou que terminou</button>`
          : `<button type="button" class="botao-sec" data-acao="encerrar">🏁 Já terminou</button>`}
      </div>
      ${e.encerramentos ? `<p class="meta">${e.encerramentos} ${e.encerramentos === 1 ? 'pessoa avisou' : 'pessoas avisaram'} que já terminou. Com 2 avisos o evento sai de “Acontecendo agora”.</p>` : ''}
      ${regs.length ? `<div class="fotos">${regs.map(r => registroHTML(r, u)).join('')}</div>` : ''}
    </article>`;
  }).join('') : `<p class="nada-agora">Nenhum evento acontecendo neste momento. Sabe de algo rolando? <a href="#" data-acao="novo">Adicione na agenda</a>.</p>`;

  renderFiltro();
  renderBarra();
  if (visao === 'mes') { renderCalendario(); renderDia(); } else renderLista(vivosIds);
}

// ---------- calendário (visão de mês) ----------
// Primeiro dia exibido (domingo) e o dia seguinte ao último exibido, para buscar os eventos do mês na tela.
function limitesGrade(m) {
  const sem = new Date(m.getFullYear(), m.getMonth(), 1).getDay();
  const dias = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const linhas = Math.ceil((sem + dias) / 7);
  return [new Date(m.getFullYear(), m.getMonth(), 1 - sem), new Date(m.getFullYear(), m.getMonth(), 1 - sem + linhas * 7), linhas];
}
function eventosDoDia(k) {
  const ini = doDia(k), fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 1);
  return eventos.filter(e => (filtro === 'Todos' || e.categoria === filtro) && new Date(e.inicio) < fim && new Date(e.fim) > ini)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}
function renderFiltro() {
  const cats = [...new Set(eventos.map(e => e.categoria))].sort((a, b) => CATEGORIAS.indexOf(a) - CATEGORIAS.indexOf(b));
  if (filtro !== 'Todos' && !cats.includes(filtro)) filtro = 'Todos';
  $('#filtro-cat').innerHTML = (cats.length > 1 ? ['Todos', ...cats] : []).map(c =>
    `<button type="button" data-cat="${esc(c)}" aria-pressed="${c === filtro}">${c === 'Todos' ? '' : `<i class="bolinha" style="--c:${corDe(c)}"></i>`}${esc(c)}</button>`).join('');
}
function renderBarra() {
  const lista = visao === 'lista';
  $('#cal-titulo').textContent = lista ? 'Próximos eventos' : maiuscula(mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  $('#cal-hoje').hidden = lista; document.querySelector('.cal-nav').hidden = lista;
  $('#bloco-mes').hidden = lista; $('#proximos').hidden = !lista;
  $('#vis-mes').setAttribute('aria-pressed', !lista); $('#vis-lista').setAttribute('aria-pressed', lista);
}
function renderCalendario() {
  const [ini, , linhas] = limitesGrade(mes), hojeK = chave(new Date());
  let html = '';
  for (let i = 0; i < linhas * 7; i++) {
    const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i), k = chave(d), evs = eventosDoDia(k);
    const num = d.getDate() === 1 ? `1 ${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}` : d.getDate();
    const rotulo = `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}${evs.length ? `, ${evs.length} ${evs.length === 1 ? 'evento' : 'eventos'}` : ''}`;
    const chips = evs.slice(0, 3).map(e => `<span class="chip" style="--c:${corDe(e.categoria)}">${chave(new Date(e.inicio)) === k && !diaTodo(e) ? `<b>${hora(e.inicio)}</b>` : ''}${esc(e.titulo)}</span>`).join('');
    html += `<button type="button" class="dia${mesmoMes(d, mes) ? '' : ' fora'}${k === hojeK ? ' hoje' : ''}${k === diaSel ? ' sel' : ''}" data-dia="${k}" aria-label="${esc(rotulo)}" aria-pressed="${k === diaSel}"${k === hojeK ? ' aria-current="date"' : ''}>`
      + `<span class="num">${num}</span><span class="chips">${chips}${evs.length > 3 ? `<span class="mais">+${evs.length - 3} mais</span>` : ''}</span>`
      + `<span class="pontos">${evs.slice(0, 4).map(e => `<i style="--c:${corDe(e.categoria)}"></i>`).join('')}</span></button>`;
  }
  $('#cal-grade').innerHTML = html;
}
function renderDia() {
  const d = doDia(diaSel), evs = eventosDoDia(diaSel), hojeK = chave(new Date());
  const rel = diaSel === hojeK ? 'Hoje' : diaSel === chave(new Date(Date.now() + 864e5)) ? 'Amanhã' : '';
  const agora = Date.now();
  $('#cal-dia').innerHTML = `<div class="dia-cab"><span class="dia-num${diaSel === hojeK ? ' hoje' : ''}">${d.getDate()}</span>
      <div><strong>${maiuscula(d.toLocaleDateString('pt-BR', { weekday: 'long' }))}</strong><small>${rel ? `${rel} · ` : ''}${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</small></div></div>`
    + (evs.length ? evs.map(e => `<article class="ev-card" style="--c:${corDe(e.categoria)}">
        <div class="ev-hora${diaTodo(e) ? ' todo' : ''}">${faixa(e)[0]}<small>${faixa(e)[1]}</small></div>
        <div class="ev-corpo"><div class="selos"><span class="selo">${esc(e.categoria)}</span>${acontecendo(e, agora) ? '<span class="selo ao-vivo">acontecendo agora</span>' : ''}</div>
          <strong>${esc(e.titulo)}</strong><span class="onde">📍 ${esc(e.local)}</span>
          ${e.descricao ? `<p>${esc(e.descricao)}</p>` : ''}<span class="por">Adicionado por ${esc(e.autor)}</span></div>
      </article>`).join('') : `<p class="dia-vazio">${filtro === 'Todos' ? 'Nenhum evento neste dia.' : `Nenhum evento de “${esc(filtro)}” neste dia.`}</p>`)
    + (diaSel >= hojeK ? `<button type="button" class="botao-primario" data-acao="novo-dia">+ Adicionar neste dia</button>` : '');
}
function renderLista(vivosIds) {
  const agora = Date.now();
  const futuros = eventos.filter(e => !vivosIds.has(e.id) && new Date(e.fim) > agora);
  const vis = futuros.filter(e => filtro === 'Todos' || e.categoria === filtro);
  const grupos = new Map();
  for (const e of vis) { const k = rotuloDia(e.inicio); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); }
  $('#proximos').innerHTML = vis.length ? [...grupos].map(([dia, evs]) => `<div class="dia-grupo"><h3>${esc(dia)}</h3>${evs.map(e => `
      <article class="evento-linha" style="--c:${corDe(e.categoria)}">
        <div class="hora${diaTodo(e) ? ' todo' : ''}">${faixa(e)[0]}<small>${faixa(e)[1]}</small></div>
        <div><span class="selo">${esc(e.categoria)}</span><strong>${esc(e.titulo)}</strong><span class="onde">📍 ${esc(e.local)}</span>
          ${e.descricao ? `<p>${esc(e.descricao)}</p>` : ''}<span class="por">Adicionado por ${esc(e.autor)}</span></div>
      </article>`).join('')}</div>`).join('')
    : `<p class="nada-agora">Nenhum evento marcado para os próximos ${DIAS_FRENTE} dias. Seja o primeiro a adicionar!</p>`;
}
function irParaMes(novo, dia) {
  mes = primeiroDia(novo);
  diaSel = dia || (mesmoMes(mes, new Date()) ? chave(new Date()) : chave(mes));
  render(); carregar(); // mostra já o que existe e busca os eventos do novo mês
}
$('#cal-ant').addEventListener('click', () => irParaMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1)));
$('#cal-prox').addEventListener('click', () => irParaMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1)));
$('#cal-hoje').addEventListener('click', () => irParaMes(new Date()));
for (const [id, v] of [['#vis-mes', 'mes'], ['#vis-lista', 'lista']]) $(id).addEventListener('click', () => {
  visao = v; try { localStorage.setItem('agenda-visao', v); } catch {} render();
});
$('#cal-grade').addEventListener('click', e => {
  const b = e.target.closest('[data-dia]'); if (!b) return;
  diaSel = b.dataset.dia; renderCalendario(); renderDia();
  // no celular o painel do dia fica abaixo do calendário: leva a tela até ele
  if (matchMedia('(max-width: 959px)').matches) $('#cal-dia').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
});
// setas do teclado entre os dias do calendário
$('#cal-grade').addEventListener('keydown', e => {
  const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!passo) return;
  const b = e.target.closest('[data-dia]'); if (!b) return;
  e.preventDefault();
  const d = doDia(b.dataset.dia); d.setDate(d.getDate() + passo);
  const alvo = $(`[data-dia="${chave(d)}"]`); if (alvo) alvo.focus();
});
function registroHTML(r, u) {
  const den = u && u.id !== r.usuario_id ? `<button type="button" class="denunciar" data-denunciar="${r.id}">denunciar</button>` : '';
  if (!r.foto_url) return `<div class="registro so-texto"><div class="txt"><b>“${esc(r.legenda)}”</b><span>${esc(r.autor)} · ${haQuanto(r.criado_em)}</span>${den}</div></div>`;
  return `<figure class="registro" style="margin:0"><button type="button" class="ver" data-ver="${r.id}" aria-label="Ampliar foto"><img src="${esc(r.foto_url)}" alt="${esc(r.legenda)}" loading="lazy"></button>
    <figcaption class="txt"><b>${esc(r.legenda)}</b><span>${esc(r.autor)} · ${haQuanto(r.criado_em)}</span>${den}</figcaption></figure>`;
}

// ---------- ações ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-acao],[data-cat],[data-ver],[data-denunciar]'); if (!t) return;
  if (t.dataset.cat) { filtro = t.dataset.cat; render(); return; }
  if (t.dataset.ver) {
    const r = registros.find(x => String(x.id) === t.dataset.ver); if (!r) return;
    $('#foto-grande').src = r.foto_url; $('#foto-grande').alt = r.legenda; $('#legenda-grande').textContent = `${r.legenda} — ${r.autor}`; $('#dlg-ver').showModal(); return;
  }
  if (t.dataset.denunciar) {
    if (!exigirLogin()) return;
    try { await api.denunciar('registro', Number(t.dataset.denunciar), 'conteúdo impróprio'); toast('Obrigado. A foto será revisada.'); } catch (err) { toast(err.message); }
    return;
  }
  const acao = t.dataset.acao, card = t.closest('[data-id]'), id = card && Number(card.dataset.id);
  if (acao === 'novo') { e.preventDefault(); abrirNovoEvento(); }
  if (acao === 'novo-dia') abrirNovoEvento(diaSel);
  if (acao === 'confirmar') {
    if (!exigirLogin(() => confirmar(id))) return;
    confirmar(id);
  }
  if (acao === 'encerrar') {
    if (!exigirLogin(() => encerrar(id))) return;
    encerrar(id);
  }
  if (acao === 'foto') {
    if (!exigirLogin(() => abrirFoto(id))) return;
    abrirFoto(id);
  }
});
async function encerrar(id) {
  try { await api.encerrar(id); toast('Obrigado! O aviso ajuda a manter a agenda certa.'); await carregar(); } catch (err) { toast(err.message); }
}
async function confirmar(id) {
  try { await api.confirmar(id); toast('Valeu! Sua confirmação ajuda quem está em casa.'); await carregar(); } catch (err) { toast(err.message); }
}

// novo evento
$('#novo-evento').addEventListener('click', () => abrirNovoEvento());
function abrirNovoEvento(dia) { // dia: AAAA-MM-DD opcional (vem do calendário)
  if (!exigirLogin(() => abrirNovoEvento(dia))) return;
  const f = $('#form-evento'); f.reset(); f.querySelector('.erro').textContent = '';
  const hoje = chave(new Date());
  f.dia.min = hoje; f.dia.value = dia && dia >= hoje ? dia : hoje;
  $('#dlg-evento').showModal();
}
$('#form-evento').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, btn = f.querySelector('.botao-primario'), erro = f.querySelector('.erro');
  const inicio = new Date(`${f.dia.value}T${f.hora_ini.value}`); let fim = new Date(`${f.dia.value}T${f.hora_fim.value}`);
  if (fim <= inicio) fim = new Date(fim.getTime() + 864e5); // termina depois da meia-noite
  if (fim < Date.now()) { erro.textContent = 'Esse horário já passou.'; return; }
  btn.disabled = true;
  try {
    await api.criarEvento({ titulo: f.titulo.value.trim(), local: f.local.value.trim(), categoria: f.categoria.value, descricao: f.descricao.value.trim() || null, inicio: inicio.toISOString(), fim: fim.toISOString() });
    $('#dlg-evento').close(); toast('Evento publicado na agenda!');
    if (visao === 'mes') { diaSel = chave(inicio); mes = primeiroDia(inicio); } // mostra o evento recém-criado no calendário
    await carregar();
  } catch (err) { erro.textContent = err.message; }
  finally { btn.disabled = false; }
});

// foto
function abrirFoto(id) {
  const ev = eventos.find(e => e.id === id); if (!ev) return;
  if (!janelaAberta(ev)) { toast('Esse evento já encerrou.'); return; }
  eventoFoto = ev;
  const f = $('#form-foto'); f.reset(); f.querySelector('.erro').textContent = '';
  $('#previa').hidden = true; $('#sem-foto').hidden = false;
  $('#foto-evento').textContent = `${ev.titulo} · ${ev.local}`;
  $('#dlg-foto').showModal();
}
$('#form-foto').foto.addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  $('#previa').src = URL.createObjectURL(file); $('#previa').hidden = false; $('#sem-foto').hidden = true;
});
$('#form-foto').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, btn = f.querySelector('.botao-primario'), erro = f.querySelector('.erro');
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const file = f.foto.files[0];
    const blob = file ? await comprimir(file) : null;
    await api.enviarRegistro(eventoFoto.id, blob, f.legenda.value.trim());
    $('#dlg-foto').close(); toast('Publicado! Obrigado por mostrar como está.'); await carregar();
  } catch (err) { erro.textContent = err.message || 'Não foi possível enviar.'; }
  finally { btn.disabled = false; btn.textContent = 'Publicar'; }
});

// ---------- início ----------
renderConta();
await carregar();
if (location.hash === '#novo') abrirNovoEvento();
setInterval(() => { if (!document.hidden) carregar(); }, 60_000);                      // atualiza confirmações e fotos
setInterval(() => { if (!document.hidden) render(); }, 30_000);                        // move eventos para "acontecendo agora" na hora certa
document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });
