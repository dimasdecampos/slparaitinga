// Gera o mapa 2D (mapa.svg) e os lugares (data/pontos.json) a partir dos dados reais
// do OpenStreetMap usados na cidade 3D. Paleta sóbria: a cor fica para o que está acontecendo.
// Uso: node portal/build-mapa.mjs
import fs from 'fs';

const city = JSON.parse(fs.readFileSync(new URL('../cidade3d/data/city.json', import.meta.url), 'utf8'));
const VB = { x: -720, y: -560, w: 1640, h: 1230 }; // recorte em metros: centro histórico e bairros vizinhos
const M = 120;
const dentro = p => { for (let i = 0; i < p.length; i += 2) if (p[i] > VB.x - M && p[i] < VB.x + VB.w + M && p[i + 1] > VB.y - M && p[i + 1] < VB.y + VB.h + M) return true; return false; };
const r = v => Math.round(v * 10) / 10;
const d = (p, fechar) => { let s = ''; for (let i = 0; i < p.length; i += 2) s += (i ? 'L' : 'M') + r(p[i]) + ' ' + r(p[i + 1]); return s + (fechar ? 'Z' : ''); };
const comprimento = p => { let L = 0; for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return L; };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const inverter = p => { const q = []; for (let i = p.length - 2; i >= 0; i -= 2) q.push(p[i], p[i + 1]); return q; };

const C = {
  terra: '#f3f0ea', bairro: '#ebe6dc', grama: '#e4ead8', mata: '#d0dcc2', praca: '#cfe2bf', quadra: '#d6e5c6', cemiterio: '#e6e1d5',
  agua: '#b3d3e2', aguaBorda: '#93bfd3', ruaBorda: '#d8d1c4', rua: '#ffffff', via: '#f6e9bd', viaBorda: '#dfcd94', trilha: '#c8bead',
  casa: '#dccfbe', casaBorda: '#c4b6a2', civico: '#e6dac6', igreja: '#ffffff', igrejaBorda: '#b5552f', texto: '#8b8173', rioTexto: '#4f88a3',
};

const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" role="img" aria-labelledby="mapa-titulo">
<title id="mapa-titulo">Mapa de São Luiz do Paraitinga</title>
<rect x="${VB.x - 3000}" y="${VB.y - 3000}" width="${VB.w + 6000}" height="${VB.h + 6000}" fill="${C.terra}"/>`);

const FILL = { grass: C.grama, wood: C.mata, cemetery: C.cemiterio, pitch: C.quadra, park: C.praca };
out.push('<g id="g-verde">');
for (const t of ['grass', 'wood', 'cemetery', 'pitch', 'park'])
  for (const g of city.green) if (g.t === t && dentro(g.p)) out.push(`<path d="${d(g.p, true)}" fill="${FILL[t]}"/>`);
out.push('</g>');

const ehUrbana = rd => rd.t === 'residential' || rd.t === 'pedestrian' || rd.t === 'living_street' || (['tertiary', 'secondary', 'unclassified'].includes(rd.t) && Math.hypot(rd.p[0], rd.p[1]) < 700);
out.push(`<g id="g-bairro" fill="none" stroke="${C.bairro}" stroke-linecap="round" stroke-linejoin="round" stroke-width="44">`);
for (const rd of city.roads) if (ehUrbana(rd) && !rd.a && dentro(rd.p)) out.push(`<path d="${d(rd.p)}"/>`);
out.push('</g>');

out.push('<g id="g-agua" stroke-linecap="round" stroke-linejoin="round">');
for (const rv of city.rivers) if (dentro(rv.p)) {
  const w = rv.t === 'river' ? (rv.w || 22) : 3;
  out.push(`<path d="${d(rv.p)}" fill="none" stroke="${C.aguaBorda}" stroke-width="${w + 3}"/><path d="${d(rv.p)}" fill="none" stroke="${C.agua}" stroke-width="${w}"/>`);
}
for (const w of city.water) if (dentro(w)) out.push(`<path d="${d(w, true)}" fill="${C.agua}" stroke="${C.aguaBorda}" stroke-width="1.5"/>`);
out.push('</g>');

const LARG = { primary: 12, primary_link: 9, secondary: 11, tertiary: 9, residential: 7.5, unclassified: 7.5, pedestrian: 7.5, living_street: 7.5, service: 4.5, track: 3, footway: 1.8, path: 1.6, steps: 2 };
const ordem = ['path', 'footway', 'steps', 'track', 'service', 'unclassified', 'residential', 'living_street', 'pedestrian', 'tertiary', 'secondary', 'primary_link', 'primary'];
const ruas = city.roads.filter(rd => LARG[rd.t] && dentro(rd.p)).sort((a, b) => ordem.indexOf(a.t) - ordem.indexOf(b.t));
const principal = t => ['primary', 'primary_link', 'secondary'].includes(t);
const trilha = t => ['footway', 'path', 'steps', 'track'].includes(t);
out.push('<g id="g-ruas" fill="none" stroke-linecap="round" stroke-linejoin="round">');
for (const rd of ruas) if (!trilha(rd.t)) { const b = principal(rd.t) ? C.viaBorda : C.ruaBorda; out.push(rd.a ? `<path d="${d(rd.p, true)}" fill="${b}"/>` : `<path d="${d(rd.p)}" stroke="${b}" stroke-width="${LARG[rd.t] + 2.4}"/>`); }
for (const rd of ruas) {
  if (trilha(rd.t)) { out.push(`<path d="${d(rd.p)}" stroke="${C.trilha}" stroke-width="${LARG[rd.t]}" stroke-dasharray="4 4"/>`); continue; }
  const cor = principal(rd.t) ? C.via : C.rua;
  out.push(rd.a ? `<path d="${d(rd.p, true)}" fill="${cor}" stroke="none"/>` : `<path d="${d(rd.p)}" stroke="${cor}" stroke-width="${LARG[rd.t]}"/>`);
}
out.push('</g>');

out.push(`<g id="g-predios" stroke="${C.casaBorda}" stroke-width="1" stroke-linejoin="round">`);
for (const b of city.buildings) if (dentro(b.p))
  out.push(b.k === 'church' ? `<path d="${d(b.p, true)}" fill="${C.igreja}" stroke="${C.igrejaBorda}" stroke-width="2"/>` : `<path d="${d(b.p, true)}" fill="${b.k === 'civic' ? C.civico : C.casa}"/>`);
out.push('</g>');

out.push(`<g id="g-nomes" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11" font-weight="500" fill="${C.texto}">`);
const porNome = new Map();
for (const rd of ruas) if (rd.n && !trilha(rd.t)) { const L = comprimento(rd.p); if (!porNome.has(rd.n) || porNome.get(rd.n).L < L) porNome.set(rd.n, { rd, L }); }
let k = 0;
for (const [nome, { rd, L }] of [...porNome].sort((a, b) => b[1].L - a[1].L).slice(0, 34)) {
  const curto = nome.replace(/^Rua /, 'R. ').replace(/^Avenida /, 'Av. ').replace(/^Via de Acesso /, 'Acesso ').replace(/^Estrada Municipal /, 'Estr. ').replace(/ Doutor /, ' Dr. ');
  if (L < curto.length * 6.4) continue;
  const p = rd.p[rd.p.length - 2] < rd.p[0] ? inverter(rd.p) : rd.p;
  out.push(`<path id="rua-${k}" d="${d(p)}" fill="none"/><text dy="3.8" paint-order="stroke" stroke="${C.rua}" stroke-width="3"><textPath href="#rua-${k}" startOffset="50%" text-anchor="middle">${esc(curto)}</textPath></text>`);
  k++;
}
const rio = city.rivers.find(rv => rv.t === 'river');
if (rio) { // nome do rio no trecho contínuo mais longo ao sul do centro
  let pts = [], atual = [];
  for (let i = 0; i < rio.p.length; i += 2) {
    if (rio.p[i] > -200 && rio.p[i] < 120 && rio.p[i + 1] > 200 && rio.p[i + 1] < 560) atual.push(rio.p[i], rio.p[i + 1]);
    else { if (comprimento(atual) > comprimento(pts)) pts = atual; atual = []; }
  }
  if (comprimento(atual) > comprimento(pts)) pts = atual;
  if (pts.length >= 4) {
    const p = pts[pts.length - 2] < pts[0] ? inverter(pts) : pts;
    out.push(`<path id="rio-nome" d="${d(p)}" fill="none"/><text dy="5" font-style="italic" font-size="16" font-weight="600" fill="${C.rioTexto}" letter-spacing="1.5"><textPath href="#rio-nome" startOffset="50%" text-anchor="middle">Rio Paraitinga</textPath></text>`);
  }
}
out.push('</g></svg>');
fs.writeFileSync(new URL('./mapa.svg', import.meta.url), out.join('\n'));

// ---------- lugares ----------
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PONTOS = [
  [/^praça doutor oswaldo cruz/i, 'Praça Dr. Oswaldo Cruz', 'praca', 'A praça principal: palco do Carnaval, da Festa do Divino e dos encontros da cidade, com o coreto no centro.'],
  [/matriz/i, 'Igreja Matriz São Luís de Tolosa', 'igreja', 'De frente para a praça principal. Desabou na enchente de 2010 e foi reconstruída pela cidade.'],
  [/ros[aá]rio/i, 'Igreja do Rosário', 'igreja', 'Uma das igrejas históricas do centro, no alto da ladeira.'],
  [/merc[eê]s/i, 'Capela das Mercês', 'igreja', 'Capela histórica do centro.'],
  [/prazeres/i, 'Capela Nossa Senhora dos Prazeres', 'igreja', 'Capela do outro lado do rio.'],
  [/^casa de oswaldo cruz/i, 'Casa de Oswaldo Cruz', 'cultura', 'Casa onde nasceu o médico sanitarista Oswaldo Cruz, em 1872.'],
  [/largo do teatro/i, 'Largo do Teatro', 'praca', 'Largo histórico do centro, cenário de ensaios e apresentações.'],
  [/museu/i, 'Museu Encuca a Cuca', 'cultura', 'Museu no centro da cidade.'],
  [/cruzeiro/i, 'Praça do Cruzeiro', 'praca', 'Praça em um dos pontos altos do centro.'],
  [/pra[cç]a de eventos/i, 'Praça de Eventos', 'praca', 'Espaço para shows e festas.'],
  [/parque linear/i, 'Parque Linear Urbano', 'praca', 'Área verde às margens do rio.'],
  [/prefeitura/i, 'Prefeitura Municipal', 'servico', 'Atendimento ao cidadão. Praça Dr. Oswaldo Cruz, 62. Telefone (12) 3671-7000.'],
  [/santa casa/i, 'Santa Casa de Misericórdia', 'servico', 'Hospital da cidade.'],
];
const pontos = [];
for (const [re, nome, tipo, texto] of PONTOS) {
  const p = city.pois.find(x => re.test(x.n));
  if (p && p.x > VB.x && p.x < VB.x + VB.w && p.z > VB.y && p.z < VB.y + VB.h) pontos.push({ slug: slug(nome), nome, tipo, texto, x: r(p.x), y: r(p.z) });
}
if (rio) {
  let best = null; for (let i = 0; i < rio.p.length; i += 2) { const dd = Math.hypot(rio.p[i] + 60, rio.p[i + 1] - 260); if (!best || dd < best.dd) best = { dd, x: rio.p[i], y: rio.p[i + 1] }; }
  pontos.push({ slug: 'rio-paraitinga', nome: 'Rio Paraitinga', tipo: 'praca', texto: 'O rio que corta a cidade. Na cheia é monitorado pela Defesa Civil; fora dela, é procurado para o rafting.', x: r(best.x), y: r(best.y) });
}
fs.writeFileSync(new URL('./data/pontos.json', import.meta.url), JSON.stringify(pontos, null, 1));
console.log('mapa.svg', (fs.statSync(new URL('./mapa.svg', import.meta.url)).size / 1024).toFixed(0) + ' KB | ruas nomeadas:', k, '| lugares:', pontos.length);
