// Formules de MECHANICS_SPEC.md §3, reprises telles quelles. Fonctions pures, partagées par le
// serveur (simulation) et le client (aperçus affichés avant confirmation).
import {
  BASE_OUTPUT_PER_MILITARY_FACTORY_PER_DAY, EFFICIENCY_START, EFFICIENCY_GAIN_PER_DAY, EFFICIENCY_CAP,
  EFFICIENCY_LOSS_ON_REASSIGN, BASE_YIELD_PER_DEPOSIT_POINT, RESOURCE_TYPES,
} from './constants.js';

/** §3.3 daily_output(line) */
export function dailyOutput(line) {
  return line.assignedFactoryIds.length * BASE_OUTPUT_PER_MILITARY_FACTORY_PER_DAY[line.equipmentType] * line.efficiency;
}

/** §3.3 rampe linéaire plafonnée */
export function efficiencyAfterDay(efficiency) {
  return Math.min(EFFICIENCY_CAP, efficiency + EFFICIENCY_GAIN_PER_DAY);
}

/** §3.3 pénalité fixe à chaque changement d'usines ; plancher = EFFICIENCY_START (plage 0.15-1.0, §2). */
export function efficiencyAfterReassign(efficiency) {
  return Math.max(EFFICIENCY_START, efficiency - EFFICIENCY_LOSS_ON_REASSIGN);
}

/** §3.4 */
export function infrastructureBuildCost(currentLevel) {
  return 5 * (currentLevel + 1);
}

/** §3.5 state_daily_output(resource) ; null si les gisements de l'état ne sont pas renseignés. */
export function stateDailyOutput(state, resource) {
  const deposit = state.resourceDeposits?.[resource];
  if (deposit == null) return null;
  return deposit * BASE_YIELD_PER_DEPOSIT_POINT[resource] * (1 + 0.05 * (state.infrastructureLevel ?? 0));
}

export function stateDailyOutputs(state) {
  return Object.fromEntries(RESOURCE_TYPES.map((r) => [r, stateDailyOutput(state, r) ?? 0]));
}
