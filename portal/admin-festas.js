// Painel /admin › Festas: a lista e UMA tela de edição, reaproveitada por todas as festas (no estilo do editor do WordPress).
// Conteúdo rico (HTML limpo por html-seguro.mjs), imagem de destaque que vai para os cartões e campos personalizados.
import { limparHtml, secoesParaHtml, htmlParaTexto } from './html-seguro.mjs';
import { comprimir } from './imagem.js';

const CHITAS = { vermelha: 'Vermelha', azul: 'Azul', amarela: 'Amarela' };
const SUGESTOES = ['Local', 'Horário', 'Entrada', 'Organização', 'Contato', 'Como chegar', 'Programação', 'Instagram', 'Site'];
const MAX_CAMPOS = 20;
const BLOCOS = { P: 'p', H2: 'h2', H3: 'h3', H4: 'h4', BLOCKQUOTE: 'quote' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function criarFestas(ctx) {
  const { app, sb, esc, toast, falha, confirmar, traduzir, slug, cfg, actionsUrl, usuario, papel } = ctx;
  const urlImagem = caminho => (caminho ? `${cfg.supabaseUrl}/storage/v1/object/public/festas/${caminho.split('/').map(encodeURIComponent).join('/')}` : null);
  let limpezas = []; // o que precisa ser desfeito ao sair da tela de edição

  function resumoData(f) {
    if (f.data_tipo === 'pascoa') { const d = n => (n === 0 ? 'na Páscoa' : `${Math.abs(n)} dias ${n < 0 ? 'antes' : 'depois'} da Páscoa`); return f.pascoa_ini === f.pascoa_fim ? d(f.pascoa_ini) : `de ${d(f.pascoa_ini)} até ${d(f.pascoa_fim)}`; }
    if (f.data_tipo === 'fixa' && f.fixa_ini) { const d = s => s.split('-').reverse().join('/'); return f.fixa_ini === f.fixa_fim || !f.fixa_fim ? `todo ${d(f.fixa_ini)}` : `de ${d(f.fixa_ini)} a ${d(f.fixa_fim)}`; }
    return f.quando_texto || 'data livre';
  }

  // ======================= LISTA =======================
  async function lista() {
    sair();
    app.innerHTML = `<div class="barra"><h2>Festas</h2><a class="btn" href="#festas/nova">+ Nova festa</a></div>
      <p class="aviso-admin">As páginas das festas são geradas a cada hora. Depois de salvar, a mudança aparece no site em até 1 hora, ou <a href="${actionsUrl}" target="_blank" rel="noopener">publique agora pelo GitHub</a> (botão “Run workflow”).</p>
      <div id="lista-festas"><p class="carregando">Carregando…</p></div>`;
    const { data, error } = await sb.from('festas').select('id, nome, chita, data_tipo, pascoa_ini, pascoa_fim, fixa_ini, fixa_fim, quando_texto, publicada, imagem, ordem').order('ordem');
    if (error) return falha(error);
    const box = $('#lista-festas');
    box.innerHTML = data.length ? `<ul class="cards-festas">${data.map(f => `<li data-festa="${esc(f.id)}">
      <span class="amostra${f.imagem ? ' com-foto' : ''}" style="--chita:url(../img/chita-${esc(f.chita)}.svg)">${f.imagem ? `<img src="${esc(urlImagem(f.imagem))}" alt="" loading="lazy">` : ''}</span>
      <div><b>${esc(f.nome)}</b><small>${esc(resumoData(f))} · /festas/${esc(f.id)}.html</small>${f.publicada ? '' : '<span class="tag tag-cinza">Rascunho</span>'}</div>
      <div class="acoes-linha"><a class="botao-sec" href="../festas/${esc(f.id)}.html" target="_blank" rel="noopener">Ver</a><a class="botao-sec" href="#festas/editar/${esc(f.id)}">Editar</a>${papel() === 'admin' ? '<button type="button" class="botao-sec perigo" data-festa-excluir>Excluir</button>' : ''}</div></li>`).join('')}</ul>` : '<p class="vazio">Nenhuma festa cadastrada.</p>';
    box.onclick = async e => {
      const li = e.target.closest('[data-festa]'); if (!li || !e.target.closest('[data-festa-excluir]')) return;
      const f = data.find(x => x.id === li.dataset.festa);
      if (!(await confirmar(`Excluir a festa "${f.nome}"? A página dela sai do site na próxima publicação.`))) return;
      const { error: err } = await sb.from('festas').delete().eq('id', f.id);
      if (err) return falha(err);
      if (f.imagem) await sb.storage.from('festas').remove([f.imagem]);
      toast('Festa excluída.'); lista();
    };
  }

  // ======================= EDIÇÃO =======================
  const vazia = todas => ({ id: '', nome: '', resumo: '', olho: '', lema: '', chita: 'vermelha', data_tipo: 'fixa', fixa_ini: '', fixa_fim: '', pascoa_ini: 0, pascoa_fim: 0, quando_texto: '',
    conteudo: null, secoes: [], campos: [], imagem: null, veja: [], ordem: (todas.at(-1)?.ordem || 0) + 1, publicada: false });

  async function editar(id) {
    sair();
    app.innerHTML = '<p class="carregando">Carregando…</p>';
    const { data: todas, error } = await sb.from('festas').select('*').order('ordem');
    if (error) return falha(error);
    const nova = !id, festa = nova ? vazia(todas) : todas.find(x => x.id === id);
    if (!festa) { toast('Festa não encontrada.', true); location.hash = '#festas'; return; }

    const conteudoInicial = limparHtml(festa.conteudo != null ? festa.conteudo : secoesParaHtml(festa.secoes));
    const [mi, di] = (festa.fixa_ini || '-').split('-'), [mf, df] = (festa.fixa_fim || festa.fixa_ini || '-').split('-');
    const estado = { sujo: false, imagem: festa.imagem, novaImagem: null, urlNova: null, removeuImagem: false };
    const campos = (Array.isArray(festa.campos) ? festa.campos : []).map(c => ({ nome: String(c.nome ?? ''), valor: String(c.valor ?? '') }));

    app.innerHTML = `
    <form id="ed-form" class="ed" autocomplete="off" novalidate>
      <div class="ed-barra">
        <a class="ed-voltar" href="#festas">← Todas as festas</a>
        <span class="ed-estado" id="ed-estado" role="status">${nova ? 'Nova festa' : 'Sem alterações'}</span>
        <button type="submit" class="botao-primario" id="ed-salvar">${nova ? 'Criar festa' : 'Salvar'}</button>
      </div>
      <div class="ed-grade">
        <div class="ed-principal">
          <input class="ed-titulo" name="nome" required minlength="2" maxlength="120" placeholder="Título da festa" aria-label="Título da festa" value="${esc(festa.nome)}">
          <div class="ed-permalink"><span>Endereço:</span> <span class="ed-prefixo">/festas/</span><input name="id_festa" required maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Só letras minúsculas, números e hífen" value="${esc(festa.id)}" aria-label="Endereço da página"${nova ? '' : ' readonly'}><span class="ed-prefixo">.html</span>${nova ? '' : '<small>O endereço não muda depois de criada, para não quebrar links.</small>'}</div>

          <section class="ed-caixa ed-editor" aria-label="Conteúdo da página">
            <div class="ed-ferramentas" role="toolbar" aria-label="Formatação">
              <select id="ed-bloco" aria-label="Formato do parágrafo"><option value="P">Parágrafo</option><option value="H2">Título</option><option value="H3">Subtítulo</option><option value="H4">Título pequeno</option><option value="BLOCKQUOTE">Citação</option></select>
              <button type="button" data-cmd="bold" title="Negrito (Ctrl+B)" aria-label="Negrito"><b>N</b></button>
              <button type="button" data-cmd="italic" title="Itálico (Ctrl+I)" aria-label="Itálico"><i>I</i></button>
              <span class="ed-sep"></span>
              <button type="button" data-cmd="insertUnorderedList" title="Lista" aria-label="Lista com marcadores">• Lista</button>
              <button type="button" data-cmd="insertOrderedList" title="Lista numerada" aria-label="Lista numerada">1. Lista</button>
              <span class="ed-sep"></span>
              <button type="button" data-cmd="link" title="Inserir link (Ctrl+K)" aria-label="Inserir link">🔗 Link</button>
              <button type="button" data-cmd="unlink" title="Remover link" aria-label="Remover link">Sem link</button>
              <button type="button" data-cmd="insertHorizontalRule" title="Linha separadora" aria-label="Linha separadora">―</button>
              <span class="ed-sep"></span>
              <button type="button" data-cmd="undo" title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
              <button type="button" data-cmd="redo" title="Refazer" aria-label="Refazer">↷</button>
              <button type="button" data-cmd="limpar" title="Tirar a formatação" aria-label="Limpar formatação">Limpar</button>
              <span class="ed-modo" role="group" aria-label="Modo do editor"><button type="button" data-modo="visual" aria-pressed="true">Visual</button><button type="button" data-modo="codigo" aria-pressed="false">Código</button></span>
            </div>
            <div id="ed-visual" class="ed-visual festa-texto" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Texto da página" data-vazio="Escreva aqui o texto da festa: história, programação, dicas…"></div>
            <textarea id="ed-codigo" class="ed-codigo" spellcheck="false" aria-label="HTML do texto" hidden></textarea>
          </section>

          <section class="ed-caixa"><h3>Resumo do cartão</h3>
            <textarea name="resumo" rows="3" maxlength="400" required aria-label="Resumo do cartão">${esc(festa.resumo)}</textarea>
            <small class="ed-dica">Aparece no cartão da festa e nos resultados do Google. <span id="ed-conta-resumo"></span></small></section>

          <section class="ed-caixa"><h3>Cabeçalho da página</h3>
            <div class="ed-linha"><label>Linha acima do título<input name="olho" maxlength="60" placeholder="Ex.: Maio ou junho" value="${esc(festa.olho)}"></label><label>Subtítulo<input name="lema" maxlength="200" value="${esc(festa.lema)}"></label></div></section>

          <section class="ed-caixa"><h3>Campos personalizados</h3>
            <p class="ed-dica">Informações em formato “nome: valor” que aparecem numa caixa no topo da página (ex.: Local, Entrada, Contato). Endereços começando com https:// viram link.</p>
            <datalist id="ed-nomes-campos">${SUGESTOES.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
            <div id="ed-campos" class="ed-campos"></div>
            <button type="button" class="botao-sec" id="ed-add-campo">+ Adicionar campo</button></section>
        </div>

        <aside class="ed-lateral">
          <section class="ed-caixa"><h3>Publicação</h3>
            <label>Situação<select name="publicada"><option value="1"${festa.publicada ? ' selected' : ''}>Publicada</option><option value="0"${festa.publicada ? '' : ' selected'}>Rascunho (fora do site)</option></select></label>
            ${nova ? '' : `<a class="ed-ver" href="../festas/${esc(festa.id)}.html" target="_blank" rel="noopener">Ver a página no site ↗</a>`}
            <small class="ed-dica">O site é atualizado a cada hora, ou <a href="${actionsUrl}" target="_blank" rel="noopener">publique agora</a>.</small>
            ${!nova && papel() === 'admin' ? '<button type="button" class="botao-sec perigo" id="ed-excluir">Excluir festa</button>' : ''}</section>

          <section class="ed-caixa"><h3>Imagem de destaque</h3>
            <div class="ed-imagem" id="ed-imagem"></div>
            <label class="botao-sec ed-enviar">Escolher imagem<input type="file" name="arquivo_imagem" accept="image/jpeg,image/png,image/webp" hidden></label>
            <button type="button" class="botao-sec perigo" id="ed-remover-imagem" hidden>Remover imagem</button>
            <small class="ed-dica">Vai para o cartão da festa e para o topo da página. O ideal é vertical (4:5, como no Instagram).</small></section>

          <section class="ed-caixa"><h3>Quando acontece</h3>
            <div class="radios">${[['pascoa', 'Em relação à Páscoa'], ['fixa', 'Dia fixo no ano'], ['livre', 'Só texto']].map(([v, t]) => `<label class="check"><input type="radio" name="data_tipo" value="${v}"${festa.data_tipo === v ? ' checked' : ''}> ${t}</label>`).join('')}</div>
            <div class="ed-linha" data-campo-data="pascoa"><label>Começa (dias da Páscoa)<input name="pascoa_ini" type="number" min="-120" max="120" value="${esc(festa.pascoa_ini ?? 0)}"></label><label>Termina<input name="pascoa_fim" type="number" min="-120" max="120" value="${esc(festa.pascoa_fim ?? 0)}"></label><small class="ed-dica">Negativo é antes da Páscoa. Carnaval: -51 a -47. Divino: 40 a 49.</small></div>
            <div class="ed-linha" data-campo-data="fixa"><label>Começa<input name="fixa_ini" type="date" value="${di && mi ? `2000-${mi}-${di}` : ''}"></label><label>Termina<input name="fixa_fim" type="date" value="${df && mf ? `2000-${mf}-${df}` : ''}"></label><small class="ed-dica">O ano é ignorado: repete todo ano.</small></div>
            <div data-campo-data="livre"><label>Texto da data<input name="quando_texto" maxlength="120" placeholder="Ex.: Em janeiro, antes do Carnaval" value="${esc(festa.quando_texto)}"></label></div></section>

          <section class="ed-caixa"><h3>Aparência</h3>
            <div class="ed-linha"><label>Estampa de chita<select name="chita">${Object.entries(CHITAS).map(([v, t]) => `<option value="${v}"${festa.chita === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label><label>Ordem<input name="ordem" type="number" min="0" max="999" value="${esc(festa.ordem)}"></label></div>
            <small class="ed-dica">A estampa aparece quando a festa não tem imagem de destaque.</small></section>

          <section class="ed-caixa"><h3>Veja também</h3>
            <div class="checks ed-veja">${todas.filter(x => x.id !== festa.id).map(x => `<label class="check"><input type="checkbox" name="veja" value="${esc(x.id)}"${(festa.veja || []).includes(x.id) ? ' checked' : ''}> ${esc(x.nome)}</label>`).join('') || '<small>Nenhuma outra festa.</small>'}</div></section>

          <section class="ed-caixa"><h3>Como fica o cartão</h3><div id="ed-previa" class="ed-previa"></div></section>
        </aside>
      </div>
      <p class="erro" id="ed-erro" role="alert"></p>
    </form>`;

    const f = $('#ed-form'), visual = $('#ed-visual'), codigo = $('#ed-codigo');
    document.execCommand('defaultParagraphSeparator', false, 'p');
    visual.innerHTML = conteudoInicial;

    // ---- estado "alterações não salvas" ----
    const marcar = () => { if (estado.sujo) return; estado.sujo = true; $('#ed-estado').textContent = 'Alterações não salvas'; $('#ed-estado').classList.add('sujo'); };
    f.addEventListener('input', e => { marcar(); if (e.target.name === 'nome' && nova && !f.id_festa.dataset.mexido) f.id_festa.value = slug(f.nome.value); if (e.target.name === 'id_festa') f.id_festa.dataset.mexido = '1'; atualizarPrevia(); contarResumo(); });
    f.addEventListener('change', e => { marcar(); if (e.target.name === 'data_tipo') mostrarCamposData(); atualizarPrevia(); });
    window.onbeforeunload = () => (estado.sujo ? '' : undefined);
    const guarda = async e => {
      const a = e.target.closest('#abas a, .ed-voltar'); if (!a || !estado.sujo) return;
      e.preventDefault();
      if (await confirmar('Há alterações não salvas. Sair e descartar?', 'Descartar')) { estado.sujo = false; location.hash = a.hash; }
    };
    document.addEventListener('click', guarda, true);
    limpezas.push(() => { window.onbeforeunload = null; document.removeEventListener('click', guarda, true); if (estado.urlNova) URL.revokeObjectURL(estado.urlNova); });

    // ---- editor ----
    const salvarSelecao = () => { const s = getSelection(); return s.rangeCount && visual.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null; };
    const restaurarSelecao = r => { if (!r) { visual.focus(); return; } visual.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
    const sincronizarBloco = () => {
      const s = getSelection(); if (!s.rangeCount || !visual.contains(s.anchorNode)) return;
      let n = s.anchorNode.nodeType === 3 ? s.anchorNode.parentNode : s.anchorNode, tag = 'P';
      while (n && n !== visual) { if (BLOCOS[n.tagName]) { tag = n.tagName; break; } n = n.parentNode; }
      $('#ed-bloco').value = tag;
    };
    document.addEventListener('selectionchange', sincronizarBloco);
    limpezas.push(() => document.removeEventListener('selectionchange', sincronizarBloco));
    $('.ed-ferramentas').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); }); // não perde a seleção ao clicar
    let selLink = null;
    function abrirLink() {
      selLink = salvarSelecao();
      const dlg = $('#dlg-link'), campo = $('#link-url'); campo.value = '';
      const ancora = selLink && (selLink.commonAncestorContainer.nodeType === 3 ? selLink.commonAncestorContainer.parentNode : selLink.commonAncestorContainer).closest?.('a');
      if (ancora) campo.value = ancora.getAttribute('href') || '';
      dlg.showModal(); campo.focus();
    }
    $('#form-link').onsubmit = e => {
      e.preventDefault();
      const url = $('#link-url').value.trim(); $('#dlg-link').close();
      if (!url) return;
      restaurarSelecao(selLink);
      const vazio = !selLink || selLink.collapsed;
      if (vazio) document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`); else document.execCommand('createLink', false, url);
      marcar();
    };
    f.addEventListener('click', e => {
      const b = e.target.closest('[data-cmd]'); if (!b) return;
      const cmd = b.dataset.cmd; visual.focus();
      if (cmd === 'link') return abrirLink();
      if (cmd === 'limpar') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'P'); }
      else document.execCommand(cmd, false, null);
      marcar(); sincronizarBloco();
    });
    $('#ed-bloco').addEventListener('change', e => { visual.focus(); document.execCommand('formatBlock', false, e.target.value); marcar(); });
    visual.addEventListener('input', marcar);
    visual.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirLink(); } });
    visual.addEventListener('paste', e => { // cola só texto formatado "limpo" (sem o lixo do Word/sites)
      e.preventDefault();
      const html = e.clipboardData.getData('text/html'), txt = e.clipboardData.getData('text/plain');
      const limpo = html ? limparHtml(html.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '')) : txt.split(/\n{2,}/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
      document.execCommand('insertHTML', false, limpo); marcar();
    });
    $$('[data-modo]', f).forEach(b => b.addEventListener('click', () => {
      const cod = b.dataset.modo === 'codigo';
      // quebra de linha só entre blocos: entre tags de texto (<strong>a</strong><em>b</em>) mudaria o texto
      if (cod) codigo.value = normalizar(limparHtml(visual.innerHTML)).replace(/(<\/(?:p|h[2-4]|ul|ol|li|blockquote)>|<hr>)(?=<)/g, '$1\n');
      else visual.innerHTML = limparHtml(codigo.value);
      visual.hidden = cod; codigo.hidden = !cod; $('.ed-ferramentas').classList.toggle('so-codigo', cod);
      $$('[data-modo]', f).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    codigo.addEventListener('input', marcar);
    const htmlDoEditor = () => normalizar(limparHtml(codigo.hidden ? visual.innerHTML : codigo.value));

    // ---- campos personalizados ----
    function desenharCampos() {
      $('#ed-campos').innerHTML = campos.map((c, i) => `<div class="ed-campo" data-i="${i}"><input name="campo_nome" list="ed-nomes-campos" maxlength="60" placeholder="Nome (ex.: Local)" aria-label="Nome do campo ${i + 1}" value="${esc(c.nome)}"><input name="campo_valor" maxlength="400" placeholder="Valor" aria-label="Valor do campo ${i + 1}" value="${esc(c.valor)}"><button type="button" class="icone-mini perigo" data-rm aria-label="Remover campo ${i + 1}">✕</button></div>`).join('');
      $('#ed-add-campo').hidden = campos.length >= MAX_CAMPOS;
    }
    desenharCampos();
    $('#ed-campos').addEventListener('input', e => { const l = e.target.closest('.ed-campo'); if (!l) return; campos[Number(l.dataset.i)][e.target.name === 'campo_nome' ? 'nome' : 'valor'] = e.target.value; });
    $('#ed-campos').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; campos.splice(Number(b.closest('.ed-campo').dataset.i), 1); desenharCampos(); marcar(); });
    $('#ed-add-campo').addEventListener('click', () => { campos.push({ nome: '', valor: '' }); desenharCampos(); marcar(); $$('.ed-campo input').at(-2)?.focus(); });

    // ---- imagem de destaque ----
    const urlAtual = () => estado.urlNova || (estado.removeuImagem ? null : urlImagem(estado.imagem));
    function desenharImagem() {
      const u = urlAtual();
      $('#ed-imagem').innerHTML = u ? `<img src="${esc(u)}" alt="Imagem de destaque">` : '<span>Nenhuma imagem. O cartão usa a estampa de chita.</span>';
      $('#ed-remover-imagem').hidden = !u;
      atualizarPrevia();
    }
    f.arquivo_imagem.addEventListener('change', async e => {
      const arq = e.target.files[0]; if (!arq) return;
      if (!/^image\/(jpeg|png|webp)$/.test(arq.type)) { toast('Use uma imagem JPG, PNG ou WebP.', true); return; }
      estado.novaImagem = await comprimir(arq, 1350);
      if (estado.urlNova) URL.revokeObjectURL(estado.urlNova);
      estado.urlNova = URL.createObjectURL(estado.novaImagem); estado.removeuImagem = false;
      marcar(); desenharImagem();
    });
    $('#ed-remover-imagem').addEventListener('click', () => {
      if (estado.urlNova) URL.revokeObjectURL(estado.urlNova);
      estado.novaImagem = null; estado.urlNova = null; estado.removeuImagem = true; f.arquivo_imagem.value = '';
      marcar(); desenharImagem();
    });

    // ---- quando acontece / resumo / pré-visualização ----
    function mostrarCamposData() {
      const tipo = f.querySelector('[name=data_tipo]:checked').value;
      $$('[data-campo-data]', f).forEach(el => { el.hidden = el.dataset.campoData !== tipo; });
    }
    const lerData = () => {
      const tipo = f.querySelector('[name=data_tipo]:checked').value, md = v => (v ? v.slice(5) : null);
      return { data_tipo: tipo, quando_texto: f.quando_texto.value.trim(),
        pascoa_ini: tipo === 'pascoa' ? Number(f.pascoa_ini.value) : null, pascoa_fim: tipo === 'pascoa' ? Number(f.pascoa_fim.value || f.pascoa_ini.value) : null,
        fixa_ini: tipo === 'fixa' ? md(f.fixa_ini.value) : null, fixa_fim: tipo === 'fixa' ? md(f.fixa_fim.value || f.fixa_ini.value) : null };
    };
    function contarResumo() { $('#ed-conta-resumo').textContent = `${f.resumo.value.length}/400`; }
    function atualizarPrevia() {
      const u = urlAtual();
      $('#ed-previa').innerHTML = `<div class="ed-previa-capa" style="--chita:url(../img/chita-${esc(f.chita.value)}.svg)">${u ? `<img src="${esc(u)}" alt="">` : ''}</div><div class="ed-previa-corpo"><span class="selo">Festa</span><strong>${esc(f.nome.value || 'Título da festa')}</strong><span>${esc(resumoData({ ...lerData() }))}</span></div>`;
    }
    mostrarCamposData(); contarResumo(); desenharImagem();
    f.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); f.requestSubmit(); } });

    // ---- excluir ----
    $('#ed-excluir')?.addEventListener('click', async () => {
      if (!(await confirmar(`Excluir a festa "${festa.nome}"? A página dela sai do site na próxima publicação.`))) return;
      const { error: err } = await sb.from('festas').delete().eq('id', festa.id);
      if (err) return falha(err);
      if (festa.imagem) await sb.storage.from('festas').remove([festa.imagem]);
      estado.sujo = false; toast('Festa excluída.'); location.hash = '#festas';
    });

    // ---- salvar ----
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const erro = $('#ed-erro'), btn = $('#ed-salvar'); erro.textContent = '';
      const id = f.id_festa.value.trim(), nome = f.nome.value.trim(), resumo = f.resumo.value.trim();
      if (nome.length < 2) { erro.textContent = 'Escreva o título da festa.'; f.nome.focus(); return; }
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) { erro.textContent = 'O endereço só pode ter letras minúsculas, números e hífen.'; f.id_festa.focus(); return; }
      if (!resumo) { erro.textContent = 'Escreva o resumo que aparece no cartão.'; f.resumo.focus(); return; }
      const data = lerData();
      if (data.data_tipo === 'fixa' && !data.fixa_ini) { erro.textContent = 'Escolha o dia da festa.'; return; }
      if (data.data_tipo === 'livre' && !data.quando_texto) { erro.textContent = 'Escreva quando a festa acontece.'; return; }
      btn.disabled = true; btn.textContent = 'Salvando…';
      let novoCaminho = null;
      try {
        if (estado.novaImagem) {
          novoCaminho = `${usuario().id}/${id}-${Date.now()}.jpg`;
          const up = await sb.storage.from('festas').upload(novoCaminho, estado.novaImagem, { contentType: 'image/jpeg' });
          if (up.error) throw up.error;
        }
        const imagem = novoCaminho || (estado.removeuImagem ? null : estado.imagem);
        const dados = {
          id, nome, resumo, olho: f.olho.value.trim(), lema: f.lema.value.trim(), chita: f.chita.value, ordem: Number(f.ordem.value) || 0, publicada: f.publicada.value === '1',
          ...data, conteudo: htmlDoEditor() || ' ', imagem,
          campos: campos.map(c => ({ nome: c.nome.trim().slice(0, 60), valor: c.valor.trim().slice(0, 400) })).filter(c => c.nome && c.valor).slice(0, MAX_CAMPOS),
          veja: $$('[name=veja]:checked', f).map(c => c.value),
        };
        const { error: err } = nova ? await sb.from('festas').insert(dados) : await sb.from('festas').update(dados).eq('id', festa.id);
        if (err) throw err;
        if (estado.imagem && estado.imagem !== imagem) await sb.storage.from('festas').remove([estado.imagem]); // a antiga não fica sobrando
        estado.imagem = imagem; estado.novaImagem = null; estado.removeuImagem = false;
        if (estado.urlNova) { URL.revokeObjectURL(estado.urlNova); estado.urlNova = null; }
        estado.sujo = false; toast('Festa salva. O site atualiza em até 1 hora.');
        if (nova) { location.hash = `#festas/editar/${id}`; return; }
        $('#ed-estado').textContent = 'Salvo'; $('#ed-estado').classList.remove('sujo'); btn.textContent = 'Salvar'; btn.disabled = false; desenharImagem();
      } catch (err) {
        if (novoCaminho) await sb.storage.from('festas').remove([novoCaminho]);
        erro.textContent = traduzir(err); btn.disabled = false; btn.textContent = nova ? 'Criar festa' : 'Salvar';
      }
    });
  }

  // Todo texto solto no primeiro nível vira parágrafo (o navegador deixa a primeira linha "nua").
  function normalizar(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'), BLOCO = /^(P|H2|H3|H4|UL|OL|BLOCKQUOTE|HR)$/;
    const saida = []; let corrido = [];
    const fecha = () => { if (corrido.some(n => (n.textContent || '').trim() || n.nodeName === 'A')) saida.push(`<p>${corrido.map(n => (n.nodeType === 3 ? esc(n.textContent) : n.outerHTML)).join('')}</p>`); corrido = []; };
    for (const n of [...doc.body.childNodes]) { if (n.nodeType === 1 && BLOCO.test(n.tagName)) { fecha(); saida.push(n.outerHTML); } else corrido.push(n); }
    fecha();
    return saida.join('');
  }

  function sair() { limpezas.forEach(fn => { try { fn(); } catch { /* já removido */ } }); limpezas = []; }
  return { lista, editar, sair };
}
