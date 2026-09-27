// Recherche — MECHANICS_SPEC.md §4 ; FEATURES_SPEC.md §5.
import { RESEARCH_CATEGORIES } from '../../shared/constants.js';
import { researchDays, researchSlotCount } from '../../shared/research.js';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

function nationOf(state, nationId) {
  return state.nations.find((n) => n.id === nationId) ?? fail('INVALID_NATION');
}

/** Raison pour laquelle une techno ne peut pas démarrer, ou null. Partagé par la validation et l'affichage. */
export function researchBlocker(nation, tech) {
  if (!RESEARCH_CATEGORIES.includes(tech.category)) return 'INVALID_TECH';
  if (nation.lockedResearchCategories?.includes(tech.category)) return 'CATEGORY_LOCKED';
  if (nation.completedTechIds.includes(tech.id)) return 'TECH_COMPLETED';
  if (nation.activeResearch.some((r) => r.techId === tech.id)) return 'TECH_IN_PROGRESS';
  const missing = (tech.prerequisiteTechIds ?? []).filter((id) => !nation.completedTechIds.includes(id));
  if (missing.length) return 'PREREQUISITES_MISSING';
  return null;
}

/** research/assign { nationId, techId, slotIndex } */
export function assignResearch(state, nationId, techId, slotIndex, technologies) {
  const nation = nationOf(state, nationId);
  const slots = researchSlotCount(nation);
  if (slots == null) fail('RESEARCH_SLOTS_UNKNOWN');
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots) fail('INVALID_SLOT');
  if (nation.activeResearch.some((r) => r.slotIndex === slotIndex)) fail('SLOT_BUSY');
  const tech = technologies.find((t) => t.id === techId) ?? fail('INVALID_TECH');
  const blocker = researchBlocker(nation, tech);
  if (blocker) fail(blocker);
  const days = researchDays(tech, nation);
  const entry = { slotIndex, techId, daysRemaining: days, totalDays: days };
  nation.activeResearch.push(entry);
  return entry;
}

/** Annulation : la progression est perdue (FEATURES §5). */
export function cancelResearch(state, nationId, slotIndex) {
  const nation = nationOf(state, nationId);
  const idx = nation.activeResearch.findIndex((r) => r.slotIndex === slotIndex);
  if (idx < 0) fail('INVALID_SLOT');
  nation.activeResearch.splice(idx, 1);
}

/** Un jour de recherche. Retourne les technos terminées ce jour. */
export function researchDay(state, nationId) {
  const nation = nationOf(state, nationId);
  const done = [];
  for (const r of nation.activeResearch) r.daysRemaining -= 1;
  for (const r of nation.activeResearch.filter((x) => x.daysRemaining <= 0)) {
    nation.completedTechIds.push(r.techId);
    done.push(r.techId);
  }
  nation.activeResearch = nation.activeResearch.filter((x) => x.daysRemaining > 0);
  return done;
}
