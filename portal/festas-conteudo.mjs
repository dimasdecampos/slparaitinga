// Festas: o conteúdo vem da tabela public.festas (editada no painel /admin).
// Na publicação, busca no Supabase e guarda uma cópia em data/festas.json; se o banco não responder, usa essa cópia.
import fs from 'fs';

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

export function gerar({ paginas, FESTAS, cabecalhoPagina, esc, lugarLD }) {
  for (const f of FESTAS) {
    const veja = (f.veja || []).map(id => FESTAS.find(x => x.id === id)).filter(Boolean);
    paginas.push({
      arquivo: f.pagina, migalha: f.nome,
      titulo: `${f.nome}: história e data`,
      descricao: `${f.texto} ${f.lema}`.slice(0, 200),
      jsonld: [{ '@context': 'https://schema.org', '@type': f.ini ? 'Festival' : 'Event', name: `${f.nome} de São Luiz do Paraitinga`, description: f.texto, ...(f.ini ? { startDate: f.ini, endDate: f.fim } : {}), eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: lugarLD }],
      corpo: `${cabecalhoPagina(esc(f.olho), esc(f.nome), esc(f.lema))}
<div class="chita-faixa" aria-hidden="true"></div>
<section class="secao larg estreita festa-pagina">
  <p class="festa-quando"><strong>${f.ini ? 'Próxima edição:' : 'Quando:'}</strong> ${f.ini ? `<time datetime="${f.ini}">${esc(f.quando)}</time>` : esc(f.quando)}${f.ini ? ` <span class="contagem" data-contagem="${f.ini}" data-fim="${f.fim}"></span>` : ''}</p>
  ${(f.secoes || []).map(s => `<h2>${esc(s.titulo)}</h2>\n  ${(s.paragrafos || []).map(p => `<p>${paragrafo(p, esc)}</p>`).join('\n  ')}`).join('\n  ')}
  <p class="nota">As datas seguem o calendário religioso e popular e podem mudar. Confirme a programação com a Prefeitura e os organizadores. Eventos do dia a dia ficam na <a href="agenda.html">agenda da cidade</a>.</p>
  ${veja.length ? `<h2>Veja também</h2>\n  <ul class="veja-tambem">${veja.map(v => `<li><a href="${v.pagina}">${esc(v.nome)}</a></li>`).join('')}</ul>` : ''}
  <p><a class="btn" href="festas.html">Todas as festas</a> <a class="btn btn-sec" href="agenda.html">Ver a agenda</a></p>
</section>`,
    });
  }
}
