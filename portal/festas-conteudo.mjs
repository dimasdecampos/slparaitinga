// Festas: o conteúdo vem da tabela public.festas (editada no painel /admin).
// Na publicação, busca no Supabase e guarda uma cópia em data/festas.json; se o banco não responder, usa essa cópia.
import fs from 'fs';
import { enderecoSeguro } from './html-seguro.mjs';

const COPIA = new URL('./data/festas.json', import.meta.url);

export async function carregarFestas({ supabaseUrl, supabaseKey }) {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/festas?select=*&publicada=is.true&order=ordem`, { headers: { apikey: supabaseKey }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const festas = await r.json();
    if (!Array.isArray(festas) || !festas.length) throw new Error('nenhuma festa publicada');
    fs.writeFileSync(COPIA, JSON.stringify(festas, null, 1) + '\n');
    console.log('Festas: lidas do banco', festas.length);
    return festas;
  } catch (err) {
    console.warn('Festas: banco indisponível, usando data/festas.json:', err.message);
    return JSON.parse(fs.readFileSync(COPIA, 'utf8'));
  }
}

// Texto vindo do painel: escapa tudo e só aceita links no formato [texto](endereço).
function paragrafo(p, esc) {
  return esc(p).replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)?[\w\-./#?=&%]+)\)/g, (_, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' rel="noopener"' : ''}>${t}</a>`);
}

const NOME_CAMPO_MAX = 60, VALOR_CAMPO_MAX = 400;
function campoHtml(c, esc) {
  const nome = String(c?.nome ?? '').trim().slice(0, NOME_CAMPO_MAX), valor = String(c?.valor ?? '').trim().slice(0, VALOR_CAMPO_MAX);
  if (!nome || !valor) return '';
  const comLinks = esc(valor).replace(/https?:\/\/[^\s<>"']+/g, u => { const href = enderecoSeguro(u.replace(/&amp;/g, '&')); return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${u.replace(/^https?:\/\//, '')}</a>` : u; });
  return `<div><dt>${esc(nome)}</dt><dd>${comLinks}</dd></div>`;
}

export function gerar({ paginas, FESTAS, cabecalhoPagina, esc, lugarLD }) {
  for (const f of FESTAS) {
    const veja = (f.veja || []).map(id => FESTAS.find(x => x.id === id)).filter(Boolean);
    paginas.push({
      arquivo: f.pagina, migalha: f.nome,
      titulo: `${f.nome}: história e data`,
      descricao: `${f.texto} ${f.lema}`.slice(0, 200),
      jsonld: [{ '@context': 'https://schema.org', '@type': f.ini ? 'Festival' : 'Event', name: `${f.nome} de São Luiz do Paraitinga`, description: f.texto, ...(f.imagem_url ? { image: f.imagem_url } : {}), ...(f.ini ? { startDate: f.ini, endDate: f.fim } : {}), eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: lugarLD }],
      corpo: `${cabecalhoPagina(esc(f.olho), esc(f.nome), esc(f.lema))}
<div class="chita-faixa" aria-hidden="true"></div>
<section class="secao larg estreita festa-pagina">
  ${f.imagem_url ? `<figure class="festa-destaque"><img src="${esc(f.imagem_url)}" alt="${esc(f.nome)}" decoding="async"></figure>` : ''}
  <p class="festa-quando"><strong>${f.ini ? 'Próxima edição:' : 'Quando:'}</strong> ${f.ini ? `<time datetime="${f.ini}">${esc(f.quando)}</time>` : esc(f.quando)}${f.ini ? ` <span class="contagem" data-contagem="${f.ini}" data-fim="${f.fim}"></span>` : ''}</p>
  ${(() => { const itens = (f.campos || []).slice(0, 20).map(c => campoHtml(c, esc)).filter(Boolean); return itens.length ? `<dl class="festa-info">${itens.join('')}</dl>` : ''; })()}
  <div class="festa-texto">${f.conteudo}</div>
  <p class="nota">As datas seguem o calendário religioso e popular e podem mudar. Confirme a programação com a Prefeitura e os organizadores. Eventos do dia a dia ficam na <a href="agenda.html">agenda da cidade</a>.</p>
  ${veja.length ? `<h2>Veja também</h2>\n  <ul class="veja-tambem">${veja.map(v => `<li><a href="${v.pagina}">${esc(v.nome)}</a></li>`).join('')}</ul>` : ''}
  <p><a class="btn" href="festas.html">Todas as festas</a> <a class="btn btn-sec" href="agenda.html">Ver a agenda</a></p>
</section>`,
    });
  }
}
