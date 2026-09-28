// Politique intérieure — MECHANICS_SPEC.md §9 ; FEATURES_SPEC.md §10, §12 ; programme des Guerriers §7.4.
import {
  LAW_CATEGORIES, LAW_SWITCH_COOLDOWN_DAYS, ELDIAN_STATUS_MODIFIERS, STABILITY_RANGE,
  UNREST_EVENT_CHANCE_PER_DAY_BELOW_30_STABILITY, WARRIOR_CANDIDATE_POOL_MAX, CANDIDATE_TRAINING_DAYS,
  DEFECTION_CHANCE_PER_DAY_BASE, DEFECTION_STABILITY_HIT,
} from '../../shared/constants.js';
import { nextRandom } from '../../shared/rng.js';
import { addJournal } from '../state/journal.js';
import { applyEffects } from './effects.js';
import { nationModifiers } from './modifiers.js';
import { nextId } from './economy.js';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));

function random(state) {
  const [v, next] = nextRandom(state.rngState);
  state.rngState = next;
  return v;
}

export function initialLaws(nations, politics) {
  const laws = {};
  for (const n of nations) laws[n.id] = { ...(politics?.startingLaws?.[n.id] ?? {}) };
  return laws;
}

/** law/change { nationId, category, newValue } — délai de 90 jours (§9). */
export function changeLaw(state, nationId, category, newValue, politics, ctx) {
  if (!LAW_CATEGORIES.includes(category)) fail('INVALID_LAW');
  const def = politics?.laws?.[category]?.[newValue] ?? fail('INVALID_LAW');
  if ((state.lawCooldowns[nationId]?.[category] ?? 0) > 0) fail('LAW_COOLDOWN');
  if (state.laws[nationId][category] === newValue) fail('LAW_ALREADY_ACTIVE');
  state.laws[nationId][category] = newValue;
  state.lawCooldowns[nationId] = { ...(state.lawCooldowns[nationId] ?? {}), [category]: LAW_SWITCH_COOLDOWN_DAYS };
  applyEffects(state, nationId, def.onSwitch, ctx);
  addJournal(state, { visibleTo: [nationId], category: 'politics', textKey: 'journal.lawChanged', vars: { category, value: newValue } });
}

/**
 * Politique de statut eldien (Marley uniquement, §9.3), même délai que les lois.
 * marleyanPopStabilityBonus est appliqué comme écart de stabilité lors du changement.
 */
export function changeEldianPolicy(state, nationId, policy) {
  const nation = state.nations.find((n) => n.id === nationId);
  if (nationId !== 'marley' || nation.eldianStatusPolicy == null) fail('MARLEY_ONLY');
  if (!ELDIAN_STATUS_MODIFIERS[policy]) fail('INVALID_LAW');
  if ((state.lawCooldowns[nationId]?.eldianStatusPolicy ?? 0) > 0) fail('LAW_COOLDOWN');
  if (nation.eldianStatusPolicy === policy) fail('LAW_ALREADY_ACTIVE');
  const delta = ELDIAN_STATUS_MODIFIERS[policy].marleyanPopStabilityBonus - ELDIAN_STATUS_MODIFIERS[nation.eldianStatusPolicy].marleyanPopStabilityBonus;
  if (nation.stability != null) nation.stability = clamp(nation.stability + delta, STABILITY_RANGE);
  nation.eldianStatusPolicy = policy;
  state.lawCooldowns[nationId] = { ...(state.lawCooldowns[nationId] ?? {}), eldianStatusPolicy: LAW_SWITCH_COOLDOWN_DAYS };
  addJournal(state, { visibleTo: [nationId], category: 'politics', textKey: 'journal.eldianPolicy', vars: { value: policy } });
}

/** §7.4 DEFECTION_CHANCE_PER_DAY avec le multiplicateur de §9.3 (voir PHASE5_GAPS B1). */
export function defectionChance(nation) {
  const mult = ELDIAN_STATUS_MODIFIERS[nation.eldianStatusPolicy ?? 'moderate'].warriorProgramDefectionMultiplier;
  return DEFECTION_CHANCE_PER_DAY_BASE * mult;
}

/** warrior/recruit { nationId } — Marley uniquement (FEATURES §12). */
export function recruitCandidate(state, nationId) {
  if (nationId !== 'marley') fail('MARLEY_ONLY');
  const wp = state.warriorProgram;
  if (wp.candidates.length >= WARRIOR_CANDIDATE_POOL_MAX) fail('POOL_FULL');
  const c = { id: nextId(state, 'cand'), daysTrained: 0, ready: false };
  wp.candidates.push(c);
  return c;
}

/** Journée politique pour une nation. */
export function politicsDay(state, nationId, politics, ctx) {
  const nation = state.nations.find((n) => n.id === nationId);
  const mods = nationModifiers(state, nationId, politics);
  for (const k of Object.keys(state.lawCooldowns[nationId] ?? {})) {
    if (state.lawCooldowns[nationId][k] > 0) state.lawCooldowns[nationId][k] -= 1;
  }
  // Réserve d'effectifs [EXTENSION] : croissance selon la loi de conscription
  if (nation.manpower != null) nation.manpower += mods.manpowerPerDay;
  // [EXTENSION] Dérive lente vers la stabilité de départ (data/politics.json → stabilityDriftPerDay)
  if (nation.stability != null && nation.baselineStability != null && politics?.stabilityDriftPerDay) {
    const gap = nation.baselineStability - nation.stability;
    nation.stability += Math.sign(gap) * Math.min(Math.abs(gap), politics.stabilityDriftPerDay);
  }
  // Titan Fondateur : +1 stabilité/jour (moitié sans lignée royale), §7.3
  if (nation.stability != null && mods.stabilityRegen) nation.stability = clamp(nation.stability + mods.stabilityRegen, STABILITY_RANGE);
  // Troubles sous 30 de stabilité (§9)
  if (nation.stability != null && nation.stability < 30 && random(state) < UNREST_EVENT_CHANCE_PER_DAY_BELOW_30_STABILITY) {
    applyEffects(state, nationId, politics?.unrestEffects ?? [], ctx);
    addJournal(state, { visibleTo: [nationId], category: 'politics', textKey: 'journal.unrest', vars: {} });
  }
  // Marley : troubles eldiens (§9.3) et programme des Guerriers (§7.4)
  if (nationId === 'marley' && nation.eldianStatusPolicy) {
    if (random(state) < ELDIAN_STATUS_MODIFIERS[nation.eldianStatusPolicy].eldianPopUnrestChancePerDay) {
      applyEffects(state, nationId, politics?.eldianUnrestEffects ?? [], ctx);
      addJournal(state, { visibleTo: [nationId], category: 'politics', textKey: 'journal.eldianUnrest', vars: {} });
    }
    const wp = state.warriorProgram;
    const chance = defectionChance(nation);
    for (const c of [...wp.candidates]) {
      if (!c.ready && random(state) < chance) {
        wp.candidates = wp.candidates.filter((x) => x !== c);
        if (nation.stability != null) nation.stability = clamp(nation.stability + DEFECTION_STABILITY_HIT, STABILITY_RANGE);
        addJournal(state, { visibleTo: [nationId], category: 'titan', textKey: 'journal.defection', vars: {} });
        continue;
      }
      if (!c.ready && ++c.daysTrained >= CANDIDATE_TRAINING_DAYS) c.ready = true;
    }
    // [EXTENSION] IA : Marley non joué garde son vivier plein.
    if (!state.humanNations?.includes('marley')) while (wp.candidates.length < WARRIOR_CANDIDATE_POOL_MAX) recruitCandidate(state, 'marley');
  }
}
