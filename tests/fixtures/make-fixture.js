// Génère la carte de TEST abstraite (grille), utilisée uniquement par les tests et le développement.
// Ce n'est PAS du contenu de jeu : aucune géographie, aucun nom de lieu réel du monde du jeu.
import { writeFileSync } from 'node:fs';
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
  ],
  states: [
    { id: 'test_state_a1', name: 'Test State A1', ownerId: 'paradis', provinceIds: ['test_a1'], isWallState: true, infrastructureLevel: 2, resourceDeposits: { steel: 1, fuel: 0, rareMaterials: 0 } },
    { id: 'test_state_a2', name: 'Test State A2', ownerId: 'paradis', provinceIds: ['test_a2'] },
    { id: 'test_state_a3', name: 'Test State A3', ownerId: 'paradis', provinceIds: ['test_a3'] },
    { id: 'test_state_b', name: 'Test State B', ownerId: 'marley', provinceIds: ['test_b1', 'test_b2'] },
  ],
};
writeFileSync(path.join(dir, 'provinces.json'), JSON.stringify(def, null, 2) + '\n');
