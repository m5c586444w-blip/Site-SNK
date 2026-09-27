// MECHANICS_SPEC.md §4.
import { RESEARCH_SLOTS_DEFAULT } from './constants.js';

/** research_days(tech) = tech.baseCostDays / (1 + nation.categoryBonus[tech.category]) */
export function researchDays(tech, nation) {
  const bonus = nation.categoryBonus?.[tech.category] ?? 0.0;
  return tech.baseCostDays / (1 + bonus);
}

/**
 * Nombre de slots : override explicite (Paradis = 3), sinon RESEARCH_SLOTS_DEFAULT selon le rang
 * major/minor. Si le rang n'est pas renseigné (absent des specs), on renvoie null.
 */
export function researchSlotCount(nation) {
  if (nation.researchSlots != null) return nation.researchSlots;
  if (nation.researchTier && RESEARCH_SLOTS_DEFAULT[nation.researchTier] != null) return RESEARCH_SLOTS_DEFAULT[nation.researchTier];
  return null;
}
