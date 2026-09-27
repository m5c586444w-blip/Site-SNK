// Diplomatie — MECHANICS_SPEC.md §8 ; FEATURES_SPEC.md §9. Toute action est validée ici.
// Les effets des accords ne sont pas décrits par les specs : interprétations dans docs/PHASE4_GAPS.md (B).
import {
  RELATION_SCALE, ACTION_COSTS, WARGOAL_JUSTIFY_DAYS_DEFAULT, WARSCORE_PER_OBJECTIVE_CAPTURED, WARSCORE_PEACE_THRESHOLD,
} from '../../shared/constants.js';
import { dateNum } from '../../shared/conditions.js';
import { formatDate } from '../../shared/calendar.js';
import { nationVisibility } from '../state/fog.js';
import { addJournal } from '../state/journal.js';
import { warKey, atWar, provinceController } from './military.js';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const clampRel = (x) => Math.min(RELATION_SCALE[1], Math.max(RELATION_SCALE[0], x));

export const pairKey = (a, b) => [a, b].sort().join('|');

export function initialRelations(nations, rules) {
  const rel = {};
  for (const a of nations) for (const b of nations) {
    if (a.id < b.id) rel[pairKey(a.id, b.id)] = rules?.initialRelations?.[pairKey(a.id, b.id)] ?? 0;
  }
  return rel;
}

export function relation(state, a, b) {
  return state.relations?.[pairKey(a, b)] ?? 0;
}

export function changeRelation(state, a, b, delta) {
  if (a === b) return;
  state.relations[pairKey(a, b)] = clampRel(relation(state, a, b) + delta);
}

export function hasAgreement(state, type, a, b, { directed = false } = {}) {
  return (state.agreements ?? []).some((g) => g.type === type
    && ((g.a === a && g.b === b) || (!directed && g.a === b && g.b === a)));
}

function logAction(state, actor, target, action) {
  state.diplomacyLog.push({ date: formatDate(state.date), actor, target, action });
}

const known = (state, viewer, target) => nationVisibility(state, viewer, target) === 'known';

/** Raison de refus d'une action diplomatique, ou null (sert aussi aux boutons désactivés §9, §17). */
export function actionBlocker(state, actorId, targetId, action) {
  const actor = state.nations.find((n) => n.id === actorId);
  if (!actor || !state.nations.some((n) => n.id === targetId) || actorId === targetId) return 'INVALID_TARGET_NATION';
  // Brouillard (§8) : aucune action vers une nation que l'on ne connaît pas.
  if (!known(state, actorId, targetId)) return 'NATION_UNKNOWN';
  if (action === 'justify_wargoal') {
    if (atWar(state, actorId, targetId)) return 'ALREADY_AT_WAR';
    if (hasAgreement(state, 'nonaggression', actorId, targetId) || hasAgreement(state, 'alliance', actorId, targetId)) return 'TREATY_FORBIDS_WAR';
    if (state.wargoals.some((w) => w.nationId === actorId && w.targetId === targetId)) return 'WARGOAL_EXISTS';
    return null;
  }
  if (action === 'declare_war') {
    if (atWar(state, actorId, targetId)) return 'ALREADY_AT_WAR';
    const wg = state.wargoals.find((w) => w.nationId === actorId && w.targetId === targetId);
    if (!wg) return 'NO_WARGOAL';
    if (wg.daysRemaining > 0) return 'WARGOAL_NOT_READY';
    return null;
  }
  const cost = ACTION_COSTS[action];
  if (!cost) return 'INVALID_DIPLOMATIC_ACTION';
  if (cost.minRelation != null && relation(state, actorId, targetId) < cost.minRelation) return 'RELATION_TOO_LOW';
  if (actor.politicalCapital == null) return 'POLITICAL_CAPITAL_UNKNOWN';
  if (actor.politicalCapital < cost.politicalCapitalCost) return 'INSUFFICIENT_POLITICAL_CAPITAL';
  if (atWar(state, actorId, targetId) && action !== 'embargo') return 'ALREADY_AT_WAR';
  const type = { propose_alliance: 'alliance', propose_nonaggression: 'nonaggression', guarantee_independence: 'guarantee', embargo: 'embargo' }[action];
  if (hasAgreement(state, type, actorId, targetId, { directed: type === 'guarantee' || type === 'embargo' })) return 'AGREEMENT_EXISTS';
  return null;
}

/** diplomacy/action { nationId, targetNationId, action } */
export function diplomaticAction(state, actorId, targetId, action) {
  const blocker = actionBlocker(state, actorId, targetId, action);
  if (blocker) fail(blocker);
  if (action === 'justify_wargoal') {
    state.wargoals.push({ nationId: actorId, targetId, daysRemaining: WARGOAL_JUSTIFY_DAYS_DEFAULT });
    logAction(state, actorId, targetId, action);
    return;
  }
  if (action === 'declare_war') {
    state.wargoals = state.wargoals.filter((w) => !(w.nationId === actorId && w.targetId === targetId));
    startWar(state, actorId, targetId);
    logAction(state, actorId, targetId, action);
    return;
  }
  const actor = state.nations.find((n) => n.id === actorId);
  actor.politicalCapital -= ACTION_COSTS[action].politicalCapitalCost;
  // [CHOIX] Aucune règle d'acceptation par l'IA dans les specs : une proposition qui passe les
  // seuils de §8 est acceptée.
  const type = { propose_alliance: 'alliance', propose_nonaggression: 'nonaggression', guarantee_independence: 'guarantee', embargo: 'embargo' }[action];
  state.agreements.push({ type, a: actorId, b: targetId, date: formatDate(state.date) });
  logAction(state, actorId, targetId, action);
}

/** Ouvre une guerre. Les alliés et garants de la cible entrent en guerre contre l'agresseur. */
export function startWar(state, attackerId, defenderId, { historicalEventId = null, softEndDate = null, softEndWinner = null } = {}) {
  const pairs = [[attackerId, defenderId]];
  for (const g of state.agreements) {
    const joiner = g.type === 'alliance' ? (g.a === defenderId ? g.b : g.b === defenderId ? g.a : null)
      : g.type === 'guarantee' && g.b === defenderId ? g.a : null;
    if (joiner && joiner !== attackerId) pairs.push([attackerId, joiner]);
  }
  for (const [a, b] of pairs) {
    if (atWar(state, a, b)) continue;
    state.wars.push([a, b]);
    state.warInfo[warKey(a, b)] = { attacker: a, defender: b, startDate: formatDate(state.date), warscore: { [a]: 0, [b]: 0 }, historicalEventId, softEndDate, softEndWinner };
    addJournal(state, { visibleTo: [a, b], category: 'diplomacy', textKey: 'journal.warDeclared', vars: { a, b } });
  }
}

/** Fin d'une guerre : le vainqueur reçoit les états qu'il occupe au perdant ; le reste est restitué. */
export function endWar(state, a, b, winner) {
  const loser = winner === a ? b : a;
  const key = warKey(a, b);
  const info = state.warInfo[key];
  state.wars = state.wars.filter((w) => warKey(w[0], w[1]) !== key);
  delete state.warInfo[key];
  for (const st of state.states) {
    if (st.ownerId === loser && st.controllerId === winner) st.ownerId = winner;
    for (const pid of st.provinceIds) {
      if (st.ownerId === winner && provinceController(state, pid) === loser) state.provinceControl[pid] = winner;
      if (st.ownerId === loser && provinceController(state, pid) === winner) state.provinceControl[pid] = loser;
    }
    const controllers = new Set(st.provinceIds.map((pid) => provinceController(state, pid)));
    if (controllers.size === 1) st.controllerId = [...controllers][0];
  }
  for (const d of state.divisions) if (d.order === 'advance') Object.assign(d, { order: 'hold', targetProvinceId: null });
  if (info?.historicalEventId) {
    state.eventLog[info.historicalEventId] = { ...(state.eventLog[info.historicalEventId] ?? {}), resolved: true };
  }
  addJournal(state, { visibleTo: [a, b], category: 'diplomacy', textKey: 'journal.peace', vars: { winner, loser } });
}

/** §8 : +10 de score par objectif (province) pris ; 100 impose la paix. */
export function recordCaptures(state, captured) {
  for (const c of captured) {
    const info = state.warInfo[warKey(c.from, c.to)];
    if (!info) continue;
    info.warscore[c.to] = (info.warscore[c.to] ?? 0) + WARSCORE_PER_OBJECTIVE_CAPTURED;
  }
}

/** Journée diplomatique : justification des buts de guerre, capital politique, fin des guerres. */
export function diplomacyDay(state, rules) {
  for (const w of state.wargoals) if (w.daysRemaining > 0) w.daysRemaining -= 1;
  if (rules?.politicalCapitalPerDay != null) {
    for (const n of state.nations) if (n.politicalCapital != null) n.politicalCapital += rules.politicalCapitalPerDay;
  }
  const today = state.date.year * 10000 + state.date.month * 100 + state.date.day;
  for (const [a, b] of [...state.wars]) {
    const info = state.warInfo[warKey(a, b)];
    if (!info) continue;
    const top = Object.entries(info.warscore).find(([, s]) => s >= WARSCORE_PEACE_THRESHOLD);
    if (top) endWar(state, a, b, top[0]);
    else if (info.softEndDate && today >= dateNum(info.softEndDate)) endWar(state, a, b, info.softEndWinner);
  }
}
