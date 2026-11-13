// Coletor do portal: gera data/noticias.json, data/prefeitura.json, data/agenda.json e data/clima.json
// Uso: node collect.mjs
import fs from 'fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (portal-paraitinga-prototipo)' };
const OUT = new URL('./data/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

async function get(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

// ---------- utilidades de texto ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', ordm: 'º', ordf: 'ª', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', deg: '°' };
function decode(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? (n.length > 2 ? m.normalize('NFC').replace(m, accent(n) ?? m) : m));
}
function accent(n) { // &atilde; &eacute; &ccedil; ...
  const m = n.match(/^([a-zA-Z])(acute|grave|tilde|circ|uml|cedil)$/); if (!m) return null;
  const mark = { acute: '́', grave: '̀', tilde: '̃', circ: '̂', uml: '̈', cedil: '̧' }[m[2]];
  return (m[1] + mark).normalize('NFC');
}
const stripTags = s => decode(decode(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, t) => (x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '';
const items = xml => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);

// ---------- categorias ----------
const CATS = [
  ['Eventos e Cultura', /festival|festa|carnaval|marchinha|show|cultura|folia|divino|saci|teatro|musica|museu|exposi|cinema|congada|moçambique|mocambique|apresenta/],
  ['Turismo', /turismo|turista|rafting|pousada|cachoeira|trilha|parque estadual|nucleo santa virginia|ecoturismo|roteiro|visitar|viagem/],
  ['Clima e Defesa Civil', /chuva|enchente|inunda|alagamento|deslizamento|defesa civil|temporal|frio|geada|calor|cheia|rio paraitinga sobe|alerta/],
  ['Política', /eleic|eleito|prefeit|vereador|camara|candidat|votos|apuracao|turno|tse|mandato|partido/],
  ['Trânsito e Estradas', /rodovia|radar|estrada|transito|acidente|sp 125|oswaldo cruz.*km|der |pista|ubatuba/],
  ['Saúde e Educação', /saude|hospital|santa casa|vacina|escola|educacao|professor|aluno|ubs|dengue/],
  ['Polícia e Justiça', /policia|preso|crime|justica|tribunal|forum|jurado|tjsp|furto|roubo|homicid/],
  ['Economia e Campo', /agricult|produtor|leite|gado|bovino|eucalipto|economia|emprego|vaga|comercio|empresa/],
];
const categorize = text => { const t = norm(text); for (const [c, re] of CATS) if (re.test(t)) return c; return 'Geral'; };

// ---------- 1) Notícias (Google News + Bing) ----------
const QUERIES = ['"São Luiz do Paraitinga"', '"São Luís do Paraitinga"', '"São Luíz do Paraitinga"', 'Paraitinga'];
const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
const bing = q => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=pt-BR&cc=BR`;
const RELEVANTE = /paraitinga/;
const LIMITE_DIAS = 400;

async function noticias() {
  const out = [], log = {};
  const jobs = [];
  for (const q of QUERIES) { jobs.push(['google', q, gnews(q)]); jobs.push(['bing', q, bing(q)]); }
  await Promise.all(jobs.map(async ([src, q, url]) => {
    try {
      const xml = await get(url); let n = 0;
      for (const it of items(xml)) {
        let titulo = stripTags(tag(it, 'title'));
        let fonte = stripTags(tag(it, 'source'));
        if (src === 'google' && fonte && titulo.endsWith(' - ' + fonte)) titulo = titulo.slice(0, -(fonte.length + 3)).trim();
        let link = stripTags(tag(it, 'link'));
        if (src === 'bing') { const u = link.match(/[?&]url=([^&]+)/); if (u) link = decodeURIComponent(u[1]); try { fonte ||= new URL(link).hostname.replace(/^www\./, ''); } catch {} }
        const resumo = src === 'google' ? '' : stripTags(tag(it, 'description')).slice(0, 280);
        const data = new Date(stripTags(tag(it, 'pubDate')));
        if (!titulo || !link || isNaN(data)) continue;
        if (!RELEVANTE.test(norm(titulo + ' ' + resumo))) continue;
        if ((Date.now() - data) / 864e5 > LIMITE_DIAS) continue;
        out.push({ titulo, link, fonte: fonte || src, data: data.toISOString(), resumo, via: src }); n++;
      }
      log[`${src} ${q}`] = n;
    } catch (e) { log[`${src} ${q}`] = 'ERRO ' + e.message; }
  }));
  // deduplicação por título normalizado (mesma matéria em várias buscas)
  const seen = new Map();
  for (const n of out.sort((a, b) => b.data.localeCompare(a.data))) {
    const k = norm(n.titulo).slice(0, 90);
    if (!seen.has(k)) seen.set(k, n);
    else if (!seen.get(k).resumo && n.resumo) seen.get(k).resumo = n.resumo;
  }
  let eleicao = 0;
  const lista = [...seen.values()]
    .filter(n => n.titulo.length >= 28 && !/\.(png|jpe?g|pdf)$/i.test(n.titulo) && /paraitinga|sl do paraitinga/i.test(n.titulo + ' ' + n.resumo))
    .filter(n => !/resultado|apura|zona eleitoral|vota[cç][aã]o|vence em|vereador 20\d\d/i.test(n.titulo) || ++eleicao <= 4)
    .map(n => ({ ...n, categoria: categorize(n.titulo + ' ' + n.resumo) }));
  return { lista, log };
}

// ---------- 2) Prefeitura (feed oficial) ----------
function catPrefeitura(t) {
  const s = norm(t);
  if (/pregao|concorrencia|licitac|edital .*registro|chamamento|dispensa/.test(s)) return 'Licitações';
  if (/^lei municipal|^decreto|^portaria|lei complementar/.test(s)) return 'Atos oficiais';
  if (/processo seletivo|concurso|convocac|classificac|atribuic/.test(s)) return 'Concursos e seleções';
  if (/cardapio|escola|educac/.test(s)) return 'Educação';
  if (/festival|cultura|festa|oficina|pnab|turismo/.test(s)) return 'Cultura';
  if (/saude|vacina/.test(s)) return 'Saúde';
  return 'Comunicados';
}
const SECAO = { cultura: 'Cultura', educacao: 'Educação', saude: 'Saúde', turismo: 'Cultura', esportes: 'Esportes', comunicacao: 'Comunicados', administrativo: 'Concursos e seleções', obras: 'Obras', meio: 'Meio ambiente' };
async function prefeituraPagina() {
  const base = 'https://www.saoluizdoparaitinga.sp.gov.br';
  const html = await get(base + '/noticias');
  const out = [];
  for (const m of html.matchAll(/<li class="list-item noticias">([\s\S]*?)<\/li>/g)) {
    const b = m[1], href = (b.match(/class="list-item__link" href="([^"]+)"/) || [])[1]; if (!href) continue;
    const titulo = stripTags((b.match(/class="list-item__link"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
    const dt = stripTags((b.match(/list-item__meta">([\s\S]*?)<\/span>/) || [])[1] || '').match(/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2})h(\d{2})/);
    const img = (b.match(/<img src="([^"]+)"/) || [])[1];
    const secao = href.split('/')[2] || '';
    out.push({ titulo, link: base + href, data: dt ? new Date(`${dt[3]}-${dt[2]}-${dt[1]}T${dt[4]}:${dt[5]}:00-03:00`).toISOString() : new Date().toISOString(), resumo: '',
      categoria: Object.entries(SECAO).find(([k]) => secao.startsWith(k))?.[1] || catPrefeitura(titulo), imagem: img && !/naodisponivel/.test(img) ? base + img : null });
  }
  return out;
}
async function prefeitura() {
  const pagina = await prefeituraPagina().catch(e => (console.warn('pagina prefeitura', e.message), []));
  const xml = await get('https://ecrie20.com.br/saoluizdoparaitinga.sp.gov.br/feed.xml');
  const seen = new Set(), lista = [];
  for (const it of items(xml)) {
    const titulo = stripTags(tag(it, 'title')), link = stripTags(tag(it, 'link'));
    if (!titulo || seen.has(link)) continue; seen.add(link);
    const html = decode(tag(it, 'description'));
    const img = (html.match(/<img[^>]+src="([^"]+)"/) || [])[1] || null;
    lista.push({ titulo, link, data: new Date(stripTags(tag(it, 'pubDate'))).toISOString(), resumo: stripTags(html).slice(0, 260), categoria: catPrefeitura(titulo), imagem: img });
  }
  const porTitulo = new Map(lista.map(n => [norm(n.titulo), n]));
  for (const n of pagina) { const k = norm(n.titulo), f = porTitulo.get(k); if (f) { f.imagem ||= n.imagem; f.categoria = n.categoria; } else { porTitulo.set(k, n); lista.push(n); } }
  return lista.sort((a, b) => b.data.localeCompare(a.data));
}

// ---------- 3) Agenda ----------
// 3a) agenda oficial da Prefeitura (mês atual e os 2 seguintes)
async function agendaOficial() {
  const out = [], now = new Date();
  for (let k = 0; k < 3; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1), mes = d.getMonth() + 1, ano = d.getFullYear();
    try {
      const html = await get(`https://www.saoluizdoparaitinga.sp.gov.br/agenda?mes=${mes}&ano=${ano}`);
      // cada compromisso publicado aparece como um link para /agenda/<slug>
      for (const m of html.matchAll(/<a[^>]+href="(\/agenda\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
        const titulo = stripTags(m[2]); if (!titulo) continue;
        const ctx = stripTags(html.slice(Math.max(0, m.index - 400), m.index));
        const dm = ctx.match(/(\d{2})\/(\d{2})\/(\d{4})(?:[^\d]+(\d{2})h(\d{2})?)?(?![\s\S]*\d{2}\/\d{2}\/\d{4})/);
        out.push({ titulo, link: 'https://www.saoluizdoparaitinga.sp.gov.br' + m[1], inicio: dm ? `${dm[3]}-${dm[2]}-${dm[1]}${dm[4] ? `T${dm[4]}:${dm[5] || '00'}` : ''}` : `${ano}-${String(mes).padStart(2, '0')}-01`, tipo: 'oficial', fonte: 'Agenda da Prefeitura' });
      }
    } catch (e) { console.warn('agenda oficial', mes, ano, e.message); }
  }
  return out;
}

// 3b) calendário tradicional da cidade (datas recorrentes, calculadas por ano)
function pascoa(y) { // algoritmo de Meeus/Jones/Butcher
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mes - 1, dia));
}
const iso = d => d.toISOString().slice(0, 10);
const addDias = (d, n) => new Date(d.getTime() + n * 864e5);
function calendarioTradicional(anos) {
  const ev = [];
  for (const y of anos) {
    const p = pascoa(y);
    ev.push({ titulo: 'Carnaval de Marchinhas', inicio: iso(addDias(p, -51)), fim: iso(addDias(p, -46)), descricao: 'Um dos carnavais de rua mais tradicionais do país, embalado pelas marchinhas compostas na cidade e pelos bonecões.' });
    ev.push({ titulo: 'Semana Santa', inicio: iso(addDias(p, -7)), fim: iso(p), descricao: 'Procissões e celebrações religiosas no centro histórico.' });
    ev.push({ titulo: 'Festa do Divino Espírito Santo', inicio: iso(addDias(p, 40)), fim: iso(addDias(p, 49)), descricao: 'Principal festa religiosa e popular da cidade, encerrada no domingo de Pentecostes, com cavalhada, congadas, moçambiques e o afogado servido à população.' });
    ev.push({ titulo: 'Festa de São Luís de Tolosa (padroeiro)', inicio: `${y}-08-19`, descricao: 'Celebração do padroeiro do município.' });
    ev.push({ titulo: 'Festa do Saci', inicio: `${y}-10-31`, descricao: 'Celebração do folclore brasileiro em contraponto ao Halloween, ligada à tradição caipira local.' });
  }
  return ev.map(e => ({ ...e, tipo: 'tradicional', fonte: 'Calendário tradicional (datas aproximadas — confirmar com a Prefeitura)' }));
}

// 3c) eventos citados em notícias recentes
function eventosDasNoticias(noticias, pref) {
  const re = /festival|festa |carnaval|show|apresenta|inscri[cç][oõ]es abertas|oficina|feira|encontro|semana d[eo]/i;
  return [...pref, ...noticias]
    .filter(n => re.test(n.titulo) && (Date.now() - new Date(n.data)) / 864e5 < 90)
    .slice(0, 10)
    .map(n => ({ titulo: n.titulo, link: n.link, publicado: n.data, tipo: 'noticia', fonte: n.fonte || 'Prefeitura' }));
}

// ---------- 4) Clima (Open-Meteo, sem chave) ----------
async function clima() {
  const u = 'https://api.open-meteo.com/v1/forecast?latitude=-23.222&longitude=-45.311&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=America%2FSao_Paulo&forecast_days=7';
  return JSON.parse(await get(u));
}

// ---------- execução ----------
const t0 = Date.now();
const [nRes, pRes, aRes, cRes] = await Promise.allSettled([noticias(), prefeitura(), agendaOficial(), clima()]);
const noticiasLista = nRes.status === 'fulfilled' ? nRes.value.lista : [];
const prefLista = pRes.status === 'fulfilled' ? pRes.value : [];
const hoje = new Date(), anos = [hoje.getFullYear(), hoje.getFullYear() + 1];
const agenda = {
  oficial: aRes.status === 'fulfilled' ? aRes.value : [],
  tradicional: calendarioTradicional(anos).filter(e => (e.fim || e.inicio) >= iso(hoje)).sort((a, b) => a.inicio.localeCompare(b.inicio)),
  noticias: eventosDasNoticias(noticiasLista, prefLista),
};
const meta = { atualizado: new Date().toISOString() };
const save = (f, d) => fs.writeFileSync(new URL(f, OUT), JSON.stringify({ ...meta, ...d }, null, 1));
save('noticias.json', { itens: noticiasLista });
save('prefeitura.json', { itens: prefLista });
save('agenda.json', agenda);
if (cRes.status === 'fulfilled') save('clima.json', cRes.value);

console.log('Notícias:', noticiasLista.length, nRes.status === 'fulfilled' ? nRes.value.log : nRes.reason?.message);
console.log('Prefeitura:', prefLista.length, pRes.status === 'rejected' ? pRes.reason?.message : '');
console.log('Agenda — oficial:', agenda.oficial.length, '| tradicional:', agenda.tradicional.length, '| das notícias:', agenda.noticias.length);
console.log('Clima:', cRes.status, cRes.status === 'rejected' ? cRes.reason?.message : '');
console.log('Categorias:', noticiasLista.reduce((o, n) => (o[n.categoria] = (o[n.categoria] || 0) + 1, o), {}));
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
