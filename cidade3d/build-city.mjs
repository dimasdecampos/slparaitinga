// Converte data/osm.json + data/heights.json em data/city.json (coordenadas locais em metros)
import fs from 'fs';

const osm = JSON.parse(fs.readFileSync('data/osm.json', 'utf8'));
const H = JSON.parse(fs.readFileSync('data/heights.json', 'utf8'));

const nodes = new Map();
for (const e of osm.elements) if (e.type === 'node') nodes.set(e.id, e);
const ways = osm.elements.filter(e => e.type === 'way' && e.tags);

// Origem: Praça Oswaldo Cruz (centro histórico), se existir no mapa
let origin = { lat: -23.2219, lon: -45.3104 };
const praca = ways.find(w => /oswaldo cruz/i.test(w.tags.name || '') && (w.tags.leisure || w.tags.place || w.tags.highway === 'pedestrian'));
if (praca) {
  const ns = praca.nodes.map(id => nodes.get(id)).filter(Boolean);
  origin = { lat: ns.reduce((s, n) => s + n.lat, 0) / ns.length, lon: ns.reduce((s, n) => s + n.lon, 0) / ns.length };
}
const MLAT = 110574, MLON = 111320 * Math.cos(origin.lat * Math.PI / 180);
const r1 = v => Math.round(v * 10) / 10;
const X = lon => (lon - origin.lon) * MLON;       // leste +
const Z = lat => -(lat - origin.lat) * MLAT;      // sul +
const pts = w => { const o = []; for (const id of w.nodes) { const n = nodes.get(id); if (n) o.push(r1(X(n.lon)), r1(Z(n.lat))); } return o; };
const closed = w => w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1];

const city = {
  origin,
  terrain: { x0: r1(X(H.w)), x1: r1(X(H.e)), z0: r1(Z(H.n)), z1: r1(Z(H.s)), nx: H.nx, ny: H.ny, data: H.data },
  buildings: [], roads: [], rivers: [], water: [], green: [], pois: [],
};

const num = s => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };

for (const w of ways) {
  const t = w.tags;
  if (t.building) {
    if (!closed(w)) continue;
    const p = pts(w); p.length -= 2; // remove ponto repetido
    if (p.length < 6) continue;
    const worship = t.amenity === 'place_of_worship' || /church|chapel|cathedral/.test(t.building);
    const civic = /public|civic|school|government|hospital|townhall/.test(t.building) || ['townhall', 'school', 'hospital', 'library', 'marketplace', 'theatre', 'community_centre'].includes(t.amenity);
    const b = { p, k: worship ? 'church' : civic ? 'civic' : 'house' };
    const h = num(t.height), lv = num(t['building:levels']);
    if (h) b.h = h; else if (lv) b.lv = lv;
    if (t.name) b.n = t.name;
    city.buildings.push(b);
  } else if (t.highway) {
    const r = { p: pts(w), t: t.highway };
    if (t.name) r.n = t.name;
    if (t.bridge && t.bridge !== 'no') r.b = 1;
    if (t.surface) r.s = t.surface;
    if (t.area === 'yes' && closed(w)) r.a = 1;
    city.roads.push(r);
  } else if (t.waterway) {
    if (['river', 'stream', 'canal', 'drain'].includes(t.waterway)) city.rivers.push({ p: pts(w), t: t.waterway, ...(t.name ? { n: t.name } : {}), ...(num(t.width) ? { w: num(t.width) } : {}) });
    else if (t.waterway === 'riverbank' && closed(w)) city.water.push(pts(w));
  } else if (t.natural === 'water') {
    if (closed(w)) city.water.push(pts(w));
  } else if (closed(w) && (t.natural === 'wood' || t.landuse || t.leisure)) {
    const kind = t.natural === 'wood' || t.landuse === 'forest' ? 'wood'
      : ['park', 'garden', 'playground'].includes(t.leisure) ? 'park'
      : ['pitch', 'sports_centre', 'stadium'].includes(t.leisure) ? 'pitch'
      : t.landuse === 'cemetery' ? 'cemetery'
      : ['grass', 'meadow', 'farmland', 'orchard', 'recreation_ground', 'village_green'].includes(t.landuse) ? 'grass'
      : t.landuse === 'residential' ? 'urban' : null;
    if (kind) city.green.push({ p: pts(w), t: kind, ...(t.name ? { n: t.name } : {}) });
  }
}

// Relações de água (multipolígonos do rio): usa os anéis externos
for (const rel of osm.elements.filter(e => e.type === 'relation' && e.tags && e.tags.natural === 'water')) {
  for (const m of rel.members || []) {
    if (m.type !== 'way' || m.role === 'inner') continue;
    const w = osm.elements.find(e => e.type === 'way' && e.id === m.ref);
    if (w && closed(w)) city.water.push(pts(w));
  }
}

// Pontos de interesse com nome
const seen = new Set();
const addPoi = (x, z, n, t) => { const k = n.toLowerCase(); if (seen.has(k)) return; seen.add(k); city.pois.push({ x: r1(x), z: r1(z), n, t }); };
for (const b of city.buildings) if (b.n && b.k !== 'house') {
  let cx = 0, cz = 0; for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i]; cz += b.p[i + 1]; }
  addPoi(cx / (b.p.length / 2), cz / (b.p.length / 2), b.n, b.k);
}
for (const g of city.green) if (g.n && g.t === 'park') {
  let cx = 0, cz = 0; for (let i = 0; i < g.p.length; i += 2) { cx += g.p[i]; cz += g.p[i + 1]; }
  addPoi(cx / (g.p.length / 2), cz / (g.p.length / 2), g.n, 'park');
}
for (const e of osm.elements) {
  if (e.type !== 'node' || !e.tags || !e.tags.name) continue;
  const t = e.tags;
  const kind = t.amenity === 'place_of_worship' ? 'church' : t.historic ? 'historic' : ['museum', 'attraction', 'viewpoint', 'artwork'].includes(t.tourism) ? 'tourism' : ['townhall', 'marketplace', 'theatre', 'library'].includes(t.amenity) ? 'civic' : null;
  if (kind) addPoi(X(e.lon), Z(e.lat), t.name, kind);
}

fs.writeFileSync('data/city.json', JSON.stringify(city));
console.log('origem', origin, praca ? '(praça encontrada)' : '(padrão)');
console.log({ buildings: city.buildings.length, roads: city.roads.length, rivers: city.rivers.length, water: city.water.length, green: city.green.length, pois: city.pois.length });
console.log('POIs:', city.pois.map(p => `${p.n} [${p.t}]`).join(' | '));
console.log('city.json', (fs.statSync('data/city.json').size / 1024).toFixed(0) + ' KB');
