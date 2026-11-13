// Texto de cada página de festa. A data e a contagem vêm de FESTAS (build-site.mjs).
// Fatos citados com cuidado: onde não há data ou número confirmado, o texto fica genérico.
const CONTEUDO = {
  'festival-de-marchinhas': {
    olho: 'Antes do Carnaval',
    lema: 'O concurso que escolhe as músicas que vão tocar nas ruas.',
    secoes: [
      ['O que é', ['O Festival de Marchinhas “Nhô Frade” é um concurso de marchinhas inéditas, compostas por gente da cidade e da região. As canções vencedoras ganham as ruas no Carnaval seguinte.', 'O nome homenageia o músico luizense Álvaro José Frade, o “Nhô Frade”.']],
      ['Por que importa', ['A marchinha é o coração do Carnaval de São Luiz do Paraitinga. O festival mantém viva a prática de compor para a própria festa, com letras que brincam com a vida da cidade.']],
      ['Como participar', ['Moradores e visitantes podem assistir às apresentações. Inscrições e regulamento são divulgados pela Prefeitura e pelos organizadores; confirme as datas antes de ir.']],
    ],
    veja: ['carnaval-de-marchinhas'],
  },
  'carnaval-de-marchinhas': {
    olho: 'Fevereiro ou março',
    lema: 'Marchinhas compostas na cidade, bonecões e muita chita pelas ruas do centro histórico.',
    secoes: [
      ['O Carnaval da cidade', ['O Carnaval de São Luiz do Paraitinga é de rua e de marchinha. Blocos desfilam pelo centro histórico ao som de músicas feitas pelos próprios luizenses, e a chita colorida é a marca das fantasias.', 'Os bonecões, figuras gigantes carregadas pelos foliões, fazem parte do cortejo e da identidade da festa.']],
      ['Um pouco de história', ['A marchinha de Carnaval nasceu no Rio de Janeiro no início do século XX e se espalhou pelo país. Em São Luiz do Paraitinga ela ganhou jeito próprio: em vez de só tocar sucessos antigos, a cidade passou a compor as suas, e hoje o Festival de Marchinhas abre a temporada todo ano.', 'Depois da enchente de 2010, que atingiu o centro histórico, o Carnaval seguiu como um dos símbolos da retomada da cidade.']],
      ['Quando acontece', ['O Carnaval varia de ano para ano porque depende da Páscoa: começa cerca de 47 dias antes dela. A programação costuma cobrir de sexta a terça-feira. A Prefeitura divulga os blocos e horários perto da data.']],
      ['Dicas', ['O centro é pequeno e se faz a pé. A cidade lota, então reserve hospedagem com antecedência e confirme a programação oficial.']],
    ],
    veja: ['festival-de-marchinhas'],
  },
  'semana-santa': {
    olho: 'Março ou abril',
    lema: 'Procissões e celebrações pelas ruas do centro histórico.',
    secoes: [
      ['A Semana Santa na cidade', ['Entre o Domingo de Ramos e o Domingo de Páscoa, as igrejas do centro histórico recebem celebrações, e as procissões percorrem as ruas ao entardecer e à noite, com a cidade em silêncio e respeito.']],
      ['Tradição católica no Vale do Paraíba', ['São Luiz do Paraitinga nasceu como vila católica e mantém as devoções de origem portuguesa. A Matriz de São Luís de Tolosa, reconstruída depois da enchente de 2010, é o centro das celebrações.']],
      ['Quando acontece', ['A Páscoa é móvel (primeiro domingo depois da primeira lua cheia do outono no hemisfério sul), então a semana muda a cada ano. Confira os horários das celebrações com a paróquia.']],
    ],
    veja: ['festa-do-divino'],
  },
  'festa-do-divino': {
    olho: 'Maio ou junho',
    lema: 'Bandeiras do Divino, congadas, moçambiques, cavalhada e o afogado servido a todos.',
    secoes: [
      ['A maior festa da cidade', ['A Festa do Divino Espírito Santo reúne fé, música e comida por cerca de dez dias, terminando no domingo de Pentecostes. É a festa que mais traz gente de fora.', 'Ao longo da festa saem as bandeiras do Divino, passam grupos de congada e moçambique, acontece a cavalhada e se serve o afogado, prato típico preparado para todos.']],
      ['Origem', ['A devoção ao Divino Espírito Santo veio de Portugal com os colonizadores e se espalhou por todo o Brasil, ligada à tradição da rainha Isabel de Portugal. No interior paulista, ganhou elementos próprios: as congadas e moçambiques trazem a herança africana e se misturam às procissões e aos festeiros.']],
      ['Quando acontece', ['A festa começa 40 dias depois da Páscoa, na Ascensão, e vai até Pentecostes, 49 dias depois. Por isso a data muda todo ano.']],
      ['Dicas', ['Chegue cedo, use calçado confortável e reserve hospedagem com bastante antecedência. Confirme a programação com a organização.']],
    ],
    veja: ['semana-santa', 'sao-luis-de-tolosa'],
  },
  'sao-luis-de-tolosa': {
    olho: '19 de agosto',
    lema: 'O dia do padroeiro da cidade, celebrado na Igreja Matriz.',
    secoes: [
      ['Quem foi São Luís de Tolosa', ['Luís de Anjou (1274–1297) foi um príncipe que renunciou ao trono para ser frade franciscano e bispo de Toulouse, na França. Morreu muito jovem e foi canonizado em 1317. Sua festa litúrgica é em 19 de agosto.']],
      ['A festa na cidade', ['São Luiz do Paraitinga leva o nome do santo. No dia 19 de agosto há missas e celebrações na Igreja Matriz, que fica na praça central.']],
      ['A Matriz', ['A Igreja Matriz de São Luís de Tolosa foi atingida pela cheia do rio na virada de 2009 para 2010 e depois reconstruída com a mobilização da comunidade. Veja mais em <a href="historia.html">História</a>.']],
    ],
    veja: ['festa-do-divino'],
  },
  'festa-do-saci': {
    olho: '31 de outubro',
    lema: 'A cidade celebra o folclore brasileiro e a tradição caipira.',
    secoes: [
      ['Quem é o Saci', ['O Saci-Pererê é um dos personagens mais conhecidos do folclore brasileiro: um menino de uma perna só, com gorro vermelho e cachimbo, que apronta travessuras e some em redemoinhos. Tem origem nas lendas indígenas do sul do país e ganhou traços africanos e europeus ao longo do tempo.']],
      ['Por que 31 de outubro', ['A data aproxima o Saci do Halloween e propõe uma resposta brasileira: em vez de bruxas e abóboras, o Saci, a Mula sem Cabeça e o Curupira. O escritor Monteiro Lobato, que viveu no Vale do Paraíba, ajudou a popularizar o personagem no início do século XX.']],
      ['Na cidade', ['A Festa do Saci reúne atividades culturais e brincadeiras que valorizam o folclore e a cultura caipira da região. A programação é divulgada pela Prefeitura.']],
    ],
    veja: ['carnaval-de-marchinhas'],
  },
};

export function gerar({ paginas, FESTAS, cabecalhoPagina, esc, lugarLD }) {
  for (const f of FESTAS) {
    const c = CONTEUDO[f.id];
    if (!c) continue;
    f.pagina = `festas/${f.id}.html`;
  }
  for (const f of FESTAS) {
    const c = CONTEUDO[f.id];
    if (!c) continue;
    const veja = (c.veja || []).map(id => FESTAS.find(x => x.id === id)).filter(Boolean);
    paginas.push({
      arquivo: f.pagina, migalha: f.nome,
      titulo: `${f.nome}: história e data`,
      descricao: `${f.texto} ${c.lema}`.slice(0, 200),
      jsonld: [{ '@context': 'https://schema.org', '@type': f.ini ? 'Festival' : 'Event', name: `${f.nome} de São Luiz do Paraitinga`, description: f.texto, ...(f.ini ? { startDate: f.ini, endDate: f.fim } : {}), eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: lugarLD }],
      corpo: `${cabecalhoPagina(esc(c.olho), esc(f.nome), esc(c.lema))}
<div class="chita-faixa" aria-hidden="true"></div>
<section class="secao larg estreita festa-pagina">
  <p class="festa-quando"><strong>${f.ini ? 'Próxima edição:' : 'Quando:'}</strong> ${f.ini ? `<time datetime="${f.ini}">${esc(f.quando)}</time>` : esc(f.quando)}${f.ini ? ` <span class="contagem" data-contagem="${f.ini}" data-fim="${f.fim}"></span>` : ''}</p>
  ${c.secoes.map(([h, ps]) => `<h2>${esc(h)}</h2>\n  ${ps.map(p => `<p>${p}</p>`).join('\n  ')}`).join('\n  ')}
  <p class="nota">As datas seguem o calendário religioso e popular e podem mudar. Confirme a programação com a Prefeitura e os organizadores. Eventos do dia a dia ficam na <a href="agenda.html">agenda da cidade</a>.</p>
  ${veja.length ? `<h2>Veja também</h2>\n  <ul class="veja-tambem">${veja.map(v => `<li><a href="${v.pagina}">${esc(v.nome)}</a></li>`).join('')}</ul>` : ''}
  <p><a class="btn" href="festas.html">Todas as festas</a> <a class="btn btn-sec" href="agenda.html">Ver a agenda</a></p>
</section>`,
    });
  }
}
