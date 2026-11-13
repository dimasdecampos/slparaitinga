// Painel /admin: agenda, festas e usuários.
// Quem pode o quê é decidido no banco (RLS e funções em supabase/admin.sql); aqui só escondemos o que a pessoa não pode usar.
import { CATEGORIAS } from './backend.js';
import { ligarSugestoes } from './sugestoes.js';

const cfg = window.AGENDA_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#admin');
const ACTIONS_URL = 'https://github.com/dimasdecampos/slparaitinga/actions/workflows/pages.yml';
const PAPEIS = { usuario: 'Usuário', contribuidor: 'Contribuidor', admin: 'Admin' };
const CHITAS = { vermelha: 'Vermelha', azul: 'Azul', amarela: 'Amarela' };

function toast(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('erro', erro); t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3600);
}
const falha = err => { console.error(err); toast(traduzir(err), true); };
function traduzir(err) {
  const m = err?.message || String(err);
  if (/permission|Sem permissão|42501|row-level/i.test(m)) return 'Sua conta não tem permissão para isso.';
  if (/duplicate key|23505/i.test(m)) return 'Já existe um item com esse endereço.';
  if (/check constraint|23514/i.test(m)) return 'Algum campo está fora do formato esperado.';
  return m;
}
// Confirmação no próprio painel (sem a caixa do navegador).
function confirmar(texto, botao = 'Excluir') {
  const d = $('#dlg-confirmar');
  $('#confirmar-texto').textContent = texto; $('#confirmar-ok').textContent = botao;
  d.showModal();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
}
const dataHora = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' de ', ' ').replace('.', '');
const paraInput = iso => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const iniciais = n => String(n || '?').split(/\s+/).filter(p => /^\p{L}/u.test(p)).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- sessão ----------
if (!cfg.supabaseUrl) { app.innerHTML = '<p class="vazio">O banco de dados não está configurado (config.js).</p>'; throw new Error('sem config'); }
const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey);
let eu = null, papel = 'anonimo';

async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return telaEntrar();
  const [{ data: p }, { data: meu }] = await Promise.all([
    sb.from('perfis').select('id, nome').eq('id', session.user.id).maybeSingle(),
    sb.rpc('meu_papel'),
  ]);
  eu = p || { id: session.user.id, nome: session.user.email }; papel = meu || 'usuario';
  $('#admin-conta').innerHTML = `<span class="avatar">${esc(iniciais(eu.nome))}</span><span><b>${esc(eu.nome)}</b><small>${esc(PAPEIS[papel] || papel)}</small></span><button type="button" class="botao-sec" id="sair">Sair</button>`;
  $('#sair').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  if (!['admin', 'contribuidor'].includes(papel)) {
    app.innerHTML = `<div class="cartao-centro"><h2>Sem acesso</h2><p>Sua conta (${esc(eu.nome)}) é de <b>usuário</b>. O painel é só para contribuidores e administradores. Peça a um admin para mudar o seu papel.</p><a class="btn" href="../">Voltar ao site</a></div>`;
    return;
  }
  document.querySelectorAll('[data-so-admin]').forEach(el => { el.hidden = papel !== 'admin'; });
  $('#abas').hidden = false;
  window.addEventListener('hashchange', abrirAba);
  abrirAba();
}
function telaEntrar() {
  app.innerHTML = `<div class="cartao-centro"><h2>Entrar no painel</h2><p>Use a mesma conta com que você entra na agenda.</p>
    <button type="button" class="btn" id="google">Continuar com o Google</button>
    <form id="form-email" class="linha-email"><input type="email" name="email" required placeholder="ou receba um link no e-mail" autocomplete="email"><button class="botao-sec">Enviar link</button></form></div>`;
  const volta = location.origin + location.pathname;
  $('#google').onclick = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: volta, queryParams: { prompt: 'select_account' } } }).catch(falha);
  $('#form-email').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithOtp({ email: e.target.email.value.trim(), options: { emailRedirectTo: volta, shouldCreateUser: false } });
    error ? falha(error) : toast('Pronto! Abra o link que enviamos para o seu e-mail.');
  };
}

// ---------- abas ----------
function abrirAba() {
  let aba = location.hash.slice(1) || 'agenda';
  if (aba === 'usuarios' && papel !== 'admin') aba = 'agenda';
  document.querySelectorAll('#abas a').forEach(a => a.setAttribute('aria-current', a.hash === '#' + aba ? 'page' : 'false'));
  ({ agenda: abaAgenda, festas: abaFestas, usuarios: abaUsuarios }[aba] || abaAgenda)();
}

// ================= AGENDA =================
let eventos = [], filtroEv = { busca: '', visao: 'proximos' };
async function abaAgenda() {
  app.innerHTML = `<div class="barra"><h2>Agenda</h2><button type="button" class="btn" id="novo-ev">+ Novo evento</button></div>
    <div class="filtros-admin"><input type="search" id="busca-ev" placeholder="Buscar por título ou local" value="${esc(filtroEv.busca)}" aria-label="Buscar eventos">
    <div class="seg" role="group" aria-label="Mostrar">${[['proximos', 'Próximos'], ['passados', 'Passados'], ['ocultos', 'Ocultos'], ['todos', 'Todos']].map(([v, t]) => `<button type="button" data-visao="${v}" aria-pressed="${filtroEv.visao === v}">${t}</button>`).join('')}</div></div>
    <div id="lista-ev"><p class="carregando">Carregando…</p></div>`;
  $('#novo-ev').onclick = () => editarEvento();
  $('#busca-ev').oninput = e => { filtroEv.busca = e.target.value; listarEventos(); };
  app.querySelectorAll('[data-visao]').forEach(b => b.onclick = () => { filtroEv.visao = b.dataset.visao; app.querySelectorAll('[data-visao]').forEach(x => x.setAttribute('aria-pressed', x === b)); listarEventos(); });
  const { data, error } = await sb.rpc('equipe_eventos');
  if (error) return falha(error);
  eventos = data; listarEventos();
}
function listarEventos() {
  const agora = Date.now(), q = filtroEv.busca.trim().toLowerCase();
  let lista = eventos.filter(e => !q || `${e.titulo} ${e.local}`.toLowerCase().includes(q));
  if (filtroEv.visao === 'proximos') lista = lista.filter(e => new Date(e.fim) >= agora && !e.oculto).reverse();
  if (filtroEv.visao === 'passados') lista = lista.filter(e => new Date(e.fim) < agora);
  if (filtroEv.visao === 'ocultos') lista = lista.filter(e => e.oculto || e.denuncias > 0);
  $('#lista-ev').innerHTML = lista.length ? `<table class="tabela"><thead><tr><th>Quando</th><th>Evento</th><th>Tipo</th><th>Adicionado por</th><th><span class="sr">Ações</span></th></tr></thead><tbody>
    ${lista.map(e => `<tr data-id="${e.id}"${e.oculto ? ' class="apagado"' : ''}>
      <td data-rotulo="Quando">${esc(dataHora(e.inicio))}</td>
      <td data-rotulo="Evento"><b>${esc(e.titulo)}</b><small>${esc(e.local)}</small>${e.oculto ? '<span class="tag tag-cinza">Oculto</span>' : ''}${e.denuncias ? `<span class="tag tag-vermelha">${e.denuncias} ${e.denuncias === 1 ? 'denúncia' : 'denúncias'}</span>` : ''}</td>
      <td data-rotulo="Tipo">${esc(e.categoria)}</td>
      <td data-rotulo="Por">${esc(e.autor || '—')}</td>
      <td class="acoes-linha"><button type="button" class="botao-sec" data-ev-editar>Editar</button><button type="button" class="botao-sec" data-ev-ocultar>${e.oculto ? 'Mostrar' : 'Ocultar'}</button><button type="button" class="botao-sec perigo" data-ev-excluir>Excluir</button></td>
    </tr>`).join('')}</tbody></table>` : '<p class="vazio">Nenhum evento aqui.</p>';
}
app.addEventListener('click', async e => {
  const tr = e.target.closest('tr[data-id]'); if (!tr || !e.target.closest('[data-ev-editar],[data-ev-ocultar],[data-ev-excluir]')) return;
  const ev = eventos.find(x => x.id === Number(tr.dataset.id)); if (!ev) return;
  if (e.target.closest('[data-ev-editar]')) return editarEvento(ev);
  if (e.target.closest('[data-ev-ocultar]')) {
    const { error } = await sb.rpc('equipe_ocultar', { p_tipo: 'evento', p_id: ev.id, p_oculto: !ev.oculto });
    if (error) return falha(error);
    ev.oculto = !ev.oculto; if (!ev.oculto) ev.denuncias = 0;
    toast(ev.oculto ? 'Evento ocultado do site.' : 'Evento visível de novo.'); return listarEventos();
  }
  if (await confirmar(`Excluir "${ev.titulo}"? Isso apaga também as fotos, recados e confirmações do evento. Não dá para desfazer.`)) {
    const { error } = await sb.from('eventos').delete().eq('id', ev.id);
    if (error) return falha(error);
    eventos = eventos.filter(x => x.id !== ev.id); listarEventos(); toast('Evento excluído.');
  }
});
function editarEvento(ev) {
  const d = $('#dlg-evento'), f = $('#form-ev');
  f.reset(); f.querySelector('.erro').textContent = '';
  $('#ev-titulo-dlg').textContent = ev ? 'Editar evento' : 'Novo evento';
  f.categoria.innerHTML = CATEGORIAS.map(c => `<option>${esc(c)}</option>`).join('');
  if (ev) {
    f.titulo.value = ev.titulo; f.local.value = ev.local; f.categoria.value = ev.categoria; f.descricao.value = ev.descricao || '';
    f.inicio.value = paraInput(ev.inicio); f.fim.value = paraInput(ev.fim);
  }
  f.onsubmit = async e => {
    e.preventDefault();
    const ini = new Date(f.inicio.value), fim = new Date(f.fim.value);
    if (!(fim > ini)) { f.querySelector('.erro').textContent = 'O fim precisa ser depois do início.'; return; }
    const dados = { titulo: f.titulo.value.trim(), local: f.local.value.trim(), categoria: f.categoria.value, descricao: f.descricao.value.trim() || null, inicio: ini.toISOString(), fim: fim.toISOString() };
    const q = ev ? sb.from('eventos').update(dados).eq('id', ev.id) : sb.from('eventos').insert(dados);
    const { error } = await q;
    if (error) { f.querySelector('.erro').textContent = traduzir(error); return; }
    d.close(); toast(ev ? 'Evento atualizado.' : 'Evento criado.'); abaAgenda();
  };
  d.showModal();
}
$('#ev-dia-todo').addEventListener('change', e => {
  const f = $('#form-ev'); if (!e.target.checked) return;
  const dia = (f.inicio.value || paraInput(new Date().toISOString())).slice(0, 10);
  f.inicio.value = `${dia}T00:00`; f.fim.value = `${(f.fim.value || dia).slice(0, 10)}T23:59`;
});

// ================= FESTAS =================
let festas = [];
async function abaFestas() {
  app.innerHTML = `<div class="barra"><h2>Festas</h2><button type="button" class="btn" id="nova-festa">+ Nova festa</button></div>
    <p class="aviso-admin">As páginas das festas são geradas a cada hora. Depois de salvar, a mudança aparece no site em até 1 hora, ou <a href="${ACTIONS_URL}" target="_blank" rel="noopener">publique agora pelo GitHub</a> (botão “Run workflow”).</p>
    <div id="lista-festas"><p class="carregando">Carregando…</p></div>`;
  $('#nova-festa').onclick = () => editarFesta();
  const { data, error } = await sb.from('festas').select('*').order('ordem');
  if (error) return falha(error);
  festas = data;
  $('#lista-festas').innerHTML = festas.length ? `<ul class="cards-festas">${festas.map(f => `<li data-festa="${esc(f.id)}">
    <span class="amostra" style="--chita:url(../img/chita-${esc(f.chita)}.svg)"></span>
    <div><b>${esc(f.nome)}</b><small>${esc(resumoData(f))} · /festas/${esc(f.id)}.html</small>${f.publicada ? '' : '<span class="tag tag-cinza">Rascunho</span>'}</div>
    <div class="acoes-linha"><a class="botao-sec" href="../festas/${esc(f.id)}.html" target="_blank" rel="noopener">Ver</a><button type="button" class="botao-sec" data-festa-editar>Editar</button>${papel === 'admin' ? '<button type="button" class="botao-sec perigo" data-festa-excluir>Excluir</button>' : ''}</div></li>`).join('')}</ul>` : '<p class="vazio">Nenhuma festa cadastrada.</p>';
}
function resumoData(f) {
  if (f.data_tipo === 'pascoa') { const d = n => (n === 0 ? 'na Páscoa' : `${Math.abs(n)} dias ${n < 0 ? 'antes' : 'depois'} da Páscoa`); return f.pascoa_ini === f.pascoa_fim ? d(f.pascoa_ini) : `de ${d(f.pascoa_ini)} até ${d(f.pascoa_fim)}`; }
  if (f.data_tipo === 'fixa') { const d = s => s.split('-').reverse().join('/'); return f.fixa_ini === f.fixa_fim || !f.fixa_fim ? `todo ${d(f.fixa_ini)}` : `de ${d(f.fixa_ini)} a ${d(f.fixa_fim)}`; }
  return f.quando_texto || 'data livre';
}
app.addEventListener('click', async e => {
  const li = e.target.closest('[data-festa]'); if (!li) return;
  const f = festas.find(x => x.id === li.dataset.festa);
  if (e.target.closest('[data-festa-editar]')) return editarFesta(f);
  if (e.target.closest('[data-festa-excluir]') && await confirmar(`Excluir a festa "${f.nome}"? A página dela sai do site na próxima publicação.`)) {
    const { error } = await sb.from('festas').delete().eq('id', f.id);
    if (error) return falha(error);
    toast('Festa excluída.'); abaFestas();
  }
});
function secaoHTML(s = { titulo: '', paragrafos: [] }) {
  return `<fieldset class="secao-ed"><div class="secao-topo-ed"><input name="sec-titulo" required maxlength="120" placeholder="Título da seção" value="${esc(s.titulo)}" aria-label="Título da seção">
    <span><button type="button" class="icone-mini" data-sec="subir" aria-label="Subir seção">↑</button><button type="button" class="icone-mini" data-sec="descer" aria-label="Descer seção">↓</button><button type="button" class="icone-mini perigo" data-sec="remover" aria-label="Remover seção">✕</button></span></div>
    <textarea name="sec-texto" rows="5" placeholder="Texto. Separe os parágrafos com uma linha em branco. Para link: [texto](endereço)" aria-label="Texto da seção">${esc((s.paragrafos || []).join('\n\n'))}</textarea></fieldset>`;
}
function editarFesta(festa) {
  const d = $('#dlg-festa'), f = $('#form-festa'), nova = !festa;
  festa = festa || { id: '', nome: '', resumo: '', olho: '', lema: '', chita: 'vermelha', data_tipo: 'fixa', fixa_ini: '', fixa_fim: '', pascoa_ini: 0, pascoa_fim: 0, quando_texto: '', secoes: [{ titulo: 'Sobre a festa', paragrafos: [] }], veja: [], ordem: (festas.at(-1)?.ordem || 0) + 1, publicada: true };
  f.reset(); f.querySelector('.erro').textContent = '';
  $('#festa-titulo-dlg').textContent = nova ? 'Nova festa' : `Editar: ${festa.nome}`;
  for (const k of ['nome', 'resumo', 'olho', 'lema', 'quando_texto', 'ordem', 'pascoa_ini', 'pascoa_fim']) f[k].value = festa[k] ?? '';
  f.id_festa.value = festa.id; f.id_festa.readOnly = !nova;
  f.chita.innerHTML = Object.entries(CHITAS).map(([v, t]) => `<option value="${v}"${festa.chita === v ? ' selected' : ''}>${t}</option>`).join('');
  f.querySelectorAll('[name=data_tipo]').forEach(r => { r.checked = r.value === festa.data_tipo; });
  const [mi, di] = (festa.fixa_ini || '-').split('-'), [mf, df] = (festa.fixa_fim || festa.fixa_ini || '-').split('-');
  f.fixa_ini.value = di && mi ? `2000-${mi}-${di}` : ''; f.fixa_fim.value = df && mf ? `2000-${mf}-${df}` : '';
  f.publicada.checked = festa.publicada;
  $('#secoes-ed').innerHTML = (festa.secoes || []).map(secaoHTML).join('');
  $('#veja-ed').innerHTML = festas.filter(x => x.id !== festa.id).map(x => `<label class="check"><input type="checkbox" name="veja" value="${esc(x.id)}"${(festa.veja || []).includes(x.id) ? ' checked' : ''}> ${esc(x.nome)}</label>`).join('') || '<small>Nenhuma outra festa.</small>';
  mostrarCamposData();
  f.nome.oninput = () => { if (nova && !f.id_festa.dataset.mexido) f.id_festa.value = slug(f.nome.value); };
  f.id_festa.oninput = () => { f.id_festa.dataset.mexido = '1'; };
  f.onsubmit = async e => {
    e.preventDefault();
    const tipo = f.querySelector('[name=data_tipo]:checked').value;
    const md = v => (v ? v.slice(5) : null); // "2000-08-19" -> "08-19"
    const dados = {
      id: f.id_festa.value.trim(), nome: f.nome.value.trim(), resumo: f.resumo.value.trim(), olho: f.olho.value.trim(), lema: f.lema.value.trim(),
      chita: f.chita.value, data_tipo: tipo, quando_texto: f.quando_texto.value.trim(), ordem: Number(f.ordem.value) || 0, publicada: f.publicada.checked,
      pascoa_ini: tipo === 'pascoa' ? Number(f.pascoa_ini.value) : null, pascoa_fim: tipo === 'pascoa' ? Number(f.pascoa_fim.value || f.pascoa_ini.value) : null,
      fixa_ini: tipo === 'fixa' ? md(f.fixa_ini.value) : null, fixa_fim: tipo === 'fixa' ? md(f.fixa_fim.value || f.fixa_ini.value) : null,
      secoes: [...f.querySelectorAll('.secao-ed')].map(s => ({ titulo: s.querySelector('[name=sec-titulo]').value.trim(), paragrafos: s.querySelector('[name=sec-texto]').value.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean) })).filter(s => s.titulo),
      veja: [...f.querySelectorAll('[name=veja]:checked')].map(c => c.value),
    };
    if (tipo === 'fixa' && !dados.fixa_ini) { f.querySelector('.erro').textContent = 'Escolha o dia da festa.'; return; }
    if (tipo === 'livre' && !dados.quando_texto) { f.querySelector('.erro').textContent = 'Escreva quando a festa acontece.'; return; }
    const q = nova ? sb.from('festas').insert(dados) : sb.from('festas').update(dados).eq('id', festa.id);
    const { error } = await q;
    if (error) { f.querySelector('.erro').textContent = traduzir(error); return; }
    d.close(); toast('Festa salva. O site atualiza em até 1 hora.'); abaFestas();
  };
  d.showModal();
}
function mostrarCamposData() {
  const tipo = $('#form-festa').querySelector('[name=data_tipo]:checked')?.value;
  document.querySelectorAll('[data-campo-data]').forEach(el => { el.hidden = el.dataset.campoData !== tipo; });
}
$('#form-festa').addEventListener('change', e => { if (e.target.name === 'data_tipo') mostrarCamposData(); });
$('#add-secao').addEventListener('click', () => { $('#secoes-ed').insertAdjacentHTML('beforeend', secaoHTML()); $('#secoes-ed').lastElementChild.querySelector('input').focus(); });
$('#secoes-ed').addEventListener('click', e => {
  const b = e.target.closest('[data-sec]'); if (!b) return;
  const s = b.closest('.secao-ed');
  if (b.dataset.sec === 'remover') s.remove();
  if (b.dataset.sec === 'subir' && s.previousElementSibling) s.previousElementSibling.before(s);
  if (b.dataset.sec === 'descer' && s.nextElementSibling) s.nextElementSibling.after(s);
});

// ================= USUÁRIOS (só admin) =================
let usuarios = [], buscaUs = '';
async function abaUsuarios() {
  app.innerHTML = `<div class="barra"><h2>Usuários</h2></div>
    <p class="aviso-admin"><b>Usuário</b>: participa da agenda (padrão). <b>Contribuidor</b>: também edita a agenda e as festas no painel. <b>Admin</b>: tudo, inclusive mudar papéis. As contas são compartilhadas com outros apps do mesmo banco, por isso o painel não apaga contas.</p>
    <div class="filtros-admin"><input type="search" id="busca-us" placeholder="Buscar por nome ou e-mail" value="${esc(buscaUs)}" aria-label="Buscar usuários"></div>
    <div id="lista-us"><p class="carregando">Carregando…</p></div>`;
  $('#busca-us').oninput = e => { buscaUs = e.target.value; listarUsuarios(); };
  const { data, error } = await sb.rpc('admin_usuarios');
  if (error) return falha(error);
  usuarios = data; listarUsuarios();
}
function listarUsuarios() {
  const q = buscaUs.trim().toLowerCase();
  const lista = usuarios.filter(u => !q || `${u.nome} ${u.email}`.toLowerCase().includes(q));
  $('#lista-us').innerHTML = lista.length ? `<table class="tabela"><thead><tr><th>Pessoa</th><th>Papel</th><th>Atividade</th><th>Último acesso</th><th><span class="sr">Ações</span></th></tr></thead><tbody>
    ${lista.map(u => `<tr data-us="${u.id}">
      <td data-rotulo="Pessoa"><div class="pessoa"><span class="avatar">${esc(iniciais(u.nome))}</span><span><input name="nome" value="${esc(u.nome)}" maxlength="60" aria-label="Nome de ${esc(u.nome)}"><small>${esc(u.email || 'sem e-mail')}${u.id === eu.id ? ' · você' : ''}</small></span></div></td>
      <td data-rotulo="Papel"><select name="papel" aria-label="Papel de ${esc(u.nome)}">${Object.entries(PAPEIS).map(([v, t]) => `<option value="${v}"${u.papel === v ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
      <td data-rotulo="Atividade"><small>${u.eventos} eventos · ${u.fotos} fotos · ${u.recados} recados</small></td>
      <td data-rotulo="Último acesso"><small>${u.ultimo_acesso ? esc(dataHora(u.ultimo_acesso)) : '—'}</small></td>
      <td class="acoes-linha"><button type="button" class="btn" data-us-salvar disabled>Salvar</button></td>
    </tr>`).join('')}</tbody></table>` : '<p class="vazio">Ninguém encontrado.</p>';
}
app.addEventListener('input', e => { const tr = e.target.closest('tr[data-us]'); if (tr) tr.querySelector('[data-us-salvar]').disabled = false; });
app.addEventListener('change', e => { const tr = e.target.closest('tr[data-us]'); if (tr) tr.querySelector('[data-us-salvar]').disabled = false; });
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-us-salvar]'); if (!b) return;
  const tr = b.closest('tr'), u = usuarios.find(x => x.id === tr.dataset.us);
  const nome = tr.querySelector('[name=nome]').value.trim(), novo = tr.querySelector('[name=papel]').value;
  if (u.id === eu.id && novo !== 'admin' && !(await confirmar('Você vai tirar o seu próprio acesso de admin. Continuar?', 'Continuar'))) return;
  b.disabled = true;
  const { error } = await sb.rpc('admin_atualizar_usuario', { p_id: u.id, p_nome: nome, p_papel: novo });
  if (error) { b.disabled = false; return falha(error); }
  Object.assign(u, { nome, papel: novo }); toast(`${nome}: ${PAPEIS[novo]}.`);
  if (u.id === eu.id) location.reload();
});

document.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
ligarSugestoes(document.querySelector('#form-ev [name=local]')); // sugestões de lugar iguais no notebook e no celular
await iniciar();
