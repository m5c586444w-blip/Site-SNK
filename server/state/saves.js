// Sauvegarde / chargement — FEATURES_SPEC.md §16, format MECHANICS_SPEC.md §11.
// Fichiers JSON locaux horodatés dans saves/ (cahier des charges §3).
import { readFile, writeFile, readdir, unlink, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from '../data/loadData.js';
import { AUTOSAVE_SLOTS } from '../../shared/constants.js';
import { toSaveFile, fromSaveFile } from './gameState.js';

export function savesDir() {
  return process.env.SNK_SAVES_DIR ? path.resolve(process.env.SNK_SAVES_DIR) : path.join(ROOT_DIR, 'saves');
}

const AUTOSAVE_RE = /^autosave_\d+$/;

function saveError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Nom affiché -> identifiant de fichier sûr (pas de chemin, pas de caractères spéciaux). */
export function saveIdFromName(name) {
  const id = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  if (!id) throw saveError('INVALID_SAVE_NAME', 'Nom de sauvegarde invalide');
  return id;
}

function fileFor(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw saveError('INVALID_SAVE_NAME', 'Identifiant invalide');
  return path.join(savesDir(), `${id}.json`);
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function writeSave(id, name, state) {
  await mkdir(savesDir(), { recursive: true });
  const data = { ...toSaveFile(state), name };
  await writeFile(fileFor(id), JSON.stringify(data, null, 2));
  return summarize(id, data);
}

function summarize(id, data) {
  return {
    id,
    name: data.name ?? id,
    savedAtIso: data.savedAtIso,
    nationId: data.settings?.nationId ?? null,
    currentDate: data.currentDate ?? null,
    historicalMode: data.settings?.historicalMode ?? null,
    formatVersion: data.formatVersion ?? null,
    isAutosave: AUTOSAVE_RE.test(id),
  };
}

export async function listSaves() {
  let files = [];
  try { files = await readdir(savesDir()); } catch { return []; }
  const out = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const id = f.slice(0, -5);
    try {
      out.push(summarize(id, JSON.parse(await readFile(path.join(savesDir(), f), 'utf8'))));
    } catch {
      out.push({ id, name: id, savedAtIso: null, corrupt: true, isAutosave: AUTOSAVE_RE.test(id) });
    }
  }
  return out.sort((a, b) => String(b.savedAtIso).localeCompare(String(a.savedAtIso)));
}

/** Sauvegarde manuelle. Un nom déjà pris renvoie SAVE_EXISTS sauf si overwrite = true (§16, §17). */
export async function createSave(name, state, { overwrite = false } = {}) {
  const id = saveIdFromName(name);
  if (AUTOSAVE_RE.test(id)) throw saveError('RESERVED_SAVE_NAME', 'Nom réservé aux sauvegardes automatiques');
  if (!overwrite && (await exists(fileFor(id)))) throw saveError('SAVE_EXISTS', 'Une sauvegarde porte déjà ce nom');
  return writeSave(id, String(name), state);
}

/** Autosave tournante autosave_1..N : on écrase la plus ancienne, jamais une sauvegarde manuelle. */
export async function autosave(state) {
  const saves = (await listSaves()).filter((s) => s.isAutosave);
  let slot = 1;
  for (let i = 1; i <= AUTOSAVE_SLOTS; i++) {
    if (!saves.find((s) => s.id === `autosave_${i}`)) { slot = i; break; }
    slot = null;
  }
  if (slot === null) {
    const oldest = saves
      .filter((s) => Number(s.id.split('_')[1]) <= AUTOSAVE_SLOTS)
      .sort((a, b) => String(a.savedAtIso).localeCompare(String(b.savedAtIso)))[0];
    slot = Number(oldest.id.split('_')[1]);
  }
  const id = `autosave_${slot}`;
  return writeSave(id, id, state);
}

export async function loadSave(id) {
  const file = fileFor(id);
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') throw saveError('SAVE_NOT_FOUND', 'Sauvegarde introuvable');
    throw saveError('INCOMPATIBLE_SAVE', 'Sauvegarde illisible');
  }
  return fromSaveFile(data);
}

export async function deleteSave(id) {
  const file = fileFor(id);
  try {
    await unlink(file);
  } catch (e) {
    if (e.code === 'ENOENT') throw saveError('SAVE_NOT_FOUND', 'Sauvegarde introuvable');
    throw e;
  }
}
