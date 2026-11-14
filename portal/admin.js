// Painel /admin: agenda, festas e usuários.
// Quem pode o quê é decidido no banco (RLS e funções em supabase/admin.sql); aqui só escondemos o que a pessoa não pode usar.
import { CATEGORIAS, urlImagemEvento, imagemDoSite } from './backend.js';
import { comprimir } from './imagem.js';
import { criarFestas } from './admin-festas.js';
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
const festasPainel = criarFestas({ app, sb, esc, toast, falha, confirmar, traduzir, slug, cfg, actionsUrl: ACTIONS_URL, usuario: () => eu, papel: () => papel });

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
  const [rota, sub, id] = (location.hash.slice(1) || 'agenda').split('/');
  let aba = rota;
  if (aba === 'usuarios' && papel !== 'admin') aba = 'agenda';
  festasPainel.sair(); // desfaz o que a tela de edição deixou (aviso de saída, ouvintes)
  document.querySelectorAll('#abas a').forEach(a => a.setAttribute('aria-current', a.hash === '#' + aba ? 'page' : 'false'));
  if (aba === 'festas') {
    if (sub === 'nova') return festasPainel.editar(null);
    if (sub === 'editar' && id) return festasPainel.editar(decodeURIComponent(id));
    return festasPainel.lista();
  }
  ({ agenda: abaAgenda, usuarios: abaUsuarios }[aba] || abaAgenda)();
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
  const { data: imgs } = await sb.from('eventos').select('id, imagem').not('imagem', 'is', null);
  const porId = new Map((imgs || []).map(x => [x.id, x.imagem]));
  eventos = data.map(e => ({ ...e, imagem: porId.get(e.id) || null })); listarEventos();
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
      <td data-rotulo="Evento">${e.imagem ? `<img class="mini-capa" src="${esc(urlImagemEvento(e.imagem))}" alt="" loading="lazy">` : ''}<b>${esc(e.titulo)}</b><small>${esc(e.local)}</small>${e.oculto ? '<span class="tag tag-cinza">Oculto</span>' : ''}${e.denuncias ? `<span class="tag tag-vermelha">${e.denuncias} ${e.denuncias === 1 ? 'denúncia' : 'denúncias'}</span>` : ''}</td>
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
    if (ev.imagem && !imagemDoSite(ev.imagem)) await sb.storage.from('eventos').remove([ev.imagem]);
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
  const previa = $('#ev-previa'), atual = ev?.imagem ? urlImagemEvento(ev.imagem) : null;
  previa.hidden = !atual; if (atual) previa.src = atual; else previa.removeAttribute('src');
  $('#ev-sem-capa').hidden = !!atual; $('#ev-remover-wrap').hidden = !atual;
  f.onsubmit = async e => {
    e.preventDefault();
    const ini = new Date(f.inicio.value), fim = new Date(f.fim.value);
    if (!(fim > ini)) { f.querySelector('.erro').textContent = 'O fim precisa ser depois do início.'; return; }
    const dados = { titulo: f.titulo.value.trim(), local: f.local.value.trim(), categoria: f.categoria.value, descricao: f.descricao.value.trim() || null, inicio: ini.toISOString(), fim: fim.toISOString() };
    // imagem: nova (envia reduzida), remover, ou manter a atual
    const arq = f.imagem.files[0];
    let nova = null;
    if (arq) {
      nova = `${eu.id}/${Date.now()}.jpg`;
      const up = await sb.storage.from('eventos').upload(nova, await comprimir(arq, 1350), { contentType: 'image/jpeg' });
      if (up.error) { f.querySelector('.erro').textContent = traduzir(up.error); return; }
      dados.imagem = nova;
    } else if (f.remover_imagem.checked) dados.imagem = null;
    const q = ev ? sb.from('eventos').update(dados).eq('id', ev.id) : sb.from('eventos').insert(dados);
    const { error } = await q;
    if (error) { if (nova) await sb.storage.from('eventos').remove([nova]); f.querySelector('.erro').textContent = traduzir(error); return; }
    if (ev?.imagem && !imagemDoSite(ev.imagem) && 'imagem' in dados) await sb.storage.from('eventos').remove([ev.imagem]); // a antiga não fica sobrando
    d.close(); toast(ev ? 'Evento atualizado.' : 'Evento criado.'); abaAgenda();
  };
  d.showModal();
}
$('#form-ev').imagem.addEventListener('change', e => {
  const arq = e.target.files[0]; if (!arq) return;
  $('#ev-previa').src = URL.createObjectURL(arq); $('#ev-previa').hidden = false; $('#ev-sem-capa').hidden = true;
});
$('#ev-dia-todo').addEventListener('change', e => {
  const f = $('#form-ev'); if (!e.target.checked) return;
  const dia = (f.inicio.value || paraInput(new Date().toISOString())).slice(0, 10);
  f.inicio.value = `${dia}T00:00`; f.fim.value = `${(f.fim.value || dia).slice(0, 10)}T23:59`;
});

// ================= FESTAS (tela de edição em admin-festas.js) =================

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
