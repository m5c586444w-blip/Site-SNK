#!/usr/bin/env node
// Construit la carte du jeu (masque de provinces + fond + table) à partir de la carte de référence
// fournie par le commanditaire : data/map/source/world_reference.png
// (« Map of the World Known by Residents of Paradis Island », 2000 × 1119).
//
// Étapes :
//  1. chaque pixel est classé par la couleur de la nation qui l'occupe sur la référence
//     (Marley mauve, Alliance ocre, Hizuru vert pâle, Paradis orange), en terre blanche
//     « Uncharted by Eldia » ou en mer ;
//  2. les traits sombres (frontières intérieures, écritures) sont rendus à la terre qui les entoure ;
//  3. les régions déjà délimitées par les frontières tracées sur la référence sont regroupées en
//     provinces autour de germes nommés (les noms lisibles sur la référence sont repris) ;
//  4. l'île du Paradis est découpée en anneaux (Murs Maria, Rose, Sina) autour de Mitras ;
//  5. le fond est redessiné dans le style « carte d'état-major » du jeu (cahier §9) : la référence
//     n'est pas reproduite telle quelle.
// Les terres blanches restent des terres neutres, sans province, non jouables (LORE §2.5).
// Usage : node tools/extract-map.js [--debug dossier]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { LAND_SEEDS, STATES, PARADIS, TEXT_ERASE, MANUAL_SEA_LANES } from './map-layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'map', 'source', 'world_reference.png');
const OUT = path.join(ROOT, 'data', 'map');
const debugIdx = process.argv.indexOf('--debug');
const DEBUG = debugIdx > 0 ? process.argv[debugIdx + 1] : null;

const src = PNG.sync.read(readFileSync(SRC));
const W = src.width;
const H = src.height;
const N = W * H;

// ------------------------------------------------------------------ 1. classification
const SEA = 0;
const WHITE = 1;
const NATION_CLASSES = { marley: 2, mideast_alliance: 3, hizuru: 4, paradis: 5 };
const UNKNOWN = 255;
const REF = [
  [NATION_CLASSES.marley, [160, 94, 107]],
  [NATION_CLASSES.mideast_alliance, [171, 143, 104]],
  [NATION_CLASSES.hizuru, [199, 199, 158]],
  [NATION_CLASSES.paradis, [189, 91, 67]],
];
const cls = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const r = src.data[i * 4]; const g = src.data[i * 4 + 1]; const b = src.data[i * 4 + 2];
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let best = UNKNOWN; let bestD = 34 ** 2;
  for (const [c, [R, G, B]] of REF) {
    const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best === UNKNOWN && min >= 222) best = WHITE;
  else if (best === UNKNOWN && max - min < 24) best = SEA;
  cls[i] = best;
}
for (const [x0, y0, x1, y1] of TEXT_ERASE) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (cls[y * W + x] !== NATION_CLASSES.paradis) cls[y * W + x] = SEA;
}

// Composantes connexes (4-voisinage) d'une classe.
function components(pred) {
  const label = new Int32Array(N).fill(-1);
  const comps = [];
  const stack = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (label[s] !== -1 || !pred(s)) continue;
    const id = comps.length;
    const pixels = [];
    let sp = 0; stack[sp++] = s; label[s] = id;
    while (sp) {
      const p = stack[--sp];
      pixels.push(p);
      const x = p % W;
      for (const q of [p - W, p + W, x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1]) {
        if (q < 0 || q >= N || label[q] !== -1 || !pred(q)) continue;
        label[q] = id; stack[sp++] = q;
      }
    }
    comps.push(pixels);
  }
  return { label, comps };
}

// Petites taches (lettres claires sur la terre, titres sur la mer, îlots de bruit) : « inconnu ».
for (const c of [WHITE, ...Object.values(NATION_CLASSES)]) {
  const minArea = c === WHITE ? 6000 : 25;
  for (const px of components((i) => cls[i] === c).comps) if (px.length < minArea) for (const p of px) cls[p] = UNKNOWN;
}
// Taches de couleur de nation qui ne sont pas des terres : écritures orange des capitales
// (Paradis ne garde que l'île, sa plus grande tache), lettres claires enclavées dans une autre nation.
for (const c of Object.values(NATION_CLASSES)) {
  const { label, comps } = components((i) => cls[i] === c);
  let biggest = 0;
  comps.forEach((px, id) => { if (px.length > comps[biggest].length) biggest = id; });
  comps.forEach((px, id) => {
    // Écritures orange des capitales : posées sur la mer (ou, refermées, rendues à la terre plus bas).
    if (c === NATION_CLASSES.paradis) { if (id !== biggest) for (const p of px) cls[p] = SEA; return; }
    if (px.length >= 3000) return;
    let xs = Infinity; let xe = -1; let ys = Infinity; let ye = -1;
    for (const p of px) { const x = p % W; const y = (p / W) | 0; xs = Math.min(xs, x); xe = Math.max(xe, x); ys = Math.min(ys, y); ye = Math.max(ye, y); }
    if (Math.min(xe - xs, ye - ys) < 4) { for (const p of px) cls[p] = UNKNOWN; return; }
    // Voisinage à 3 px : une tache entourée d'une autre nation, sans mer ni terre blanche, est une lettre.
    const around = new Set();
    for (const p of px) {
      const x = p % W;
      for (const q of [p - 3 * W, p + 3 * W, x > 2 ? p - 3 : -1, x < W - 3 ? p + 3 : -1]) {
        if (q >= 0 && q < N && label[q] !== id) around.add(cls[q]);
      }
    }
    if (!around.has(SEA) && !around.has(WHITE) && [...around].some((k) => k >= 2 && k !== UNKNOWN && k !== c)) for (const p of px) cls[p] = UNKNOWN;
  });
}
// Mer : seules les grandes étendues sont de la mer ; le reste (lettres grises, traits) est inconnu.
// Les étendues fermées (lacs, rose des vents, écritures) qui ne touchent pas le bord de l'image ne
// sont pas de la mer ; elles prennent la terre qui les entoure.
for (const px of components((i) => cls[i] === SEA).comps) {
  const edge = px.some((p) => { const x = p % W; const y = (p / W) | 0; return x === 0 || y === 0 || x === W - 1 || y === H - 1; });
  if (px.length < 1500 || (!edge && px.length < 30000)) for (const p of px) cls[p] = UNKNOWN;
}

// 2. Les pixels inconnus prennent la classe la plus proche (propagation simultanée).
function fillUnknown(arr, unknown) {
  let frontier = [];
  for (let i = 0; i < N; i++) if (arr[i] !== unknown) frontier.push(i);
  while (frontier.length) {
    const next = [];
    for (const p of frontier) {
      const x = p % W;
      for (const q of [p - W, p + W, x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1]) {
        if (q < 0 || q >= N || arr[q] !== unknown) continue;
        arr[q] = arr[p]; next.push(q);
      }
    }
    frontier = next;
  }
}
const strict = Uint8Array.from(cls); // avant comblement : les frontières tracées y sont des trous
fillUnknown(cls, UNKNOWN);
// Restes d'écritures sur la mer : petites terres faites surtout de pixels comblés, pas de vraie couleur.
for (const c of Object.values(NATION_CLASSES)) {
  for (const px of components((i) => cls[i] === c).comps) {
    if (px.length >= 5000) continue;
    const own = px.filter((p) => strict[p] === c).length;
    if (own < 0.5 * px.length) for (const p of px) cls[p] = UNKNOWN;
  }
}
fillUnknown(cls, UNKNOWN);

if (DEBUG) {
  mkdirSync(DEBUG, { recursive: true });
  const pal = { [SEA]: [60, 80, 110], [WHITE]: [255, 255, 255], 2: [160, 94, 107], 3: [171, 143, 104], 4: [199, 199, 158], 5: [220, 60, 30] };
  const out = new PNG({ width: W, height: H });
  for (let i = 0; i < N; i++) { const c = pal[cls[i]] ?? [255, 0, 255]; out.data.set([...c, 255], i * 4); }
  writeFileSync(path.join(DEBUG, 'classes.png'), PNG.sync.write(out));
}

// ------------------------------------------------------------------ 3. provinces
// Trait tracé = pixel nettement plus sombre que son voisinage (moyenne sur 9 × 9 px).
const lum = new Float32Array(N);
for (let i = 0; i < N; i++) lum[i] = 0.3 * src.data[i * 4] + 0.59 * src.data[i * 4 + 1] + 0.11 * src.data[i * 4 + 2];
const R = 4;
const integral = new Float64Array((W + 1) * (H + 1));
for (let y = 0; y < H; y++) {
  let row = 0;
  for (let x = 0; x < W; x++) { row += lum[y * W + x]; integral[(y + 1) * (W + 1) + x + 1] = integral[y * (W + 1) + x + 1] + row; }
}
const localMean = (x, y) => {
  const x0 = Math.max(0, x - R); const x1 = Math.min(W, x + R + 1); const y0 = Math.max(0, y - R); const y1 = Math.min(H, y + R + 1);
  return (integral[y1 * (W + 1) + x1] - integral[y0 * (W + 1) + x1] - integral[y1 * (W + 1) + x0] + integral[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
};
const isLine = new Uint8Array(N);
for (let i = 0; i < N; i++) if (cls[i] >= 2 && lum[i] < localMean(i % W, (i / W) | 0) - 8) isLine[i] = 1;

const ownerClass = (stateId) => NATION_CLASSES[STATES[stateId].owner];
const provinces = []; // { id, name, stateId, terrain, ... }
const provIndex = new Map();
const addProvince = (p) => { provIndex.set(p.id, provinces.length); provinces.push(p); };
const PROV_NONE = 0xffff;
const provAt = new Uint16Array(N).fill(PROV_NONE);

// 3a. Paradis : anneaux autour de Mitras, secteurs par quadrant.
const [pcx, pcy] = PARADIS.center;
const { sina, rose, maria } = PARADIS.rings;
for (const [id, fr, en, stateId, terrain] of PARADIS.provinces) {
  addProvince({ id, name: { fr, en }, stateId, terrain, formerPureTitanTerritory: stateId.startsWith('titan') });
}
for (let i = 0; i < N; i++) {
  if (cls[i] !== NATION_CLASSES.paradis) continue;
  const dx = (i % W) - pcx; const dy = ((i / W) | 0) - pcy;
  const r = Math.hypot(dx, dy);
  const ns = dy < 0 ? 'n' : 's'; const ew = dx >= 0 ? 'e' : 'w';
  const id = r <= sina ? (dx >= 0 ? 'pa_mitras_e' : 'pa_mitras')
    : r <= rose ? `pa_rose_${ns}${ew}` : r <= maria ? `pa_maria_${ns}${ew}` : `pa_titan_${ns}`;
  provAt[i] = provIndex.get(id);
}

// 3b. Autres nations : chaque province s'étend depuis son germe sur la terre de sa nation (plus court
// chemin) ; franchir un trait tracé coûte cher, si bien que les limites suivent les frontières de la
// référence là où elles existent.
const LINE_COST = 14;
const dist = new Float64Array(N).fill(Infinity);
const buckets = [];
const push = (p, d) => { (buckets[d] ??= []).push(p); };
const seedErrors = [];
for (const [x, y, id, fr, en, stateId, terrain] of LAND_SEEDS) {
  if (!STATES[stateId]) throw new Error(`${id} : état inconnu ${stateId}`);
  const i = y * W + x;
  if (cls[i] !== ownerClass(stateId)) { seedErrors.push(`${id} : le germe (${x}, ${y}) n'est pas sur la terre de ${STATES[stateId].owner}`); continue; }
  addProvince({ id, name: { fr, en }, stateId, terrain });
  if (provAt[i] !== PROV_NONE) throw new Error(`${id} : germe partagé`);
  provAt[i] = provIndex.get(id); dist[i] = 0; push(i, 0);
}
if (seedErrors.length) throw new Error(seedErrors.join('\n'));
for (let d = 0; d < buckets.length; d++) {
  for (const p of buckets[d] ?? []) {
    if (dist[p] !== d) continue;
    const x = p % W;
    for (const q of [p - W, p + W, x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1]) {
      if (q < 0 || q >= N || cls[q] !== cls[p]) continue;
      const nd = d + (isLine[q] ? LINE_COST : 1);
      if (nd < dist[q]) { dist[q] = nd; provAt[q] = provAt[p]; push(q, nd); }
    }
  }
  buckets[d] = null;
}
// Îles sans germe : rattachées au germe le plus proche de la même nation.
for (const px of components((i) => cls[i] >= 2 && provAt[i] === PROV_NONE).comps) {
  const c = cls[px[0]];
  const [sx, sy] = [px.reduce((a, p) => a + (p % W), 0) / px.length, px.reduce((a, p) => a + ((p / W) | 0), 0) / px.length];
  let best = null; let bestD = Infinity;
  for (const [x, y, id, , , stateId] of LAND_SEEDS) {
    if (ownerClass(stateId) !== c) continue;
    const d = (x - sx) ** 2 + (y - sy) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  for (const p of px) provAt[p] = provIndex.get(best);
}

// Masses terrestres (brouillard, MECHANICS §10) : terres reliées entre elles, toutes nations confondues.
const landmassOf = new Map();
{
  const { comps } = components((i) => provAt[i] !== PROV_NONE);
  const named = { mar_cap: 'mainland', pa_mitras: 'paradis_island', west_n: 'niderrosa_coast', west_s: 'wenderosina_coast', lud_1: 'ludennemaria' };
  let k = 0;
  for (const px of comps.sort((a, b) => b.length - a.length)) {
    const ids = new Set(px.map((p) => provinces[provAt[p]].id));
    const name = Object.entries(named).find(([pid]) => ids.has(pid))?.[1] ?? `isles_${++k}`;
    for (const id of ids) if (!landmassOf.has(id)) landmassOf.set(id, name);
  }
}
for (const p of provinces) p.landmass = landmassOf.get(p.id);
const empty = provinces.filter((p) => !p.landmass);
if (empty.length) throw new Error(`provinces sans terre : ${empty.map((p) => p.id).join(', ')}`);

// ------------------------------------------------------------------ 4. masque
// Couleur unique par province (le noir est la mer, le blanc les terres inexplorées).
provinces.forEach((p, i) => {
  const r = 40 + ((i * 53) % 200);
  const g = 30 + ((i * 97) % 210);
  const b = 20 + ((i * 151) % 220);
  p.color = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
});
const rgbOf = provinces.map((p) => p.color.slice(1).match(/../g).map((h) => parseInt(h, 16)));
const mask = new PNG({ width: W, height: H });
for (let i = 0; i < N; i++) {
  const c = provAt[i] !== PROV_NONE ? rgbOf[provAt[i]] : cls[i] === WHITE ? [255, 255, 255] : [0, 0, 0];
  mask.data[i * 4] = c[0]; mask.data[i * 4 + 1] = c[1]; mask.data[i * 4 + 2] = c[2]; mask.data[i * 4 + 3] = 255;
}

// ------------------------------------------------------------------ 5. fond
// Style « carte d'état-major » (cahier §9) : papier vieilli, mer au lavis, côtes à l'encre, graticule.
// Les terres inexplorées sont un papier plus pâle et sans détail (LORE §2.5).
const bg = new PNG({ width: W, height: H });
const noise = (x, y) => (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
const landAt = (i) => cls[i] !== SEA;
for (let i = 0; i < N; i++) {
  const x = i % W; const y = (i / W) | 0;
  // grain du papier sur 4 niveaux par blocs de 2 px (fichier plus léger qu'un bruit par pixel)
  const n = Math.round(Math.abs(noise(x >> 1, y >> 1)) * 3) * 4 - 6 + Math.round(Math.sin(x / 110) * 2 + Math.cos(y / 85) * 2) * 2;
  let c;
  if (cls[i] === WHITE) c = [238 + n / 2, 232 + n / 2, 214 + n / 2];
  else if (landAt(i)) c = [226 + n, 212 + n, 176 + n];
  else c = [178 + n, 190 + n, 184 + n];
  const coast = landAt(i) && [i - 1, i + 1, i - W, i + W].some((k) => k >= 0 && k < N && !landAt(k));
  if (coast) c = [92, 74, 52];
  else if (!landAt(i)) {
    if (x % 125 === 0 || y % 125 === 0) c = c.map((v) => v - 16);
    // Liseré de côte au lavis
    let near = false;
    for (const k of [i - 3, i + 3, i - 3 * W, i + 3 * W]) if (k >= 0 && k < N && landAt(k)) near = true;
    if (near) c = c.map((v) => v - 10);
  }
  // Murs : cercles sombres (le jeu dessine aussi les états de Mur)
  const r = Math.hypot(x - pcx, y - pcy);
  if (cls[i] === NATION_CLASSES.paradis && [sina, rose, maria].some((Rr) => Math.abs(r - Rr) < 0.9)) c = [70, 60, 48];
  bg.data[i * 4] = Math.max(0, Math.min(255, c[0])); bg.data[i * 4 + 1] = Math.max(0, Math.min(255, c[1]));
  bg.data[i * 4 + 2] = Math.max(0, Math.min(255, c[2])); bg.data[i * 4 + 3] = 255;
}

// ------------------------------------------------------------------ 6. états
const states = Object.entries(STATES).map(([id, s]) => {
  const provinceIds = provinces.filter((p) => p.stateId === id).map((p) => p.id);
  if (!provinceIds.length) throw new Error(`état sans province : ${id}`);
  const factories = [];
  for (let k = 0; k < s.civ; k++) factories.push({ id: `f_${id}_c${k + 1}`, type: 'civilian' });
  for (let k = 0; k < s.mil; k++) factories.push({ id: `f_${id}_m${k + 1}`, type: 'military' });
  return {
    id, name: { fr: s.fr, en: s.en }, ownerId: s.owner, provinceIds,
    isWallState: Boolean(s.wall), wallRing: s.wall ?? null,
    infrastructureLevel: s.infra, resourceDeposits: s.dep, factories,
  };
});
// Ordre des provinces : celui des états (la capitale d'une nation est la 1re province de son 1er état).
const order = new Map(states.flatMap((s) => s.provinceIds).map((id, k) => [id, k]));
const sortedProvinces = [...provinces].sort((a, b) => order.get(a.id) - order.get(b.id));

// ------------------------------------------------------------------ 7. routes maritimes [EXTENSION]
// Liaisons de débarquement entre provinces côtières de masses terrestres différentes : pour chaque
// paire (masse terrestre, nation) × (masse terrestre, nation), les 2 couples de provinces côtières
// les plus proches (côtes à moins de 450 px) ; entre deux terres d'une même nation, un seul couple,
// à moins de 250 px (il ne sert qu'à reprendre une île occupée).
const coastal = new Map();
for (let i = 0; i < N; i++) {
  if (provAt[i] === PROV_NONE) continue;
  const x = i % W;
  if ([i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1].some((k) => k >= 0 && k < N && cls[k] === SEA)) {
    const id = provAt[i];
    const c = coastal.get(id) ?? { pts: [] };
    if (c.pts.length < 4000) c.pts.push([x, (i / W) | 0]);
    coastal.set(id, c);
  }
}
const coastList = [...coastal].map(([idx, c]) => ({ id: provinces[idx].id, land: provinces[idx].landmass, owner: STATES[provinces[idx].stateId].owner, pts: c.pts.filter((_, k) => k % 6 === 0) }));
const minDist = (a, b) => {
  let m = Infinity;
  for (const [x1, y1] of a.pts) for (const [x2, y2] of b.pts) m = Math.min(m, (x1 - x2) ** 2 + (y1 - y2) ** 2);
  return Math.sqrt(m);
};
const byPair = new Map();
for (let i = 0; i < coastList.length; i++) {
  for (let j = i + 1; j < coastList.length; j++) {
    const a = coastList[i]; const b = coastList[j];
    if (a.land === b.land) continue;
    const d = minDist(a, b);
    if (d > (a.owner === b.owner ? 250 : 450)) continue;
    const key = [`${a.land}:${a.owner}`, `${b.land}:${b.owner}`].sort().join('|');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push({ a: a.id, b: b.id, d });
  }
}
const seaLanes = [];
for (const [key, list] of byPair) {
  const [ka, kb] = key.split('|').map((k) => k.split(':')[1]);
  for (const l of list.sort((x, y) => x.d - y.d).slice(0, ka === kb ? 1 : 2)) seaLanes.push([l.a, l.b].sort());
}
for (const lane of MANUAL_SEA_LANES) {
  const k = [...lane].sort();
  if (!seaLanes.some((l) => l[0] === k[0] && l[1] === k[1])) seaLanes.push(k);
}

// ------------------------------------------------------------------ écriture
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'provinces_mask.png'), PNG.sync.write(mask));
writeFileSync(path.join(OUT, 'background.png'), PNG.sync.write(bg));
writeFileSync(path.join(OUT, 'provinces.json'), `${JSON.stringify({
  _source: 'Carte construite par tools/extract-map.js à partir de la carte de référence fournie (data/map/source/world_reference.png) : contours des nations et frontières intérieures repris de la référence, noms de régions lus sur la référence. Découpage en provinces, subdivisions, gisements, infrastructures et usines : [EXTENSION] (tools/map-layout.js). Terres blanches « Uncharted by Eldia » : terres neutres sans province (LORE §2.5).',
  maskFile: 'provinces_mask.png',
  backgroundFile: 'background.png',
  ignoredColors: ['#000000', '#ffffff'],
  homeLandmass: { paradis: 'paradis_island' },
  // Tracé des Murs (cercles autour de Mitras), dessiné en vectoriel par le client.
  wallRings: { center: PARADIS.center, rings: [{ ring: 'inner', radius: sina }, { ring: 'middle', radius: rose }, { ring: 'outer', radius: maria }] },
  seaLanes,
  provinces: sortedProvinces,
  states,
}, null, 2)}\n`);

if (DEBUG) {
  const out = new PNG({ width: W, height: H });
  for (let i = 0; i < N; i++) {
    const c = provAt[i] !== PROV_NONE ? rgbOf[provAt[i]] : cls[i] === WHITE ? [255, 255, 255] : [40, 50, 70];
    const line = isLine[i] && provAt[i] !== PROV_NONE ? 0.6 : 1;
    out.data.set([c[0] * line, c[1] * line, c[2] * line, 255], i * 4);
  }
  // germes
  for (const [x, y] of LAND_SEEDS) for (let k = -2; k <= 2; k++) { out.data.set([0, 0, 0, 255], ((y + k) * W + x) * 4); out.data.set([0, 0, 0, 255], (y * W + x + k) * 4); }
  writeFileSync(path.join(DEBUG, 'provinces.png'), PNG.sync.write(out));
}
console.log(`Carte construite : ${W}×${H}, ${provinces.length} provinces, ${states.length} états, ${seaLanes.length} routes maritimes.`);
