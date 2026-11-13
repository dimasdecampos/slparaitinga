import { criarBackend, CATEGORIAS, janelaAberta, acontecendo } from './backend.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hora = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DIAS_FRENTE = 45;

const api = await criarBackend();
let eventos = [], registros = [], filtro = 'Todos', eventoFoto = null;

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
    const de = new Date(Date.now() - 864e5), ate = new Date(Date.now() + DIAS_FRENTE * 864e5);
    eventos = await api.listarEventos(de, ate);
    const vivos = eventos.filter(e => janelaAberta(e));
    registros = await api.listarRegistros(vivos.map(e => e.id));
    render();
  } catch (err) { console.error(err); toast(err.message || 'Erro ao carregar a agenda.'); }
}

// ---------- renderização ----------
function render() {
  const agora = Date.now();
  const vivos = eventos.filter(e => acontecendo(e, agora) || (janelaAberta(e, agora) && new Date(e.inicio) <= agora));
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
      <div class="onde">📍 ${esc(e.local)} · ${hora(e.inicio)}–${hora(e.fim)}</div>
      ${e.descricao ? `<p class="desc">${esc(e.descricao)}</p>` : ''}
      <div class="termometro">${conf}</div>
      <div class="acoes-vivo">
        ${e.eu_confirmei
          ? `<button type="button" class="botao-primario ja" disabled>✔ Você confirmou</button>`
          : `<button type="button" class="botao-primario" data-acao="confirmar">✋ Está acontecendo</button>`}
        <button type="button" class="botao-sec" data-acao="foto">📷 Enviar foto</button>
      </div>
      ${regs.length ? `<div class="fotos">${regs.map(r => registroHTML(r, u)).join('')}</div>` : ''}
    </article>`;
  }).join('') : `<p class="nada-agora">Nenhum evento acontecendo neste momento. Sabe de algo rolando? <a href="#" data-acao="novo">Adicione na agenda</a>.</p>`;

  // próximos
  const futuros = eventos.filter(e => !vivosIds.has(e.id) && new Date(e.fim) > agora);
  const cats = [...new Set(futuros.map(e => e.categoria))];
  if (filtro !== 'Todos' && !cats.includes(filtro)) filtro = 'Todos';
  $('#filtro-cat').innerHTML = (cats.length > 1 ? ['Todos', ...cats] : []).map(c => `<button type="button" data-cat="${esc(c)}" aria-pressed="${c === filtro}">${esc(c)}</button>`).join('');
  const vis = futuros.filter(e => filtro === 'Todos' || e.categoria === filtro);
  const grupos = new Map();
  for (const e of vis) { const k = rotuloDia(e.inicio); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); }
  $('#proximos').innerHTML = vis.length ? [...grupos].map(([dia, evs]) => `<div class="dia-grupo"><h3>${esc(dia)}</h3>${evs.map(e => `
      <article class="evento-linha">
        <div class="hora">${hora(e.inicio)}<small>até ${hora(e.fim)}</small></div>
        <div><span class="selo">${esc(e.categoria)}</span><strong>${esc(e.titulo)}</strong><span class="onde">📍 ${esc(e.local)}</span>
          ${e.descricao ? `<p>${esc(e.descricao)}</p>` : ''}<span class="por">Adicionado por ${esc(e.autor)}</span></div>
      </article>`).join('')}</div>`).join('')
    : `<p class="nada-agora">Nenhum evento marcado para os próximos ${DIAS_FRENTE} dias. Seja o primeiro a adicionar!</p>`;
}
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
  if (acao === 'confirmar') {
    if (!exigirLogin(() => confirmar(id))) return;
    confirmar(id);
  }
  if (acao === 'foto') {
    if (!exigirLogin(() => abrirFoto(id))) return;
    abrirFoto(id);
  }
});
async function confirmar(id) {
  try { await api.confirmar(id); toast('Valeu! Sua confirmação ajuda quem está em casa.'); await carregar(); } catch (err) { toast(err.message); }
}

// novo evento
$('#novo-evento').addEventListener('click', () => abrirNovoEvento());
function abrirNovoEvento() {
  if (!exigirLogin(abrirNovoEvento)) return;
  const f = $('#form-evento'); f.reset(); f.querySelector('.erro').textContent = '';
  const d = new Date(); f.dia.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  f.dia.min = f.dia.value;
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
    $('#dlg-evento').close(); toast('Evento publicado na agenda!'); await carregar();
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
setInterval(carregar, 60_000);                       // atualiza confirmações e fotos
setInterval(render, 30_000);                         // move eventos para "acontecendo agora" na hora certa
document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });
