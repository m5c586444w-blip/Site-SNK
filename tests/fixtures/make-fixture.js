// Génère la carte de TEST abstraite (grille), utilisée uniquement par les tests et le développement.
// Ce n'est PAS du contenu de jeu : aucune géographie, aucun nom de lieu réel du monde du jeu.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'map');
const W = 240, H = 160;
const SEA = [0, 0, 0];
const rects = [
  // [id, color, x0, y0, x1, y1]
  ['test_a1', '#ff0000', 20, 30, 60, 70],
  ['test_a2', '#00ff00', 60, 30, 100, 70],
  ['test_a3', '#0000ff', 20, 70, 100, 110],
  ['test_b1', '#ffff00', 140, 20, 200, 80],
  ['test_b2', '#ff00ff', 140, 80, 200, 140],
  ['test_b3', '#00ffff', 100, 30, 140, 70], // bande reliant l'île A au continent B (voisinage de test)
];
const png = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const r = rects.find(([, , x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
  const c = r ? [1, 3, 5].map((i) => parseInt(r[1].slice(i, i + 2), 16)) : SEA;
  const o = (y * W + x) * 4;
  png.data[o] = c[0]; png.data[o + 1] = c[1]; png.data[o + 2] = c[2]; png.data[o + 3] = 255;
}
writeFileSync(path.join(dir, 'provinces_mask.png'), PNG.sync.write(png));

const def = {
  _note: 'CARTE DE TEST ABSTRAITE — pas du contenu de jeu',
  maskFile: 'provinces_mask.png',
  ignoredColors: ['#000000'],
  homeLandmass: { paradis: 'test_island_a' },
  provinces: [
    { id: 'test_a1', name: 'Test A1', color: '#ff0000', stateId: 'test_state_a1', landmass: 'test_island_a' },
    { id: 'test_a2', name: 'Test A2', color: '#00ff00', stateId: 'test_state_a2', landmass: 'test_island_a' },
    { id: 'test_a3', name: 'Test A3', color: '#0000ff', stateId: 'test_state_a3', landmass: 'test_island_a', formerPureTitanTerritory: true },
    { id: 'test_b1', name: 'Test B1', color: '#ffff00', stateId: 'test_state_b', landmass: 'test_continent_b' },
    { id: 'test_b2', name: 'Test B2', color: '#ff00ff', stateId: 'test_state_b', landmass: 'test_continent_b' },
    { id: 'test_b3', name: 'Test B3', color: '#00ffff', stateId: 'test_state_b3', landmass: 'test_continent_b' },
  ],
  states: [
    {
      id: 'test_state_a1', name: 'Test State A1', ownerId: 'paradis', provinceIds: ['test_a1'], isWallState: true,
      infrastructureLevel: 2, resourceDeposits: { steel: 1, fuel: 0, rareMaterials: 0 },
      factories: [{ id: 'tf_a1_c1', type: 'civilian' }, { id: 'tf_a1_c2', type: 'civilian' }, { id: 'tf_a1_m1', type: 'military' }, { id: 'tf_a1_m2', type: 'military' }],
    },
    { id: 'test_state_a2', name: 'Test State A2', ownerId: 'paradis', provinceIds: ['test_a2'], infrastructureLevel: 0, resourceDeposits: { steel: 0, fuel: 2, rareMaterials: 1 }, factories: [{ id: 'tf_a2_c1', type: 'civilian' }] },
    { id: 'test_state_a3', name: 'Test State A3', ownerId: 'paradis', provinceIds: ['test_a3'] },
    {
      id: 'test_state_b', name: 'Test State B', ownerId: 'marley', provinceIds: ['test_b1', 'test_b2'], infrastructureLevel: 4,
      resourceDeposits: { steel: 3, fuel: 3, rareMaterials: 0 },
      factories: [{ id: 'tf_b_c1', type: 'civilian' }, { id: 'tf_b_m1', type: 'military' }, { id: 'tf_b_m2', type: 'military' }],
    },
    { id: 'test_state_b3', name: 'Test State B3', ownerId: 'marley', provinceIds: ['test_b3'], infrastructureLevel: 1 },
  ],
};
writeFileSync(path.join(dir, 'provinces.json'), JSON.stringify(def, null, 2) + '\n');

// Données de test « overlay » (SNK_DATA_OVERLAY) : technologies et règles économiques ABSTRAITES.
const overlay = path.join(path.dirname(fileURLToPath(import.meta.url)), 'overlay');
mkdirSync(overlay, { recursive: true });
const tech = (id, category, baseCostDays, prerequisiteTechIds = []) => ({
  id, name: { fr: id.replace(/_/g, ' '), en: id.replace(/_/g, ' ') }, category, baseCostDays, prerequisiteTechIds,
});
writeFileSync(path.join(overlay, 'technologies.json'), JSON.stringify({
  _note: 'TECHNOLOGIES DE TEST ABSTRAITES — pas du contenu de jeu',
  technologies: [
    tech('test_infantry_1', 'infantry', 10),
    tech('test_infantry_2', 'infantry', 20, ['test_infantry_1']),
    tech('test_industry_1', 'industry', 5),
    tech('test_doctrine_1', 'doctrine', 30, ['test_industry_1']),
    tech('test_navy_1', 'navy', 10),
  ],
}, null, 2) + '\n');
writeFileSync(path.join(overlay, 'economy_rules.json'), JSON.stringify({
  _note: 'RÈGLES DE TEST — valeurs arbitraires pour exercer le moteur, pas des valeurs de jeu',
  factoryBuildCost: { civilian: 20, military: 15 },
  factoryConversionCost: 10,
  startingStockpiles: { byNation: { paradis: { resources: { steel: 5 }, equipment: { infantry_equipment: 100 } } } },
  resourceConsumption: null,
}, null, 2) + '\n');

writeFileSync(path.join(overlay, 'scenario.json'), JSON.stringify({
  _note: 'SCÉNARIO DE TEST — guerre, effectifs et divisions arbitraires pour exercer le moteur militaire',
  startingWars: [['paradis', 'marley']],
  nationOverrides: { paradis: { manpower: 20000 }, marley: { manpower: 50000 } },
  startingTemplates: [
    { id: 'tpl_test_p', nationId: 'paradis', name: 'Test garrison', battalions: [{ battalionType: 'infantry', count: 4 }] },
    { id: 'tpl_test_m', nationId: 'marley', name: 'Test assault', battalions: [{ battalionType: 'infantry', count: 4 }, { battalionType: 'artillery', count: 2 }] },
  ],
  startingDivisions: [
    { id: 'div_test_p1', nationId: 'paradis', templateId: 'tpl_test_p', locationProvinceId: 'test_a2' },
    { id: 'div_test_p2', nationId: 'paradis', templateId: 'tpl_test_p', locationProvinceId: 'test_a3' },
    { id: 'div_test_m1', nationId: 'marley', templateId: 'tpl_test_m', locationProvinceId: 'test_b3' },
    { id: 'div_test_m2', nationId: 'marley', templateId: 'tpl_test_m', locationProvinceId: 'test_b1' },
  ],
}, null, 2) + '\n');
