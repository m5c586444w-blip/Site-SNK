// Économie et production — MECHANICS_SPEC.md §3 ; FEATURES_SPEC.md §4.
// Chaque action est validée ici, même si l'interface l'a déjà désactivée (FEATURES §18).
import {
  EQUIPMENT_TYPES, RESOURCE_TYPES, EFFICIENCY_START,
} from '../../shared/constants.js';
import { dailyOutput, efficiencyAfterDay, efficiencyAfterReassign, stateDailyOutputs } from '../../shared/economy.js';
import { nationModifiers } from './modifiers.js';

const fail = (code, message = code) => { throw Object.assign(new Error(message), { code }); };

export const zeroResources = () => Object.fromEntries(RESOURCE_TYPES.map((r) => [r, 0]));
export const zeroEquipment = () => Object.fromEntries(EQUIPMENT_TYPES.map((e) => [e, 0]));

/** États dont la nation a le contrôle. [CHOIX À VALIDER] Les specs ne disent pas si l'économie suit le propriétaire ou le contrôleur ; on suit le contrôleur. */
export function controlledStates(state, nationId) {
  return state.states.filter((s) => s.controllerId === nationId);
}

export function nationFactories(state, nationId) {
  return controlledStates(state, nationId).flatMap((s) => s.factories);
}

export function nextId(state, prefix) {
  state.nextId = (state.nextId ?? 1) + 1;
  return `${prefix}_${state.nextId}`;
}

function nationOf(state, nationId) {
  return state.nations.find((n) => n.id === nationId) ?? fail('INVALID_NATION');
}

/** Stocks initiaux : data/economy_rules.json, 0 si non renseigné (voir docs/PHASE2_GAPS.md). */
export function initEconomy(nation, rules) {
  const start = rules?.startingStockpiles?.byNation?.[nation.id];
  nation.resourceStockpile = { ...zeroResources(), ...(start?.resources ?? {}) };
  nation.equipmentStockpile = { ...zeroEquipment(), ...(start?.equipment ?? {}) };
}

// ---------------------------------------------------------------- actions joueur

/** Nouvelle ligne de production (message production/newLine, voir PHASE2_GAPS C2). */
export function createLine(state, nationId, equipmentType) {
  const nation = nationOf(state, nationId);
  if (!EQUIPMENT_TYPES.includes(equipmentType)) fail('INVALID_EQUIPMENT');
  if (nation.lockedEquipment?.includes(equipmentType)) fail('EQUIPMENT_LOCKED');
  const line = {
    id: nextId(state, 'line'),
    nationId,
    equipmentType,
    assignedFactoryIds: [],
    efficiency: EFFICIENCY_START,
    daysActive: 0,
  };
  state.productionLines.push(line);
  return line;
}

/**
 * production/assign { nationId, lineId, factoryIds[] } : remplace la liste des usines de la ligne.
 * Toute modification applique EFFICIENCY_LOSS_ON_REASSIGN une fois (§3.3).
 */
export function assignFactories(state, nationId, lineId, factoryIds) {
  if (!Array.isArray(factoryIds) || factoryIds.some((id) => typeof id !== 'string')) fail('INVALID_FACTORIES');
  if (new Set(factoryIds).size !== factoryIds.length) fail('INVALID_FACTORIES');
  const line = state.productionLines.find((l) => l.id === lineId && l.nationId === nationId) ?? fail('INVALID_LINE');
  const owned = new Map(nationFactories(state, nationId).map((f) => [f.id, f]));
  for (const id of factoryIds) {
    const f = owned.get(id) ?? fail('INVALID_FACTORIES');
    if (f.type !== 'military') fail('FACTORY_NOT_MILITARY');
    if (f.assignedLineId && f.assignedLineId !== lineId) fail('FACTORY_BUSY');
  }
  const before = [...line.assignedFactoryIds].sort().join();
  if (before === [...factoryIds].sort().join()) return line;
  for (const id of line.assignedFactoryIds) { const f = owned.get(id); if (f) f.assignedLineId = null; }
  for (const id of factoryIds) owned.get(id).assignedLineId = lineId;
  line.assignedFactoryIds = [...factoryIds];
  line.efficiency = efficiencyAfterReassign(line.efficiency);
  return line;
}

export function deleteLine(state, nationId, lineId) {
  const idx = state.productionLines.findIndex((l) => l.id === lineId && l.nationId === nationId);
  if (idx < 0) fail('INVALID_LINE');
  const owned = new Map(nationFactories(state, nationId).map((f) => [f.id, f]));
  for (const id of state.productionLines[idx].assignedFactoryIds) { const f = owned.get(id); if (f) f.assignedLineId = null; }
  state.productionLines.splice(idx, 1);
}

function queueFor(state, nationId) {
  state.constructionQueues[nationId] ??= [];
  return state.constructionQueues[nationId];
}

/** production/newFactory { nationId, stateId, type } */
export function queueNewFactory(state, nationId, stateId, type, rules) {
  nationOf(state, nationId);
  if (!['civilian', 'military'].includes(type)) fail('INVALID_FACTORY_TYPE');
  const st = controlledStates(state, nationId).find((s) => s.id === stateId) ?? fail('INVALID_STATE');
  const cost = rules?.factoryBuildCost?.[type];
  if (cost == null) fail('FACTORY_COST_MISSING');
  const project = { id: nextId(state, 'proj'), kind: `factory_${type}`, stateId: st.id, cost, progress: 0 };
  queueFor(state, nationId).push(project);
  return project;
}

/** Conversion civile → militaire (FEATURES §4), message production/convertFactory (PHASE2_GAPS C2). */
export function queueConversion(state, nationId, stateId, rules) {
  nationOf(state, nationId);
  const st = controlledStates(state, nationId).find((s) => s.id === stateId) ?? fail('INVALID_STATE');
  const pending = queueFor(state, nationId).filter((p) => p.kind === 'convert' && p.stateId === stateId).length;
  const civilians = st.factories.filter((f) => f.type === 'civilian').length;
  if (civilians - pending <= 0) fail('NO_CIVILIAN_FACTORY');
  const cost = rules?.factoryConversionCost;
  if (cost == null) fail('CONVERSION_COST_MISSING');
  const project = { id: nextId(state, 'proj'), kind: 'convert', stateId: st.id, cost, progress: 0 };
  queueFor(state, nationId).push(project);
  return project;
}

// ---------------------------------------------------------------- tick quotidien

/** Capacité de construction : 1 « civilian-factory-day » par usine civile et par jour (unité de §3.4). */
export function constructionCapacity(state, nationId) {
  return nationFactories(state, nationId).filter((f) => f.type === 'civilian').length;
}

function completeProject(state, nationId, project) {
  const st = state.states.find((s) => s.id === project.stateId);
  if (!st || st.controllerId !== nationId) return; // état perdu entre-temps : projet annulé
  if (project.kind === 'convert') {
    const f = st.factories.find((x) => x.type === 'civilian');
    if (f) f.type = 'military';
  } else {
    st.factories.push({ id: nextId(state, 'fac'), type: project.kind === 'factory_military' ? 'military' : 'civilian', stateId: st.id, assignedLineId: null });
  }
}

/** Un jour d'économie pour une nation. Retourne le bilan net du jour (tooltip de la barre supérieure). */
export function economyDay(state, nationId, rules, politics = null) {
  const nation = nationOf(state, nationId);
  const mods = nationModifiers(state, nationId, politics);

  // 1. Ressources (§3.5). Consommation : aucune règle dans les specs, donc 0.
  // Modificateur [EXTENSION] de rendement (technologies, lois).
  const produced = zeroResources();
  for (const st of controlledStates(state, nationId)) {
    const out = stateDailyOutputs(st);
    for (const r of RESOURCE_TYPES) produced[r] += out[r] * (1 + mods.resourceYieldPct / 100);
  }
  for (const r of RESOURCE_TYPES) nation.resourceStockpile[r] += produced[r];
  const consumed = zeroResources();

  // 2. Construction : la capacité remplit la file dans l'ordre, le surplus passe au projet suivant.
  let capacity = constructionCapacity(state, nationId);
  const queue = queueFor(state, nationId);
  while (capacity > 0 && queue.length) {
    const p = queue[0];
    const used = Math.min(capacity, p.cost - p.progress);
    p.progress += used;
    capacity -= used;
    if (p.progress >= p.cost) { queue.shift(); completeProject(state, nationId, p); }
  }

  // 3. Lignes de production (§3.3) : production au rendement du jour, puis montée en efficacité.
  // [EXTENSION] consommation : chaque usine affectée consomme des ressources ; si le stock ne suffit
  // pas, la production de la ligne est réduite au prorata.
  const cons = rules?.resourceConsumption;
  for (const line of state.productionLines) {
    if (line.nationId !== nationId || line.assignedFactoryIds.length === 0) continue;
    const need = {};
    if (cons) {
      const n = line.assignedFactoryIds.length;
      for (const [r, v] of Object.entries(cons.perAssignedMilitaryFactoryPerDay ?? {})) need[r] = (need[r] ?? 0) + v * n;
      for (const [r, v] of Object.entries(cons.extraByEquipment?.[line.equipmentType] ?? {})) need[r] = (need[r] ?? 0) + v * n;
    }
    let ratio = 1;
    for (const [r, v] of Object.entries(need)) if (v > 0) ratio = Math.min(ratio, nation.resourceStockpile[r] / v);
    ratio = Math.max(0, Math.min(1, ratio));
    for (const [r, v] of Object.entries(need)) { nation.resourceStockpile[r] -= v * ratio; consumed[r] += v * ratio; }
    nation.equipmentStockpile[line.equipmentType] += dailyOutput(line) * ratio * (1 + mods.productionOutputPct / 100);
    line.efficiency = efficiencyAfterDay(line.efficiency);
    line.daysActive += 1;
  }

  return { produced, consumed };
}
