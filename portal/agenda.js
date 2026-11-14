import { criarBackend, CATEGORIAS, janelaAberta, acontecendo, encerrado } from './backend.js';
import { ligarSugestoes } from './sugestoes.js';
import { comprimir } from './imagem.js';

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
function exigirLogin(depois) {
  if (api.usuario()) return true;
  abrirEntrar(depois); return false;
}

// ---------- conta ----------
// Contas de administração aparecem só como "Admin" no cabeçalho (id do perfil, não e-mail).
const ADMINS = new Set(["29b7ad66-12b5-4e0a-ac1a-63879e9f785e"]);
function renderConta() {
  const u = api.usuario();
  $('#conta').innerHTML = u ? `Olá, <b>${esc(ADMINS.has(u.id) ? "Admin" : u.nome)}</b> <button type="button" id="sair">Sair</button>` : `<button type="button" id="entrar">Entrar para participar</button>`;
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
let ultimaCarga = 0;
async function carregar() {
  ultimaCarga = Date.now();
  try {
    // Busca os próximos dias (para "acontecendo agora" e a lista) e também o mês que está na tela.
    let de = new Date(Date.now() - 864e5), ate = new Date(Date.now() + DIAS_FRENTE * 864e5);
    const [gIni, gFim] = limitesGrade(mes);
    if (gIni < de) de = gIni;
    if (gFim > ate) ate = gFim;
    eventos = await api.listarEventos(de, ate);
    render();                                   // o calendário aparece sem esperar as fotos
    const ids = eventos.filter(e => janelaAberta(e)).map(e => e.id);
    const [regs] = await Promise.all([api.listarRegistros(ids), buscarRecados(ids)]);
    registros = regs.filter(r => deHoje(r.criado_em)); // as fotos duram só o dia
    render();
  } catch (err) { console.error(err); toast(err.message || 'Erro ao carregar a agenda.'); }
}
const deHoje = iso => chave(new Date(iso)) === chave(new Date());

// Mural de recados: só dos eventos na janela; se a tabela ainda não existe, o mural some sem quebrar a página.
let recados = [], muralDisponivel = true;
async function buscarRecados(ids) {
  try { recados = (await api.listarRecados(ids)).filter(m => deHoje(m.criado_em)); muralDisponivel = true; }
  catch (err) { console.warn('[agenda] mural indisponível', err); recados = []; muralDisponivel = false; }
}
// Enquanto alguém está na página, o mural atualiza mais rápido que o resto (conversa ao vivo).
setInterval(async () => {
  if (document.hidden || !muralDisponivel) return;
  const ids = [...document.querySelectorAll('#agora [data-id]')].map(a => Number(a.dataset.id));
  if (!ids.length) return;
  const antes = recados.map(m => m.id).join();
  await buscarRecados(ids);
  if (recados.map(m => m.id).join() !== antes) render();
}, 15_000);

// ---------- renderização ----------
function render() {
  const agora = Date.now();
  const vivos = eventos.filter(e => !encerrado(e) && (acontecendo(e, agora) || (janelaAberta(e, agora) && new Date(e.inicio) <= agora)));
  const vivosIds = new Set(vivos.map(e => e.id));
  // Bolinha do título: verde e pulsando = tem evento acontecendo; amarela e parada = tem evento hoje, mas nada agora; vermelha = nada hoje.
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0); const amanha0 = new Date(hoje0.getTime() + 864e5);
  const temHoje = eventos.some(e => new Date(e.inicio) < amanha0 && new Date(e.fim) > hoje0);
  $('#ponto-agora').dataset.estado = vivos.length ? 'vivo' : temHoje ? 'hoje' : 'nada';
  const u = api.usuario();

  const estado = guardarEstadoMural();
  $('#agora').innerHTML = vivos.length ? vivos.map(e => {
    const regs = registros.filter(r => r.evento_id === e.id);
    // legendas enviadas sem foto também são conversa: entram no mural, em ordem de horário
    const msgs = recados.filter(m => m.evento_id === e.id).map(m => ({ ...m, tipo: 'recado' }))
      .concat(regs.filter(r => !r.foto_url).map(r => ({ ...r, texto: r.legenda, tipo: 'registro' })))
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    const nFotos = regs.filter(r => r.foto_url).length;
    const terminou = agora > new Date(e.fim);
    const prova = [
      e.confirmacoes > 0 ? `<b>${e.confirmacoes}</b> ${e.confirmacoes === 1 ? 'pessoa está lá' : 'pessoas estão lá'}` : 'Ninguém confirmou ainda',
      nFotos ? `${nFotos} ${nFotos === 1 ? 'foto' : 'fotos'}` : '',
      msgs.length ? `${msgs.length} ${msgs.length === 1 ? 'recado' : 'recados'}` : '',
    ].filter(Boolean).join(' · ');
    return `<article class="vivo" data-id="${e.id}" aria-labelledby="vivo-t-${e.id}">
      <div class="vivo-cab${e.imagem_url ? ' com-capa' : ''}">
        ${e.imagem_url ? `<button type="button" class="capa-btn" data-capa="${esc(e.imagem_url)}" data-capa-titulo="${esc(e.titulo)}" aria-label="Ver o cartaz de ${esc(e.titulo)}"><img src="${esc(e.imagem_url)}" alt="" loading="lazy" decoding="async"></button>` : ''}
        <div class="vivo-info">
          <div class="vivo-selos">${terminou ? '<span class="pill-fim">Terminou há pouco</span>' : '<span class="pill-vivo"><span class="ponto"></span>Ao vivo</span>'}<span class="selo">${esc(e.categoria)}</span></div>
          <h3 id="vivo-t-${e.id}">${esc(e.titulo)}</h3>
          <div class="onde">📍 ${esc(e.local)} · ${diaTodo(e) ? 'dia todo' : `${hora(e.inicio)}–${hora(e.fim)}`}</div>
          ${e.descricao ? `<p class="desc">${esc(e.descricao)}</p>` : ''}
          <p class="prova">${prova}${e.confirmacoes > 0 && e.ultima_confirmacao ? ` <span class="meta">· última confirmação ${haQuanto(e.ultima_confirmacao)}</span>` : ''}</p>
        </div>
        ${galeriaHTML(e.id, regs, u)}
      </div>
      <div class="barra-acoes" role="group" aria-label="Participar">
        ${e.eu_confirmei
          ? '<button type="button" class="acao feito" disabled><span aria-hidden="true">✔</span> Você está lá</button>'
          : '<button type="button" class="acao" data-acao="confirmar"><span aria-hidden="true">✋</span> Estou aqui</button>'}
        ${muralDisponivel || msgs.length ? `<button type="button" class="acao" data-acao="mural" aria-expanded="${muraisAbertos.has(e.id)}"><span aria-hidden="true">💬</span> Recados${msgs.length ? ` <span class="conta-n">${msgs.length}</span>` : ''}</button>` : ''}
        <button type="button" class="acao" data-acao="foto"><span aria-hidden="true">📷</span> Foto</button>
      </div>
      ${muralDisponivel || msgs.length ? muralHTML(e, msgs, u) : ''}
      <p class="fim-aviso">${e.eu_encerrei
        ? 'Você avisou que já terminou.'
        : 'Acabou? <button type="button" class="link" data-acao="encerrar">Avise que já terminou</button>'}${e.encerramentos ? ` · ${e.encerramentos} ${e.encerramentos === 1 ? 'aviso' : 'avisos'} (com 2 o evento sai daqui)` : ''}</p>
    </article>`;
  }).join('') : `<p class="nada-agora">Nenhum evento acontecendo neste momento. Sabe de algo rolando? <a href="#" data-acao="novo">Adicione na agenda</a>.</p>`;
  restaurarEstadoMural(estado);

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
      ${e.imagem_url ? `<button type="button" class="ev-capa" data-capa="${esc(e.imagem_url)}" data-capa-titulo="${esc(e.titulo)}" aria-label="Ver o cartaz de ${esc(e.titulo)}"><img src="${esc(e.imagem_url)}" alt="" loading="lazy" decoding="async"></button>` : ''}
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
        ${e.imagem_url ? `<button type="button" class="ev-capa" data-capa="${esc(e.imagem_url)}" data-capa-titulo="${esc(e.titulo)}" aria-label="Ver o cartaz de ${esc(e.titulo)}"><img src="${esc(e.imagem_url)}" alt="" loading="lazy" decoding="async"></button>` : ''}
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
const MAX_FOTOS = 8;
const fotosAbertas = new Set(); // eventos com a galeria expandida
function galeriaHTML(eventoId, regs, u) {
  const fotos = regs.filter(r => r.foto_url);
  if (!fotos.length) return ''; // legendas sem foto aparecem no mural
  const aberta = fotosAbertas.has(eventoId), vistas = aberta ? fotos : fotos.slice(0, MAX_FOTOS);
  const tile = r => `<button type="button" class="mini" data-ver="${r.id}" title="${esc(r.legenda)} · ${esc(r.autor)}" aria-label="Ampliar foto: ${esc(r.legenda)}"><img src="${esc(r.foto_url)}" alt="${esc(r.legenda)}" loading="lazy" decoding="async"></button>`;
  return `<div class="galeria">${fotos.length ? `<div class="minis">${vistas.map(tile).join('')}</div>` : ''}${fotos.length > MAX_FOTOS ? `<button type="button" class="botao-sec ver-todas" data-acao="todas-fotos">${aberta ? 'Mostrar menos' : `Ver todas as ${fotos.length} fotos`}</button>` : ''}</div>`;
}

// ---------- mural de recados ----------
const PREVIA = 2;                       // recados visíveis com o mural fechado (os mais recentes)
const muraisAbertos = new Set();        // eventos com o mural expandido
const rascunhos = new Map();            // texto que a pessoa está digitando, por evento (sobrevive às atualizações)
const nomeDe = (id, nome) => (ADMINS.has(id) ? 'Admin' : nome || 'Alguém');
const iniciais = n => n.split(/\s+/).filter(p => /^\p{L}/u.test(p)).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
const corDoNome = n => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 42%)`; };
const avatar = (id, nome) => { const n = nomeDe(id, nome); return `<span class="avatar" style="--c:${corDoNome(n)}" aria-hidden="true">${esc(iniciais(n))}</span>`; };

function muralHTML(e, msgs, u) {
  const aberto = muraisAbertos.has(e.id);
  const vistos = aberto ? msgs : msgs.slice(-PREVIA);
  const escondidos = msgs.length - vistos.length;
  const item = m => {
    const meu = u && u.id === m.usuario_id;
    return `<li class="recado${meu ? ' meu' : ''}">${avatar(m.usuario_id, m.autor)}<div class="recado-corpo"><div class="bolha"><b>${esc(nomeDe(m.usuario_id, m.autor))}</b><p>${esc(m.texto)}</p></div>
      <div class="recado-meta"><time datetime="${esc(m.criado_em)}">${haQuanto(m.criado_em)}</time>${meu
        ? (m.tipo === 'recado' ? ` · <button type="button" class="link" data-recado-apagar="${m.id}">Apagar</button>` : '')
        : u ? ` · <button type="button" class="link" data-recado-den="${m.id}" data-tipo="${m.tipo}">Denunciar</button>` : ''}</div></div></li>`;
  };
  const compor = u
    ? `<form class="compor" data-recado-form="${e.id}">${avatar(u.id, u.nome)}<label class="sr" for="recado-${e.id}">Escreva um recado no mural</label><textarea id="recado-${e.id}" name="texto" rows="1" maxlength="500" required placeholder="Escreva no mural…" data-recado-input="${e.id}">${esc(rascunhos.get(e.id) || '')}</textarea><button class="enviar" aria-label="Enviar recado"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 11.5 21 3l-8.5 18-2.2-7.3L3 11.5z" fill="currentColor"/></svg></button></form>`
    : '<button type="button" class="compor-entrar" data-acao="escrever">Entre para escrever no mural</button>';
  return `<section class="mural${aberto ? ' aberto' : ''}" aria-label="Mural de recados">
    ${escondidos > 0 ? `<button type="button" class="link ver-mais" data-acao="mural">Ver ${escondidos === 1 ? 'mais 1 recado' : `mais ${escondidos} recados`}</button>` : ''}
    ${vistos.length ? `<ol class="recados" data-recados="${e.id}">${vistos.map(item).join('')}</ol>` : aberto ? '<p class="mural-vazio">Ninguém escreveu ainda. Conte como está aí!</p>' : ''}
    ${muralDisponivel && (aberto || vistos.length || u) ? compor : ''}
  </section>`;
}

// O cartão é redesenhado a cada atualização: guarda texto digitado, foco e rolagem para não atrapalhar quem escreve.
function guardarEstadoMural() {
  document.querySelectorAll('[data-recado-input]').forEach(t => rascunhos.set(Number(t.dataset.recadoInput), t.value));
  const foco = document.activeElement?.dataset?.recadoInput;
  const pos = foco ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const rolagem = new Map([...document.querySelectorAll('[data-recados]')].map(l => [l.dataset.recados, { topo: l.scrollTop, noFim: l.scrollHeight - l.scrollTop - l.clientHeight < 8 }]));
  return { foco, pos, rolagem };
}
function restaurarEstadoMural({ foco, pos, rolagem }) {
  document.querySelectorAll('[data-recados]').forEach(l => { const r = rolagem.get(l.dataset.recados); l.scrollTop = !r || r.noFim ? l.scrollHeight : r.topo; });
  document.querySelectorAll('[data-recado-input]').forEach(ajustarAltura);
  if (foco) { const t = document.querySelector(`[data-recado-input="${foco}"]`); if (t) { t.focus({ preventScroll: true }); t.setSelectionRange(...pos); } }
}
function ajustarAltura(t) { t.style.height = 'auto'; const borda = t.offsetHeight - t.clientHeight; t.style.height = Math.min(t.scrollHeight + borda, 140) + 'px'; t.style.overflowY = t.scrollHeight + borda > 140 ? 'auto' : 'hidden'; }
function focarCompor(id) { const t = document.querySelector(`[data-recado-input="${id}"]`); if (t) t.focus(); }

document.addEventListener('input', e => { const t = e.target.closest('[data-recado-input]'); if (t) { rascunhos.set(Number(t.dataset.recadoInput), t.value); ajustarAltura(t); } });
document.addEventListener('keydown', e => { // Enter envia; Shift+Enter quebra a linha
  const t = e.target.closest('[data-recado-input]');
  if (t && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); t.form.requestSubmit(); }
});
document.addEventListener('submit', async e => {
  const f = e.target.closest('[data-recado-form]'); if (!f) return;
  e.preventDefault();
  const id = Number(f.dataset.recadoForm), texto = f.texto.value.trim(); if (!texto) return;
  const btn = f.querySelector('.enviar'); btn.disabled = true;
  try {
    const m = await api.enviarRecado(id, texto);
    recados.push({ ...m, autor: m.autor || api.usuario()?.nome });
    rascunhos.delete(id); muraisAbertos.add(id); f.texto.value = '';
    render(); focarCompor(id);
    const l = document.querySelector(`[data-recados="${id}"]`); if (l) l.scrollTop = l.scrollHeight;
  } catch (err) { toast(err.message || 'Não foi possível enviar o recado.'); btn.disabled = false; }
});

// ---------- ações ----------
document.addEventListener('click', async e => {
  const r = e.target.closest('[data-recado-apagar],[data-recado-den]');
  if (r?.dataset.recadoApagar) {
    const id = Number(r.dataset.recadoApagar);
    try { await api.apagarRecado(id); recados = recados.filter(m => m.id !== id); render(); toast('Recado apagado.'); } catch (err) { toast(err.message); }
    return;
  }
  if (r?.dataset.recadoDen) {
    if (!exigirLogin()) return;
    try { await api.denunciar(r.dataset.tipo === 'registro' ? 'registro' : 'recado', Number(r.dataset.recadoDen), 'conteúdo impróprio'); toast('Obrigado. O recado será revisado.'); } catch (err) { toast(err.message); }
    return;
  }
});
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-acao],[data-cat],[data-ver],[data-denunciar],[data-capa]'); if (!t) return;
  if (t.dataset.capa) { // cartaz do evento, inteiro e sem recorte
    $('#foto-grande').src = t.dataset.capa; $('#foto-grande').alt = `Cartaz: ${t.dataset.capaTitulo}`; $('#legenda-grande').textContent = t.dataset.capaTitulo;
    $('#den-foto').hidden = true; $('#dlg-ver').showModal(); return;
  }
  if (t.dataset.cat) { filtro = t.dataset.cat; render(); return; }
  if (t.dataset.ver) {
    const r = registros.find(x => String(x.id) === t.dataset.ver); if (!r) return;
    $('#foto-grande').src = r.foto_url; $('#foto-grande').alt = r.legenda; $('#legenda-grande').textContent = `${r.legenda} — ${r.autor} · ${haQuanto(r.criado_em)}`;
    const eu = api.usuario(), den = $('#den-foto'); den.dataset.denunciar = r.id; den.hidden = !eu || eu.id === r.usuario_id;
    $('#dlg-ver').showModal(); return;
  }
  if (t.dataset.denunciar) {
    if (!exigirLogin()) return;
    try { await api.denunciar('registro', Number(t.dataset.denunciar), 'conteúdo impróprio'); $('#dlg-ver').close(); toast('Obrigado. A foto será revisada.'); } catch (err) { toast(err.message); }
    return;
  }
  const acao = t.dataset.acao, card = t.closest('[data-id]'), id = card && Number(card.dataset.id);
  if (acao === 'novo') { e.preventDefault(); abrirNovoEvento(); }
  if (acao === 'novo-dia') abrirNovoEvento(diaSel);
  if (acao === 'confirmar') {
    if (!exigirLogin(() => confirmar(id))) return;
    confirmar(id);
  }
  if (acao === 'mural') { // abre/fecha a conversa; ao abrir, já deixa pronto para escrever
    const abrir = !muraisAbertos.has(id);
    abrir ? muraisAbertos.add(id) : muraisAbertos.delete(id);
    render();
    if (abrir) { if (api.usuario()) focarCompor(id); const l = document.querySelector(`[data-recados="${id}"]`); if (l) l.scrollTop = l.scrollHeight; }
    return;
  }
  if (acao === 'escrever') { if (exigirLogin(() => { muraisAbertos.add(id); render(); focarCompor(id); })) { muraisAbertos.add(id); render(); focarCompor(id); } return; }
  if (acao === 'todas-fotos') { fotosAbertas.has(id) ? fotosAbertas.delete(id) : fotosAbertas.add(id); render(); return; }
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
  $('#previa-capa').hidden = true; $('#previa-capa').removeAttribute('src'); $('#sem-capa').hidden = false;
  const hoje = chave(new Date());
  f.dia.min = hoje; f.dia.value = dia && dia >= hoje ? dia : hoje;
  $('#dlg-evento').showModal();
}
$('#form-evento').imagem.addEventListener('change', e => { // prévia da imagem do evento
  const arq = e.target.files[0]; if (!arq) return;
  $('#previa-capa').src = URL.createObjectURL(arq); $('#previa-capa').hidden = false; $('#sem-capa').hidden = true;
});
$('#form-evento').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, btn = f.querySelector('.botao-primario'), erro = f.querySelector('.erro');
  const inicio = new Date(`${f.dia.value}T${f.hora_ini.value}`); let fim = new Date(`${f.dia.value}T${f.hora_fim.value}`);
  if (fim <= inicio) fim = new Date(fim.getTime() + 864e5); // termina depois da meia-noite
  if (fim < Date.now()) { erro.textContent = 'Esse horário já passou.'; return; }
  btn.disabled = true;
  try {
    const arq = f.imagem.files[0], capa = arq ? await comprimir(arq, 1350) : null;
    await api.criarEvento({ titulo: f.titulo.value.trim(), local: f.local.value.trim(), categoria: f.categoria.value, descricao: f.descricao.value.trim() || null, inicio: inicio.toISOString(), fim: fim.toISOString() }, capa);
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
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - ultimaCarga > 20_000) carregar(); });

// Sugestões de lugar iguais no notebook e no celular (no lugar do <datalist> nativo).
ligarSugestoes(document.querySelector('#form-evento [name=local]'));
