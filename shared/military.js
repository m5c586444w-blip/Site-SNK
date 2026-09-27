// Formules de MECHANICS_SPEC.md §6, partagées serveur/client (éditeur de modèle en direct).
import {
  BATTALION_TYPES, TERRAIN_MODIFIER_DEFAULT, WALL_DEFENSE_BONUS,
} from './constants.js';

/**
 * §6.2 Statistiques calculées d'un modèle.
 * speed = min(vitesses des bataillons présents) ; null si une vitesse manque (absente des specs).
 */
export function computeTemplateStats(battalions, battalionSpeeds = {}) {
  const stats = { attack: 0, defense: 0, width: 0, speed: null, manpowerCost: 0, equipmentCost: {} };
  const speeds = [];
  for (const { battalionType, count } of battalions) {
    const b = BATTALION_TYPES[battalionType];
    if (!b || count <= 0) continue;
    stats.attack += b.attack * count;
    stats.defense += b.defense * count;
    stats.width += b.width * count;
    stats.manpowerCost += b.manpower * count;
    for (const [eq, n] of Object.entries(b.equipmentCost)) stats.equipmentCost[eq] = (stats.equipmentCost[eq] ?? 0) + n * count;
    speeds.push(battalionSpeeds?.[battalionType] ?? null);
  }
  stats.speed = speeds.length && speeds.every((s) => s != null) ? Math.min(...speeds) : null;
  return stats;
}

/** §6.3 attacker_power */
export function attackerPower(division, stats) {
  return stats.attack * (division.organization / 100) * (division.strength / 100);
}

/** §6.3 defender_power */
export function defenderPower(division, stats, { terrainModifier = TERRAIN_MODIFIER_DEFAULT, isWallFortified = false } = {}) {
  return stats.defense * (division.organization / 100) * (division.strength / 100)
    * terrainModifier * (1 + (isWallFortified ? WALL_DEFENSE_BONUS : 0));
}

/** §6.3 result_ratio */
export function resultRatio(attack, defense) {
  return attack / Math.max(defense, 0.01);
}
