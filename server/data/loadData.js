import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');

/** Dossier de la carte : data/map par défaut, surchargeable (tests, cartes alternatives). */
export function mapDir() {
  return process.env.SNK_MAP_DIR ? path.resolve(process.env.SNK_MAP_DIR) : path.join(DATA_DIR, 'map');
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

export async function loadNations() {
  const raw = JSON.parse(await readFile(path.join(DATA_DIR, 'nations.json'), 'utf8'));
  return raw.nations;
}

/**
 * Charge la définition de carte (masque couleur + provinces + états), voir data/map/README.md.
 * Retourne { available: false, reason } si les fichiers manquent : on ne fabrique pas de carte.
 */
export async function loadMap() {
  const dir = mapDir();
  const defPath = path.join(dir, 'provinces.json');
  if (!(await exists(defPath))) {
    return { available: false, reason: 'MAP_DEFINITION_MISSING', dir };
  }
  const def = JSON.parse(await readFile(defPath, 'utf8'));
  const maskPath = path.join(dir, def.maskFile ?? 'provinces_mask.png');
  if (!(await exists(maskPath))) {
    return { available: false, reason: 'MAP_MASK_MISSING', dir };
  }
  const backgroundPath = def.backgroundFile ? path.join(dir, def.backgroundFile) : null;
  return {
    available: true,
    dir,
    maskPath,
    backgroundPath: backgroundPath && (await exists(backgroundPath)) ? backgroundPath : null,
    homeLandmass: def.homeLandmass ?? { paradis: 'paradis_island' },
    provinces: def.provinces ?? [],
    states: def.states ?? [],
  };
}
