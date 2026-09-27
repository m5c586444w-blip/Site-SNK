import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAdjacency } from './adjacency.js';
import { compileEvents } from '../simulation/events.js';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');

/** Dossier de la carte : data/map par défaut, surchargeable (tests, cartes alternatives). */
export function mapDir() {
  return process.env.SNK_MAP_DIR ? path.resolve(process.env.SNK_MAP_DIR) : path.join(DATA_DIR, 'map');
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Fichier de données : data/<name>, sauf s'il existe dans le dossier SNK_DATA_OVERLAY. Ce dossier
 * sert aux tests et au développement (tests/fixtures/overlay) sans toucher aux vraies données.
 */
async function dataFile(name) {
  if (process.env.SNK_DATA_OVERLAY) {
    const p = path.join(path.resolve(process.env.SNK_DATA_OVERLAY), name);
    if (await exists(p)) return p;
  }
  return path.join(DATA_DIR, name);
}

async function readJson(name) {
  return JSON.parse(await readFile(await dataFile(name), 'utf8'));
}

export async function loadNations() {
  return (await readJson('nations.json')).nations;
}

export async function loadTechnologies() {
  return (await readJson('technologies.json')).technologies ?? [];
}

export async function loadEconomyRules() {
  return readJson('economy_rules.json');
}

export async function loadMilitaryRules() {
  return readJson('military_rules.json');
}

export async function loadScenario() {
  return readJson('scenario.json');
}

export async function loadFocuses() {
  return readJson('focuses.json');
}

export async function loadEvents() {
  return readJson('events.json');
}

export async function loadDiplomacy() {
  return readJson('diplomacy.json');
}

export async function loadPolitics() {
  return readJson('politics.json');
}

/** Toutes les données statiques d'une partie. */
export async function loadGameData() {
  const [nations, map, technologies, economyRules, militaryRules, scenario, focusData, eventData, diplomacyRules, politics] = await Promise.all([
    loadNations(), loadMap(), loadTechnologies(), loadEconomyRules(), loadMilitaryRules(), loadScenario(),
    loadFocuses(), loadEvents(), loadDiplomacy(), loadPolitics(),
  ]);
  return {
    nations, map, technologies, economyRules, militaryRules, scenario,
    focuses: focusData.focuses, focusBranches: focusData.branches,
    events: compileEvents(eventData), eventValues: eventData.extensionValues ?? {},
    diplomacyRules,
    politics,
  };
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
  const provinces = def.provinces ?? [];
  return {
    adjacency: await computeAdjacency(maskPath, provinces),
    available: true,
    dir,
    maskPath,
    backgroundPath: backgroundPath && (await exists(backgroundPath)) ? backgroundPath : null,
    homeLandmass: def.homeLandmass ?? { paradis: 'paradis_island' },
    provinces,
    states: def.states ?? [],
  };
}
