// Painel /admin, aba "Fotos da home": a capa do topo da página inicial e as fotos dos cartões de "Conheça a cidade".
// As fotos vão para o bucket "site" (duas versões: grande e uma menor para celular) e a tabela site_imagens guarda o caminho.
// O site lê a tabela na publicação (a cada hora), então a foto nova aparece em até 1 hora.
import { comprimir } from './imagem.js';

const ESPACOS = [
  { chave: 'capa', nome: 'Capa da página inicial', dica: 'A foto grande do topo, atrás do nome da cidade. Prefira uma foto deitada (horizontal), com o assunto no meio e a parte de baixo mais simples, porque o texto fica por cima dela.', proporcao: '4 / 3' },
  { chave: 'lugares', nome: 'Cartão “Lugares”', dica: 'Em “Conheça a cidade” e também no topo da página Lugares. Uma praça, igreja ou o rio.', proporcao: '16 / 9', minimo: 1400 },
  { chave: 'historia', nome: 'Cartão “História”', dica: 'Em “Conheça a cidade” e também no topo da página História. O casario, a Matriz ou uma foto antiga.', proporcao: '16 / 9', minimo: 1400 },
  { chave: 'servicos', nome: 'Cartão “Serviços”', dica: 'Em “Conheça a cidade” e também no topo da página Serviços. A Prefeitura, o Mercado ou uma rua do centro.', proporcao: '16 / 9', minimo: 1400 },
];
ESPACOS[0].minimo = 1600; // a capa ocupa mais tela, então pede foto maior
// Lê só as dimensões da foto escolhida, para avisar quando ela é pequena demais (vai ficar borrada em celular e telas nítidas).
const dimensoes = arq => new Promise(res => { const u = URL.createObjectURL(arq), i = new Image(); i.onload = () => { res([i.naturalWidth, i.naturalHeight]); URL.revokeObjectURL(u); }; i.onerror = () => { res(null); URL.revokeObjectURL(u); }; i.src = u; });

export function criarHome({ app, sb, esc, toast, falha, confirmar, traduzir, cfg, actionsUrl, usuario }) {
  const url = caminho => (caminho ? `${cfg.supabaseUrl}/storage/v1/object/public/site/${caminho.split('/').map(encodeURIComponent).join('/')}` : null);
  const pequena = caminho => caminho.replace(/\.jpg$/, '-p.jpg');

  async function abrir() {
    app.innerHTML = `<div class="barra"><h2>Fotos da home</h2></div>
      <p class="aviso-admin">Sem foto, o site usa a estampa de chita. A foto nova aparece no site em até 1 hora, ou <a href="${actionsUrl}" target="_blank" rel="noopener">publique agora pelo GitHub</a> (botão “Run workflow”). As fotos são reduzidas antes de enviar.</p>
      <div id="espacos" class="espacos-home"><p class="carregando">Carregando…</p></div>`;
    const { data, error } = await sb.from('site_imagens').select('chave, imagem, legenda');
    if (error) {
      if (/site_imagens|PGRST205|42P01|does not exist|schema cache/i.test(error.message || error.code || '')) {
        $('#espacos').innerHTML = '<p class="vazio">Falta criar a tabela das fotos no banco: rode o arquivo <b>supabase/site-imagens.sql</b> no SQL Editor do Supabase e recarregue esta página.</p>';
        return;
      }
      return falha(error);
    }
    const atuais = Object.fromEntries((data || []).map(x => [x.chave, x]));
    $('#espacos').innerHTML = ESPACOS.map(e => {
      const a = atuais[e.chave] || {};
      return `<form class="ed-caixa espaco-home" data-chave="${e.chave}">
        <h3>${esc(e.nome)}</h3><small class="ed-dica">${esc(e.dica)}</small>
        <div class="espaco-previa${e.chave === 'capa' ? ' previa-capa' : ''}" style="aspect-ratio:${e.proporcao};--chita:url(../img/chita-${e.chave === 'lugares' ? 'azul' : e.chave === 'historia' ? 'amarela' : 'vermelha'}.svg)">${a.imagem ? `<img src="${esc(url(a.imagem))}" alt="">` : ''}${e.chave === 'capa' ? '<span class="previa-texto"><b>São Luiz do Paraitinga</b><small>o texto da capa fica aqui</small></span>' : ''}</div>
        <label class="botao-sec ed-enviar">Escolher foto<input type="file" name="arquivo" accept="image/jpeg,image/png,image/webp" hidden></label>
        <p class="aviso-foto" role="status" hidden></p>
        <label>Descrição da foto<small class="ed-dica">O que aparece nela, e o crédito do fotógrafo se houver. Ajuda quem usa leitor de tela.</small><input name="legenda" maxlength="160" value="${esc(a.legenda || '')}" placeholder="Ex.: Casario colorido da Praça Dr. Oswaldo Cruz. Foto: Fulano"></label>
        <div class="acoes-linha">${a.imagem ? '<button type="button" class="botao-sec perigo" data-remover>Remover foto</button>' : ''}<button class="btn" disabled>Salvar</button></div>
      </form>`;
    }).join('');

    app.querySelectorAll('.espaco-home').forEach(f => {
      const chave = f.dataset.chave, atual = atuais[chave] || {}, salvar = f.querySelector('button.btn');
      let nova = null;
      f.addEventListener('input', () => { salvar.disabled = false; });
      const aviso = f.querySelector('.aviso-foto'), minimo = ESPACOS.find(x => x.chave === chave).minimo;
      f.arquivo.addEventListener('change', async () => {
        const arq = f.arquivo.files[0]; if (!arq) return;
        if (!/^image\/(jpeg|png|webp)$/.test(arq.type)) { toast('Use uma foto JPG, PNG ou WebP.', true); f.arquivo.value = ''; return; }
        nova = arq; salvar.disabled = false;
        const dim = await dimensoes(arq);
        if (dim && dim[0] < minimo) { aviso.textContent = `Esta foto tem ${dim[0]} × ${dim[1]} px, pequena para este espaço: vai ficar borrada no celular e em telas nítidas. O ideal é ter pelo menos ${minimo} px de largura. Dá para salvar assim, mas vale usar a foto original.`; aviso.hidden = false; }
        else aviso.hidden = true;
        const box = f.querySelector('.espaco-previa'); let img = box.querySelector('img');
        if (!img) { img = document.createElement('img'); img.alt = ''; box.prepend(img); }
        img.src = URL.createObjectURL(arq);
      });
      f.addEventListener('submit', async ev => {
        ev.preventDefault(); salvar.disabled = true; salvar.textContent = 'Salvando…';
        try {
          let caminho = atual.imagem || null;
          if (nova) {
            caminho = `${usuario().id}/${chave}-${Date.now()}.jpg`;
            const [grande, menor] = await Promise.all([comprimir(nova, 1800), comprimir(nova, 900)]);
            const up1 = await sb.storage.from('site').upload(caminho, grande, { contentType: 'image/jpeg' });
            if (up1.error) throw up1.error;
            const up2 = await sb.storage.from('site').upload(pequena(caminho), menor, { contentType: 'image/jpeg' });
            if (up2.error) { await sb.storage.from('site').remove([caminho]); throw up2.error; }
          }
          const { error: err } = await sb.from('site_imagens').upsert({ chave, imagem: caminho, legenda: f.legenda.value.trim() });
          if (err) { if (nova) await sb.storage.from('site').remove([caminho, pequena(caminho)]); throw err; }
          if (nova && atual.imagem) await sb.storage.from('site').remove([atual.imagem, pequena(atual.imagem)]); // a antiga não fica sobrando
          toast('Foto salva. Aparece no site na próxima publicação.'); abrir();
        } catch (e) { salvar.disabled = false; salvar.textContent = 'Salvar'; toast(traduzir(e), true); console.error(e); }
      });
      f.querySelector('[data-remover]')?.addEventListener('click', async () => {
        if (!(await confirmar('Remover esta foto? O site volta a mostrar a estampa de chita.', 'Remover'))) return;
        const { error: err } = await sb.from('site_imagens').upsert({ chave, imagem: null, legenda: f.legenda.value.trim() });
        if (err) return falha(err);
        await sb.storage.from('site').remove([atual.imagem, pequena(atual.imagem)]);
        toast('Foto removida.'); abrir();
      });
    });
  }
  const $ = s => app.querySelector(s);
  return { abrir };
}
