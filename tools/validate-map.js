#!/usr/bin/env node
// Vérifie la cohérence masque couleur <-> data/map/provinces.json (voir data/map/README.md).
// Usage : npm run validate-map   (ou SNK_MAP_DIR=<dossier> npm run validate-map)
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { mapDir, loadNations } from '../server/data/loadData.js';

export async function validateMap(dir = mapDir()) {
  const errors = [];
  const warnings = [];
  let def;
  try {
    def = JSON.parse(await readFile(path.join(dir, 'provinces.json'), 'utf8'));
  } catch (e) {
    return { errors: [`provinces.json illisible ou absent dans ${dir} (${e.code ?? e.message})`], warnings };
  }
  let png;
  try {
    png = PNG.sync.read(await readFile(path.join(dir, def.maskFile ?? 'provinces_mask.png')));
  } catch (e) {
    return { errors: [`masque PNG illisible ou absent (${e.code ?? e.message})`], warnings };
  }

  const norm = (c) => String(c).toLowerCase();
  const nations = new Set((await loadNations()).map((n) => n.id));
  const provinces = def.provinces ?? [];
  const states = def.states ?? [];
  const byColor = new Map();
  const provIds = new Set();
  for (const p of provinces) {
    if (!/^#[0-9a-f]{6}$/i.test(p.color ?? '')) errors.push(`province ${p.id} : couleur invalide ${p.color}`);
    if (byColor.has(norm(p.color))) errors.push(`couleur ${p.color} utilisée par ${byColor.get(norm(p.color))} et ${p.id}`);
    if (provIds.has(p.id)) errors.push(`id de province en double : ${p.id}`);
    byColor.set(norm(p.color), p.id);
    provIds.add(p.id);
  }
  const stateIds = new Set(states.map((s) => s.id));
  for (const p of provinces) {
    if (p.stateId && !stateIds.has(p.stateId)) errors.push(`province ${p.id} : état inconnu ${p.stateId}`);
    if (!p.stateId) warnings.push(`province ${p.id} : aucun état`);
  }
  const factoryIds = new Set();
  for (const s of states) {
    for (const f of s.factories ?? []) {
      if (!['civilian', 'military'].includes(f.type)) errors.push(`état ${s.id} : usine ${f.id} de type invalide ${f.type}`);
      if (!f.id || factoryIds.has(f.id)) errors.push(`état ${s.id} : id d'usine manquant ou en double (${f.id})`);
      factoryIds.add(f.id);
    }
    if (!nations.has(s.ownerId)) errors.push(`état ${s.id} : propriétaire inconnu ${s.ownerId}`);
    if (s.controllerId && !nations.has(s.controllerId)) errors.push(`état ${s.id} : contrôleur inconnu ${s.controllerId}`);
    for (const pid of s.provinceIds ?? []) {
      if (!provIds.has(pid)) errors.push(`état ${s.id} : province inconnue ${pid}`);
      else if (provinces.find((p) => p.id === pid).stateId !== s.id) errors.push(`état ${s.id} : ${pid} déclarée dans un autre état`);
    }
  }

  const ignored = new Set((def.ignoredColors ?? []).map(norm));
  const seen = new Set();
  const unknown = new Map();
  for (let i = 0; i < png.data.length; i += 4) {
    const hex = `#${[png.data[i], png.data[i + 1], png.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    if (byColor.has(hex)) seen.add(hex);
    else if (!ignored.has(hex)) unknown.set(hex, (unknown.get(hex) ?? 0) + 1);
  }
  for (const [c, id] of byColor) if (!seen.has(c)) errors.push(`province ${id} (${c}) absente du masque`);
  if (unknown.size) {
    const top = [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => `${c}×${n}`).join(', ');
    errors.push(`${unknown.size} couleur(s) du masque sans province ni ignoredColors (anticrénelage ?) : ${top}`);
  }
  return { errors, warnings, size: [png.width, png.height], provinces: provinces.length, states: states.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await validateMap();
  for (const w of r.warnings) console.warn(`avertissement : ${w}`);
  for (const e of r.errors) console.error(`ERREUR : ${e}`);
  if (r.errors.length) process.exit(1);
  console.log(`Carte valide : ${r.size.join('×')} px, ${r.provinces} provinces, ${r.states} états.`);
}
