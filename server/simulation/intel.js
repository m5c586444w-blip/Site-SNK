// Renseignement — FEATURES_SPEC.md §11. Effets des opérations : [EXTENSION] (data/politics.json → intel).
import { INTEL_OPERATIONS } from '../../shared/constants.js';
import { nextRandom } from '../../shared/rng.js';
import { formatDate } from '../../shared/calendar.js';
import { nationVisibility, reveal } from '../state/fog.js';
import { addJournal } from '../state/journal.js';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
export const UNKNOWN_TARGET = '__unknown__';

function random(state) {
  const [v, next] = nextRandom(state.rngState);
  state.rngState = next;
  return v;
}

export function initialAgents(nations, politics) {
  const agents = {};
  for (const n of nations) {
    const count = politics?.intel?.agentsByNation?.[n.id] ?? 0;
    agents[n.id] = Array.from({ length: count }, (_, i) => ({ id: `agent_${n.id}_${i + 1}`, busyDays: 0 }));
  }
  return agents;
}

/** Cibles possibles. Brouillard (§10) : pas d'entrée pour une nation cachée, mais Paradis peut
 * envoyer une reconnaissance vers le « territoire inconnu » (révèle une nation cachée). */
export function intelTargets(state, nationId) {
  const list = state.nations.filter((n) => n.id !== nationId && nationVisibility(state, nationId, n.id) !== 'hidden').map((n) => n.id);
  const hasHidden = state.nations.some((n) => n.id !== nationId && nationVisibility(state, nationId, n.id) === 'hidden');
  return hasHidden ? [...list, UNKNOWN_TARGET] : list;
}

/** intel/operation { nationId, operationType, targetNationId?, agentId } */
export function runOperation(state, map, nationId, operationType, targetNationId, agentId, politics) {
  if (!INTEL_OPERATIONS.includes(operationType)) fail('INVALID_OPERATION');
  const cfg = politics?.intel?.operations?.[operationType] ?? fail('INVALID_OPERATION');
  const agent = state.agents[nationId]?.find((a) => a.id === agentId) ?? fail('INVALID_AGENT');
  if (agent.busyDays > 0) fail('AGENT_BUSY');
  if (!intelTargets(state, nationId).includes(targetNationId)) fail('INVALID_TARGET_NATION');
  if (targetNationId === UNKNOWN_TARGET && operationType !== 'reconnaissance') fail('INVALID_TARGET_NATION');
  const nation = state.nations.find((n) => n.id === nationId);
  if (nation.politicalCapital == null || nation.politicalCapital < cfg.politicalCapitalCost) fail('INSUFFICIENT_POLITICAL_CAPITAL');
  nation.politicalCapital -= cfg.politicalCapitalCost;
  agent.busyDays = cfg.cooldownDays;
  const success = random(state) < cfg.successChance;
  let detail = null;
  if (success) {
    if (operationType === 'reconnaissance') {
      // REVEAL_TRIGGERS : intel_operation_success / reconnaissance (§10)
      if (targetNationId === UNKNOWN_TARGET) {
        const hidden = state.nations.filter((n) => n.id !== nationId && nationVisibility(state, nationId, n.id) === 'hidden');
        const pick = hidden[Math.floor(random(state) * hidden.length)];
        reveal(state, map, nationId, pick.id, 'partially_known');
        detail = pick.id;
      } else {
        reveal(state, map, nationId, targetNationId, 'known');
      }
    } else if (operationType === 'sabotage') {
      const target = state.nations.find((n) => n.id === targetNationId);
      const [eq] = Object.entries(target.equipmentStockpile ?? {}).sort((a, b) => b[1] - a[1])[0] ?? [];
      if (eq) { target.equipmentStockpile[eq] *= 1 - cfg.equipmentLossPct / 100; detail = eq; }
    } else if (operationType === 'support_faction') {
      const target = state.nations.find((n) => n.id === targetNationId);
      if (target.stability != null) target.stability = Math.max(0, target.stability + cfg.stabilityDelta);
    }
  }
  const entry = { date: formatDate(state.date), nationId, operationType, targetNationId, success, detail };
  state.intelLog.push(entry);
  addJournal(state, { visibleTo: [nationId], category: 'intel', textKey: success ? 'journal.intelSuccess' : 'journal.intelFailure', vars: { operation: operationType, target: targetNationId } });
  return entry;
}

export function intelDay(state) {
  for (const list of Object.values(state.agents ?? {})) for (const a of list) if (a.busyDays > 0) a.busyDays -= 1;
}
