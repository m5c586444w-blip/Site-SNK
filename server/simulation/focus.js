// Focus nationaux — MECHANICS_SPEC.md §5 ; FEATURES_SPEC.md §6.
import { MAX_CONCURRENT_FOCUS } from '../../shared/constants.js';
import { dateNum } from '../../shared/conditions.js';
import { reveal } from '../state/fog.js';
import { addJournal } from '../state/journal.js';
import { applyEffects } from './effects.js';

const fail = (code, details) => { throw Object.assign(new Error(code), { code, details }); };

/** Pourquoi un focus ne peut pas démarrer (liste de raisons), vide s'il est disponible. */
export function focusBlockers(state, nation, focus) {
  const reasons = [];
  if (nation.completedFocusIds.includes(focus.id)) reasons.push({ code: 'FOCUS_COMPLETED' });
  if (nation.activeFocusId === focus.id) reasons.push({ code: 'FOCUS_IN_PROGRESS' });
  const missing = focus.prerequisiteFocusIds.filter((id) => !nation.completedFocusIds.includes(id));
  if (missing.length) reasons.push({ code: 'PREREQUISITES_MISSING', focusIds: missing });
  const excluded = (focus.mutuallyExclusive ?? []).filter((id) => nation.completedFocusIds.includes(id) || nation.activeFocusId === id);
  if (excluded.length) reasons.push({ code: 'MUTUALLY_EXCLUSIVE', focusIds: excluded });
  if (focus.requires?.titanPowerHeld && !(nation.titanPowersHeld ?? []).includes(focus.requires.titanPowerHeld)) {
    reasons.push({ code: 'TITAN_POWER_REQUIRED', titanId: focus.requires.titanPowerHeld });
  }
  if (focus.requires?.dateFrom) {
    const today = state.date.year * 10000 + state.date.month * 100 + state.date.day;
    if (today < dateNum(focus.requires.dateFrom)) reasons.push({ code: 'DATE_REQUIRED', date: focus.requires.dateFrom });
  }
  return reasons;
}

/** focus/start { nationId, focusId } — §5 focus_completion_check. */
export function startFocus(state, nationId, focusId, focuses) {
  const nation = state.nations.find((n) => n.id === nationId) ?? fail('INVALID_NATION');
  const focus = focuses.find((f) => f.id === focusId && f.nationId === nationId) ?? fail('INVALID_FOCUS');
  if (nation.activeFocusId != null && MAX_CONCURRENT_FOCUS <= 1) fail('FOCUS_SLOT_BUSY');
  const blockers = focusBlockers(state, nation, focus);
  if (blockers.length) fail(blockers[0].code, blockers);
  nation.activeFocusId = focus.id;
  nation.focusDaysRemaining = focus.costDays;
  return { focusId, daysRemaining: focus.costDays };
}

/** §5 on tick : décompte, puis à 0 effets dans l'ordre, completedFocusIds, slot libéré. */
export function focusDay(state, nationId, focuses, ctx) {
  const nation = state.nations.find((n) => n.id === nationId);
  if (!nation.activeFocusId) return null;
  nation.focusDaysRemaining -= 1;
  if (nation.focusDaysRemaining > 0) return null;
  const focus = focuses.find((f) => f.id === nation.activeFocusId);
  nation.activeFocusId = null;
  nation.focusDaysRemaining = 0;
  if (!focus) return null;
  applyEffects(state, nationId, focus.effects, ctx);
  nation.completedFocusIds.push(focus.id);
  // REVEAL_TRIGGERS : focus_completed avec le préfixe EXPLORATION_ (MECHANICS §10).
  if (focus.id.startsWith('EXPLORATION_')) {
    for (const r of focus.reveal ?? []) reveal(state, ctx.map, nationId, r.nationId, r.level);
  }
  addJournal(state, { visibleTo: [nationId], category: 'focus', textKey: 'journal.focusDone', vars: { focusId: focus.id } });
  return focus.id;
}
