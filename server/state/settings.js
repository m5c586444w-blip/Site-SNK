// Réglages de l'application — FEATURES_SPEC.md §0.3. Fichier local settings.json, indépendant
// des sauvegardes.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from '../data/loadData.js';

export const DEFAULT_SETTINGS = { masterVolume: 100, uiScale: 'medium', language: 'FR' };

function settingsPath() {
  return process.env.SNK_SETTINGS_FILE ? path.resolve(process.env.SNK_SETTINGS_FILE) : path.join(ROOT_DIR, 'settings.json');
}

export async function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...validate(JSON.parse(await readFile(settingsPath(), 'utf8')), true) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function validate(input, lenient = false) {
  const out = {};
  const bad = (field) => { if (!lenient) throw Object.assign(new Error(`Réglage invalide : ${field}`), { code: 'INVALID_SETTINGS' }); };
  if ('masterVolume' in input) {
    const v = Number(input.masterVolume);
    if (Number.isFinite(v) && v >= 0 && v <= 100) out.masterVolume = Math.round(v); else bad('masterVolume');
  }
  if ('uiScale' in input) {
    if (['small', 'medium', 'large'].includes(input.uiScale)) out.uiScale = input.uiScale; else bad('uiScale');
  }
  if ('language' in input) {
    if (['FR', 'EN'].includes(input.language)) out.language = input.language; else bad('language');
  }
  return out;
}

export async function writeSettings(input) {
  const next = { ...(await readSettings()), ...validate(input ?? {}) };
  await writeFile(settingsPath(), JSON.stringify(next, null, 2));
  return next;
}
