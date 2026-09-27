// Voisinage des provinces, déduit du masque couleur : deux provinces sont voisines si deux de
// leurs pixels se touchent (4-connexité). La mer (couleurs sans province) ne crée aucun voisinage.
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

export async function computeAdjacency(maskPath, provinces) {
  const png = PNG.sync.read(await readFile(maskPath));
  const { width: w, height: h, data } = png;
  const byKey = new Map(provinces.map((p) => [parseInt(p.color.replace('#', ''), 16), p.id]));
  const ids = new Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    ids[i] = byKey.get((data[o] << 16) | (data[o + 1] << 8) | data[o + 2]);
  }
  const adj = new Map(provinces.map((p) => [p.id, new Set()]));
  const link = (a, b) => {
    if (a && b && a !== b) { adj.get(a).add(b); adj.get(b).add(a); }
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1) link(ids[i], ids[i + 1]);
      if (y < h - 1) link(ids[i], ids[i + w]);
    }
  }
  return Object.fromEntries([...adj].map(([k, v]) => [k, [...v].sort()]));
}
