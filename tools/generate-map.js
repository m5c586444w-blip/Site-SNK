#!/usr/bin/env node
// [EXTENSION] Génère la carte du monde (masque de provinces + fond + table) à partir d'une
// description vectorielle rédigée d'après l'image de référence (client/assets/map/reference_map.jpg)
// et LORE_BIBLE.md §2 / cahier des charges §4 :
//  - un grand continent : Marley (« African Marley » au centre, « European Marley » au sud),
//    l'Alliance du Moyen-Orient à l'est, reliée par la terre à Marley ;
//  - un continent occidental (étiquette de l'angle nord-ouest de la référence), traité comme
//    territoire colonial marleyen ;
//  - Hizuru au nord-est (île principale + îles Hizuzi) ;
//  - l'île du Paradis en mer, avec trois Murs concentriques (Maria, Rose, Sina), la capitale Mitras
//    au centre, et des zones « ancien territoire des Titans purs » au nord et au sud de l'île.
// Les provinces sont des cellules de Voronoï autour de germes nommés ; les noms de régions donnés
// par les documents sont repris, les autres sont des noms génériques [EXTENSION].
// Usage : node tools/generate-map.js   (écrit dans data/map/)
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'map');
const W = 1600;
const H = 1000;

// ------------------------------------------------------------------ masses terrestres
const LAND = {
  continent: [[250, 170], [330, 120], [470, 105], [600, 130], [700, 110], [800, 150], [860, 230], [900, 300],
    [1000, 330], [1110, 360], [1180, 430], [1200, 520], [1150, 600], [1060, 640], [960, 620], [880, 660],
    [820, 730], [800, 820], [760, 900], [660, 950], [540, 940], [460, 880], [430, 800], [380, 740],
    [300, 700], [250, 620], [210, 520], [205, 420], [220, 300]],
  west: [[20, 60], [110, 40], [170, 70], [190, 150], [170, 260], [140, 360], [100, 430], [50, 440], [15, 360], [10, 200]],
  hizuru_main: [[1290, 150], [1370, 130], [1440, 170], [1470, 250], [1450, 330], [1400, 400], [1330, 410], [1290, 360], [1275, 260]],
  hizuzi_1: [[1500, 380], [1540, 370], [1560, 410], [1530, 440], [1495, 425]],
  hizuzi_2: [[1480, 470], [1520, 465], [1535, 500], [1500, 520], [1470, 505]],
  paradis: [[990, 50], [1050, 25], [1120, 35], [1170, 80], [1185, 145], [1170, 220], [1130, 270], [1060, 290], [1000, 265], [960, 210], [950, 130]],
};
const PARADIS_CENTER = { x: 1068, y: 158 };
const RING = { sina: 34, rose: 62, maria: 92 };

// ------------------------------------------------------------------ germes des provinces
// [x, y, id, nom FR, nom EN, état, terrain]
const SEEDS = {
  west: [
    [80, 110, 'west_n', 'Côte occidentale nord', 'Western coast north', 'marley_west', 'forest'],
    [110, 230, 'west_c', 'Côte occidentale centre', 'Western coast centre', 'marley_west', 'plains'],
    [80, 360, 'west_s', 'Côte occidentale sud', 'Western coast south', 'marley_west', 'forest'],
  ],
  continent: [
    [330, 200, 'mar_nw', 'Nidereldia ouest', 'Nidereldia west', 'nidereldia', 'plains'],
    [460, 180, 'mar_n', 'Nidereldia est', 'Nidereldia east', 'nidereldia', 'plains'],
    [600, 200, 'mar_ne', 'Obereldia nord', 'Obereldia north', 'obereldia', 'forest'],
    [740, 220, 'mar_ne2', 'Obereldia est', 'Obereldia east', 'obereldia', 'mountain'],
    [320, 330, 'mar_w', 'Patria ouest', 'Patria west', 'patria', 'plains'],
    [450, 330, 'mar_cap', 'Patria (capitale)', 'Patria (capital)', 'patria', 'urban'],
    [560, 320, 'mar_lib', 'District d\'internement', 'Internment district', 'liberio', 'urban'],
    [680, 360, 'mar_c', 'Plateau central', 'Central plateau', 'plateau', 'mountain'],
    [300, 480, 'mar_sw', 'Côte du Couchant', 'Sunset coast', 'coast_west', 'plains'],
    [440, 480, 'mar_s1', 'Sudennland nord', 'Sudennland north', 'sudennland', 'plains'],
    [570, 470, 'mar_s2', 'Sudennland est', 'Sudennland east', 'sudennland', 'forest'],
    [320, 620, 'mar_d1', 'Désert méridional ouest', 'Southern desert west', 'desert_south', 'desert'],
    [470, 620, 'mar_d2', 'Désert méridional est', 'Southern desert east', 'desert_south', 'desert'],
    [560, 760, 'eur_1', 'Marley européenne nord', 'European Marley north', 'eur_marley', 'plains'],
    [680, 800, 'eur_2', 'Marley européenne est', 'European Marley east', 'eur_marley', 'forest'],
    [560, 880, 'eur_3', 'Marley européenne sud', 'European Marley south', 'eur_marley', 'mountain'],
    // Alliance du Moyen-Orient (noms : cahier des charges §4)
    [830, 320, 'me_nar1', 'Naranema nord', 'Naranema north', 'naranema', 'desert'],
    [860, 430, 'me_nar2', 'Naranema sud', 'Naranema south', 'naranema', 'desert'],
    [960, 400, 'me_men1', 'Menoriana', 'Menoriana', 'menoriana', 'urban'],
    [1080, 430, 'me_men2', 'Menoriana orientale', 'Eastern Menoriana', 'menoriana', 'desert'],
    [1110, 530, 'me_sen', 'Sentari', 'Sentari', 'sentari', 'mountain'],
    [990, 560, 'me_sen2', 'Sentari occidentale', 'Western Sentari', 'sentari', 'desert'],
    [860, 560, 'me_ran', 'Rannia', 'Rannia', 'rannia', 'plains'],
    [760, 620, 'me_ran2', 'Rannia méridionale', 'Southern Rannia', 'rannia', 'desert'],
  ],
  hizuru_main: [
    [1360, 200, 'hz_njetni', 'Njetni', 'Njetni', 'njetni', 'mountain'],
    [1330, 300, 'hz_capital', 'Njetni méridional', 'Southern Njetni', 'njetni', 'urban'],
    [1420, 300, 'hz_daqomo', 'Daqomo', 'Daqomo', 'daqomo', 'forest'],
    [1380, 380, 'hz_daqomo2', 'Daqomo côtier', 'Coastal Daqomo', 'daqomo', 'plains'],
  ],
  hizuzi_1: [[1528, 405, 'hz_isl1', 'Île Hizuzi nord', 'North Hizuzi isle', 'hizuzi', 'forest']],
  hizuzi_2: [[1503, 492, 'hz_isl2', 'Île Hizuzi sud', 'South Hizuzi isle', 'hizuzi', 'forest']],
};

const STATES = {
  // Marley : provinces internes nommées par LORE §2.2 / cahier §4 (Nidereldia, Obereldia, Patria,
  // Sudennland) ; les autres sont des noms génériques [EXTENSION].
  marley_west: { fr: 'Territoire colonial occidental', en: 'Western colonial territory', owner: 'marley', infra: 1, dep: { steel: 1, fuel: 1, rareMaterials: 1 }, civ: 1, mil: 0 },
  nidereldia: { fr: 'Nidereldia', en: 'Nidereldia', owner: 'marley', infra: 3, dep: { steel: 3, fuel: 1, rareMaterials: 0 }, civ: 3, mil: 2 },
  obereldia: { fr: 'Obereldia', en: 'Obereldia', owner: 'marley', infra: 3, dep: { steel: 4, fuel: 1, rareMaterials: 1 }, civ: 2, mil: 3 },
  patria: { fr: 'Patria', en: 'Patria', owner: 'marley', infra: 5, dep: { steel: 2, fuel: 2, rareMaterials: 1 }, civ: 6, mil: 5 },
  liberio: { fr: 'Zone d\'internement eldienne', en: 'Eldian internment zone', owner: 'marley', infra: 2, dep: { steel: 0, fuel: 0, rareMaterials: 0 }, civ: 1, mil: 0 },
  plateau: { fr: 'Plateau central', en: 'Central plateau', owner: 'marley', infra: 2, dep: { steel: 5, fuel: 0, rareMaterials: 2 }, civ: 1, mil: 1 },
  coast_west: { fr: 'Côte du Couchant', en: 'Sunset coast', owner: 'marley', infra: 3, dep: { steel: 1, fuel: 1, rareMaterials: 0 }, civ: 2, mil: 1 },
  sudennland: { fr: 'Sudennland', en: 'Sudennland', owner: 'marley', infra: 3, dep: { steel: 2, fuel: 2, rareMaterials: 1 }, civ: 3, mil: 2 },
  desert_south: { fr: 'Désert méridional', en: 'Southern desert', owner: 'marley', infra: 1, dep: { steel: 0, fuel: 4, rareMaterials: 1 }, civ: 1, mil: 0 },
  eur_marley: { fr: 'Marley européenne', en: 'European Marley', owner: 'marley', infra: 4, dep: { steel: 3, fuel: 1, rareMaterials: 1 }, civ: 4, mil: 3 },
  // Alliance du Moyen-Orient
  naranema: { fr: 'Naranema', en: 'Naranema', owner: 'mideast_alliance', infra: 2, dep: { steel: 1, fuel: 5, rareMaterials: 0 }, civ: 2, mil: 2 },
  menoriana: { fr: 'Menoriana', en: 'Menoriana', owner: 'mideast_alliance', infra: 3, dep: { steel: 2, fuel: 3, rareMaterials: 1 }, civ: 3, mil: 2 },
  sentari: { fr: 'Sentari', en: 'Sentari', owner: 'mideast_alliance', infra: 2, dep: { steel: 3, fuel: 2, rareMaterials: 1 }, civ: 1, mil: 2 },
  rannia: { fr: 'Rannia', en: 'Rannia', owner: 'mideast_alliance', infra: 2, dep: { steel: 1, fuel: 3, rareMaterials: 0 }, civ: 2, mil: 1 },
  // Hizuru (noms : cahier §4)
  njetni: { fr: 'Njetni', en: 'Njetni', owner: 'hizuru', infra: 3, dep: { steel: 1, fuel: 0, rareMaterials: 2 }, civ: 3, mil: 1 },
  daqomo: { fr: 'Daqomo', en: 'Daqomo', owner: 'hizuru', infra: 2, dep: { steel: 1, fuel: 1, rareMaterials: 2 }, civ: 2, mil: 1 },
  hizuzi: { fr: 'Îles Hizuzi', en: 'Hizuzi Islands', owner: 'hizuru', infra: 1, dep: { steel: 0, fuel: 0, rareMaterials: 2 }, civ: 1, mil: 0 },
  // Paradis : Murs Maria / Rose / Sina, capitale Mitras (cahier §4), zones de Titans purs au nord
  // et au sud de l'île. Économie préindustrielle (pas de flotte ni d'aviation, LORE §2.1).
  mitras: { fr: 'Mitras (Mur Sina)', en: 'Mitras (Wall Sina)', owner: 'paradis', infra: 3, dep: { steel: 1, fuel: 0, rareMaterials: 1 }, civ: 3, mil: 1, wall: 'inner' },
  rose_n: { fr: 'Mur Rose — nord', en: 'Wall Rose — north', owner: 'paradis', infra: 2, dep: { steel: 1, fuel: 0, rareMaterials: 0 }, civ: 1, mil: 1, wall: 'middle' },
  rose_s: { fr: 'Mur Rose — sud', en: 'Wall Rose — south', owner: 'paradis', infra: 2, dep: { steel: 1, fuel: 1, rareMaterials: 0 }, civ: 1, mil: 1, wall: 'middle' },
  maria_n: { fr: 'Mur Maria — nord', en: 'Wall Maria — north', owner: 'paradis', infra: 1, dep: { steel: 1, fuel: 1, rareMaterials: 0 }, civ: 1, mil: 0, wall: 'outer' },
  maria_s: { fr: 'Mur Maria — sud', en: 'Wall Maria — south', owner: 'paradis', infra: 1, dep: { steel: 1, fuel: 0, rareMaterials: 1 }, civ: 1, mil: 0, wall: 'outer' },
  titan_n: { fr: 'Terres nord (Titans purs)', en: 'Northern lands (Pure Titans)', owner: 'paradis', infra: 0, dep: { steel: 1, fuel: 0, rareMaterials: 1 }, civ: 0, mil: 0 },
  titan_s: { fr: 'Terres sud (Titans purs)', en: 'Southern lands (Pure Titans)', owner: 'paradis', infra: 0, dep: { steel: 0, fuel: 1, rareMaterials: 1 }, civ: 0, mil: 0 },
};

// Provinces de Paradis : anneaux autour du centre, secteurs par angle.
function paradisProvince(x, y) {
  const dx = x - PARADIS_CENTER.x;
  const dy = y - PARADIS_CENTER.y;
  const r = Math.hypot(dx, dy);
  const north = dy < 0;
  const east = dx >= 0;
  if (r <= RING.sina) return east ? 'pa_mitras_e' : 'pa_mitras';
  if (r <= RING.rose) return north ? (east ? 'pa_rose_ne' : 'pa_rose_nw') : (east ? 'pa_rose_se' : 'pa_rose_sw');
  if (r <= RING.maria) return north ? (east ? 'pa_maria_ne' : 'pa_maria_nw') : (east ? 'pa_maria_se' : 'pa_maria_sw');
  return north ? 'pa_titan_n' : 'pa_titan_s';
}
const PARADIS_PROVINCES = [
  ['pa_mitras', 'Mitras', 'Mitras', 'mitras', 'urban'],
  ['pa_mitras_e', 'Mitras — districts orientaux', 'Mitras — eastern districts', 'mitras', 'urban'],
  ['pa_rose_nw', 'Mur Rose — secteur nord-ouest', 'Wall Rose — north-west sector', 'rose_n', 'plains'],
  ['pa_rose_ne', 'Mur Rose — secteur nord-est', 'Wall Rose — north-east sector', 'rose_n', 'plains'],
  ['pa_rose_sw', 'Mur Rose — secteur sud-ouest', 'Wall Rose — south-west sector', 'rose_s', 'plains'],
  ['pa_rose_se', 'Mur Rose — secteur sud-est', 'Wall Rose — south-east sector', 'rose_s', 'plains'],
  ['pa_maria_nw', 'Mur Maria — secteur nord-ouest', 'Wall Maria — north-west sector', 'maria_n', 'plains'],
  ['pa_maria_ne', 'Mur Maria — secteur nord-est', 'Wall Maria — north-east sector', 'maria_n', 'forest'],
  ['pa_maria_sw', 'Mur Maria — secteur sud-ouest', 'Wall Maria — south-west sector', 'maria_s', 'plains'],
  ['pa_maria_se', 'Mur Maria — secteur sud-est', 'Wall Maria — south-east sector', 'maria_s', 'plains'],
  ['pa_titan_n', 'Terres du nord', 'Northern lands', 'titan_n', 'forest'],
  ['pa_titan_s', 'Terres du sud', 'Southern lands', 'titan_s', 'plains'],
];

// ------------------------------------------------------------------ géométrie
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Bruit déterministe pour des frontières moins rectilignes.
const jitter = (x, y) => Math.sin(x * 0.043 + y * 0.021) * 9 + Math.cos(x * 0.017 - y * 0.051) * 7;

// ------------------------------------------------------------------ provinces et couleurs
const provinces = [];
const seedList = [];
for (const [land, seeds] of Object.entries(SEEDS)) {
  for (const [x, y, id, fr, en, stateId, terrain] of seeds) {
    provinces.push({ id, name: { fr, en }, stateId, landmass: land === 'west' ? 'western_continent' : land.startsWith('hiz') ? 'hizuru_islands' : 'mainland', terrain });
    seedList.push({ land, x, y, id });
  }
}
for (const [id, fr, en, stateId, terrain] of PARADIS_PROVINCES) {
  provinces.push({ id, name: { fr, en }, stateId, landmass: 'paradis_island', terrain, formerPureTitanTerritory: stateId.startsWith('titan') });
}
// Couleur unique par province (pas de noir : réservé à la mer).
provinces.forEach((p, i) => {
  const r = 40 + ((i * 53) % 200);
  const g = 30 + ((i * 97) % 210);
  const b = 20 + ((i * 151) % 220);
  p.color = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
});
const colorOf = new Map(provinces.map((p) => [p.id, p.color.slice(1).match(/../g).map((h) => parseInt(h, 16))]));

// ------------------------------------------------------------------ rastérisation
const mask = new PNG({ width: W, height: H });
const bg = new PNG({ width: W, height: H });
const provAt = new Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let id = null;
    // Côtes irrégulières : léger bruit sur le test d'appartenance (Paradis garde des Murs circulaires).
    const cx = x + Math.sin(y * 0.09) * 4 + Math.sin(y * 0.031 + x * 0.013) * 6;
    const cy = y + Math.cos(x * 0.08) * 4 + Math.cos(x * 0.027 - y * 0.011) * 6;
    for (const [land, poly] of Object.entries(LAND)) {
      if (!inPoly(cx, cy, poly)) continue;
      if (land === 'paradis') { id = paradisProvince(x, y); break; }
      let best = Infinity;
      const jx = x + jitter(x, y);
      const jy = y + jitter(y, x);
      for (const s of seedList) {
        if (s.land !== land) continue;
        const d = (s.x - jx) ** 2 + (s.y - jy) ** 2;
        if (d < best) { best = d; id = s.id; }
      }
      break;
    }
    provAt[i] = id;
    const o = i * 4;
    const c = id ? colorOf.get(id) : [0, 0, 0];
    mask.data[o] = c[0]; mask.data[o + 1] = c[1]; mask.data[o + 2] = c[2]; mask.data[o + 3] = 255;
  }
}

// Fond « carte d'état-major » (cahier §9) : papier vieilli, mer lavis, côtes à l'encre, graticule.
const noise = (x, y) => (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const o = i * 4;
    const land = provAt[i] != null;
    const n = Math.abs(noise(x, y)) * 14 - 7 + Math.sin(x / 90) * 4 + Math.cos(y / 70) * 4;
    let c = land ? [226 + n, 212 + n, 176 + n] : [178 + n, 190 + n, 184 + n];
    const coast = land && [i - 1, i + 1, i - W, i + W].some((k) => k >= 0 && k < W * H && provAt[k] == null);
    if (coast) c = [92, 74, 52];
    else if (!land && (x % 100 === 0 || y % 100 === 0)) c = c.map((v) => v - 18);
    // Murs : cercles sombres (tracé décoratif du fond ; le jeu dessine aussi les états de Mur)
    const r = Math.hypot(x - PARADIS_CENTER.x, y - PARADIS_CENTER.y);
    if (land && [RING.sina, RING.rose, RING.maria].some((R) => Math.abs(r - R) < 1.6)) c = [70, 60, 48];
    bg.data[o] = Math.max(0, Math.min(255, c[0])); bg.data[o + 1] = Math.max(0, Math.min(255, c[1]));
    bg.data[o + 2] = Math.max(0, Math.min(255, c[2])); bg.data[o + 3] = 255;
  }
}

// ------------------------------------------------------------------ états
const states = Object.entries(STATES).map(([id, s]) => {
  const provinceIds = provinces.filter((p) => p.stateId === id).map((p) => p.id);
  const factories = [];
  for (let k = 0; k < s.civ; k++) factories.push({ id: `f_${id}_c${k + 1}`, type: 'civilian' });
  for (let k = 0; k < s.mil; k++) factories.push({ id: `f_${id}_m${k + 1}`, type: 'military' });
  return {
    id, name: { fr: s.fr, en: s.en }, ownerId: s.owner, provinceIds,
    isWallState: Boolean(s.wall), wallRing: s.wall ?? null,
    infrastructureLevel: s.infra, resourceDeposits: s.dep, factories,
  };
});

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'provinces_mask.png'), PNG.sync.write(mask));
writeFileSync(path.join(OUT, 'background.png'), PNG.sync.write(bg));
writeFileSync(path.join(OUT, 'provinces.json'), `${JSON.stringify({
  _source: '[EXTENSION] Carte générée par tools/generate-map.js d\'après la carte de référence et LORE §2 / cahier §4. Noms de régions des documents repris ; autres noms, découpage, gisements, infrastructures et usines : [EXTENSION] à valider.',
  maskFile: 'provinces_mask.png',
  backgroundFile: 'background.png',
  ignoredColors: ['#000000'],
  homeLandmass: { paradis: 'paradis_island' },
  provinces,
  states,
}, null, 2)}\n`);
console.log(`Carte générée : ${W}×${H}, ${provinces.length} provinces, ${states.length} états.`);
