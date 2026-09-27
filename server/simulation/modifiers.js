// Agrégation des modificateurs d'une nation : technologies [EXTENSION], lois [EXTENSION] et
// pouvoirs de Titans détenus (MECHANICS_SPEC.md §7.3, valeurs de la spec).
import { TITAN_POWER_BONUS } from '../../shared/constants.js';

export const EMPTY_MODIFIERS = () => ({
  attackPct: 0, defensePct: 0, resourceYieldPct: 0, productionOutputPct: 0, manpowerPerDay: 0,
  siegePct: 0, defenderOrgLossPct: 0, speedPct: 0, supplyFlat: 0, stabilityRegen: 0, focusCostPct: 0,
  researchBonus: {},
});

export function titansHeldBy(state, nationId) {
  return Object.entries(state.titans ?? {}).filter(([, t]) => t.holderNationId === nationId).map(([id]) => id);
}

export function nationModifiers(state, nationId, politics) {
  const nation = state.nations.find((n) => n.id === nationId);
  const m = EMPTY_MODIFIERS();
  // Technologies (cumul des effets `modifier` des technologies acquises)
  for (const [k, v] of Object.entries(nation?.modifiers ?? {})) if (k in m && typeof v === 'number') m[k] += v;
  // Lois en vigueur
  for (const [cat, lawId] of Object.entries(state.laws?.[nationId] ?? {})) {
    for (const [k, v] of Object.entries(politics?.laws?.[cat]?.[lawId]?.modifiers ?? {})) if (k in m) m[k] += v;
  }
  // Neuf Titans (§7.3)
  for (const id of titansHeldBy(state, nationId)) {
    const b = TITAN_POWER_BONUS[id];
    if (b.stabilityRegenPerDay) m.stabilityRegen += nation?.flags?.royalBloodlineFlag ? b.stabilityRegenPerDay : b.stabilityRegenPerDay / 2;
    if (b.focusCostDaysReductionPct) m.focusCostPct += b.focusCostDaysReductionPct;
    if (b.siegeBonusPct) m.siegePct += b.siegeBonusPct;
    if (b.defenderOrgLossOnAttackPct) m.defenderOrgLossPct += b.defenderOrgLossOnAttackPct;
    if (b.divisionDefensePct) m.defensePct += b.divisionDefensePct;
    if (b.divisionSpeedPct) m.speedPct += b.divisionSpeedPct;
    if (b.researchBonusCategory) m.researchBonus[b.researchBonusCategory] = (m.researchBonus[b.researchBonusCategory] ?? 0) + b.researchBonusPct / 100;
    if (b.supplyValueFlat) m.supplyFlat += b.supplyValueFlat;
  }
  return m;
}

/** categoryBonus effectif (§4) = bonus des technologies + bonus de Titan (Bestial : doctrine +10 %). */
export function refreshCategoryBonus(state, politics) {
  for (const n of state.nations) {
    const m = nationModifiers(state, n.id, politics);
    const merged = { ...(n.baseCategoryBonus ?? {}) };
    for (const [c, v] of Object.entries(m.researchBonus)) merged[c] = (merged[c] ?? 0) + v;
    n.categoryBonus = merged;
  }
}
