// Militaire — MECHANICS_SPEC.md §6 ; FEATURES_SPEC.md §2 (ordres), §8 (OOB), §13 (fronts/combats).
// Toute action est validée ici (FEATURES §18). Les choix d'interprétation sont listés dans
// docs/PHASE3_GAPS.md (section B).
import {
  BATTALION_TYPES, MAX_TEMPLATE_WIDTH, COMBAT_WIN_THRESHOLD, COMBAT_LOSS_THRESHOLD, RANDOM_FACTOR_RANGE,
  ORG_LOSS_DECISIVE, ORG_LOSS_INCONCLUSIVE, ORG_REGEN_PER_DAY_OUT_OF_COMBAT, PURE_TITAN_ATTRITION_PER_DAY,
  TERRAIN_MODIFIER_DEFAULT, DIVISION_ORDERS,
} from '../../shared/constants.js';
import { computeTemplateStats, attackerPower, defenderPower, resultRatio } from '../../shared/military.js';
import { nextRandom } from '../../shared/rng.js';
import { supplyValue } from '../state/supply.js';
import { nextId } from './economy.js';

const fail = (code, details) => { throw Object.assign(new Error(code), { code, details }); };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------- guerre, contrôle

export const warKey = (a, b) => [a, b].sort().join('|');

export function atWar(state, a, b) {
  return a !== b && (state.wars ?? []).some((w) => warKey(w[0], w[1]) === warKey(a, b));
}

export function provinceController(state, provinceId) {
  return state.provinceControl?.[provinceId] ?? null;
}

/** Contrôle initial : chaque province hérite du contrôleur de son état. */
export function initialProvinceControl(states) {
  const control = {};
  for (const s of states) for (const pid of s.provinceIds) control[pid] = s.controllerId;
  return control;
}

function provinceMeta(map, state, provinceId, rules) {
  const p = map.provinces.find((x) => x.id === provinceId);
  const st = state.states.find((s) => s.id === p?.stateId);
  return {
    terrainModifier: rules?.terrainModifiers?.[p?.terrain] ?? TERRAIN_MODIFIER_DEFAULT,
    isWallFortified: Boolean(st?.isWallState),
    formerPureTitanTerritory: Boolean(p?.formerPureTitanTerritory),
    state: st,
  };
}

const neighbours = (map, provinceId) => map.adjacency?.[provinceId] ?? [];
const seaNeighbours = (map, provinceId) => map.seaAdjacency?.[provinceId] ?? [];

// ---------------------------------------------------------------- modèles (§6.2, FEATURES §8)

export function templateStats(template, rules) {
  return computeTemplateStats(template.battalions, rules?.battalionSpeeds);
}

/** template/save { nationId, template } : création (sans id) ou mise à jour. */
export function saveTemplate(state, nationId, input, rules) {
  const name = String(input?.name ?? '').trim();
  if (!name || name.length > 60) fail('INVALID_TEMPLATE_NAME');
  const battalions = input?.battalions;
  if (!Array.isArray(battalions) || battalions.length === 0) fail('EMPTY_TEMPLATE');
  const merged = {};
  for (const b of battalions) {
    if (!BATTALION_TYPES[b?.battalionType] || !Number.isInteger(b.count) || b.count <= 0) fail('INVALID_BATTALION');
    merged[b.battalionType] = (merged[b.battalionType] ?? 0) + b.count;
  }
  const clean = Object.entries(merged).map(([battalionType, count]) => ({ battalionType, count }));
  const computedStats = computeTemplateStats(clean, rules?.battalionSpeeds);
  if (computedStats.width > MAX_TEMPLATE_WIDTH) fail('TEMPLATE_TOO_WIDE');
  if (input.id) {
    const existing = state.templates.find((t) => t.id === input.id && t.nationId === nationId) ?? fail('INVALID_TEMPLATE');
    Object.assign(existing, { name, battalions: clean, computedStats });
    return existing;
  }
  const template = { id: nextId(state, 'tpl'), nationId, name, battalions: clean, computedStats };
  state.templates.push(template);
  return template;
}

export function deleteTemplate(state, nationId, templateId) {
  const idx = state.templates.findIndex((t) => t.id === templateId && t.nationId === nationId);
  if (idx < 0) fail('INVALID_TEMPLATE');
  if (state.divisions.some((d) => d.templateId === templateId)) fail('TEMPLATE_IN_USE');
  state.templates.splice(idx, 1);
}

// ---------------------------------------------------------------- divisions

/** Coût d'une nouvelle division et manques éventuels (aperçu FEATURES §8 et validation). */
export function divisionCostCheck(nation, template) {
  const stats = template.computedStats;
  const missing = [];
  if (nation.manpower == null) missing.push({ kind: 'manpower', unknown: true });
  else if (nation.manpower < stats.manpowerCost) missing.push({ kind: 'manpower', need: stats.manpowerCost, have: nation.manpower });
  for (const [eq, n] of Object.entries(stats.equipmentCost)) {
    const have = nation.equipmentStockpile?.[eq] ?? 0;
    if (have < n) missing.push({ kind: 'equipment', equipment: eq, need: n, have });
  }
  return { manpowerCost: stats.manpowerCost, equipmentCost: stats.equipmentCost, missing };
}

/** division/create { nationId, templateId, provinceId } (message ajouté, voir PHASE3_GAPS C). */
export function createDivision(state, nationId, templateId, provinceId) {
  const nation = state.nations.find((n) => n.id === nationId) ?? fail('INVALID_NATION');
  const template = state.templates.find((t) => t.id === templateId && t.nationId === nationId) ?? fail('INVALID_TEMPLATE');
  if (provinceController(state, provinceId) !== nationId) fail('INVALID_PROVINCE');
  const check = divisionCostCheck(nation, template);
  if (check.missing.some((m) => m.unknown)) fail('MANPOWER_UNKNOWN');
  if (check.missing.some((m) => m.kind === 'manpower')) fail('INSUFFICIENT_MANPOWER', check.missing);
  if (check.missing.length) fail('INSUFFICIENT_EQUIPMENT', check.missing);
  nation.manpower -= check.manpowerCost;
  for (const [eq, n] of Object.entries(check.equipmentCost)) nation.equipmentStockpile[eq] -= n;
  // Durée d'entraînement non spécifiée : la division est opérationnelle immédiatement.
  const division = {
    id: nextId(state, 'div'), nationId, templateId,
    organization: 100, strength: 100,
    locationProvinceId: provinceId, frontId: null, order: null,
    targetProvinceId: null, movement: null,
  };
  state.divisions.push(division);
  return division;
}

function ownDivision(state, nationId, divisionId) {
  return state.divisions.find((d) => d.id === divisionId && d.nationId === nationId) ?? fail('INVALID_DIVISION');
}

/** Nations en guerre avec `nationId` dont une province touche celle de la division. */
function borderingEnemies(state, map, nationId, provinceId) {
  return [...new Set(neighbours(map, provinceId)
    .map((pid) => provinceController(state, pid))
    .filter((c) => c && atWar(state, nationId, c)))].sort();
}

/** « Set front here » (FEATURES §2) : rattache la division au front face à un ennemi voisin. */
export function setFront(state, map, nationId, divisionId) {
  const d = ownDivision(state, nationId, divisionId);
  const enemies = borderingEnemies(state, map, nationId, d.locationProvinceId);
  if (!enemies.length) fail('NO_FRONT');
  d.frontId = `front:${warKey(nationId, enemies[0])}`;
  return d;
}

/** division/order { nationId, divisionId, order, targetProvinceId? } */
export function orderDivision(state, map, nationId, divisionId, order, targetProvinceId, rules, getMods = () => ({ speedPct: 0 })) {
  const d = ownDivision(state, nationId, divisionId);
  if (!DIVISION_ORDERS.includes(order)) fail('INVALID_ORDER');
  if (order === 'hold') {
    Object.assign(d, { order, targetProvinceId: null, movement: null });
    return d;
  }
  if (order === 'advance' && !neighbours(map, d.locationProvinceId).includes(targetProvinceId)
    && seaNeighbours(map, d.locationProvinceId).includes(targetProvinceId)) {
    return orderNavalInvasion(state, nationId, d, targetProvinceId, rules);
  }
  if (order === 'advance') {
    if (!neighbours(map, d.locationProvinceId).includes(targetProvinceId)) fail('INVALID_TARGET');
    const controller = provinceController(state, targetProvinceId);
    // [EXTENSION] Avancer vers une province amie = se déplacer ; vers un ennemi en guerre = attaquer.
    if (controller === nationId) {
      Object.assign(d, { order, targetProvinceId, movement: { to: targetProvinceId, daysRemaining: movementDays(state, d, rules, getMods) } });
      return d;
    }
    if (!atWar(state, nationId, controller)) fail('NOT_AT_WAR');
    Object.assign(d, { order, targetProvinceId, movement: null });
    return d;
  }
  // retreat : déplacement vers une province voisine contrôlée.
  const options = neighbours(map, d.locationProvinceId).filter((pid) => provinceController(state, pid) === nationId);
  const to = targetProvinceId ?? options[0];
  if (!to || !options.includes(to)) fail('NO_RETREAT_PATH');
  Object.assign(d, { order, targetProvinceId: to, movement: { to, daysRemaining: movementDays(state, d, rules, getMods) } });
  return d;
}

/**
 * [EXTENSION] Débarquement par une route maritime (data/military_rules.json → navalInvasion) :
 * consomme des coques légères, transit de quelques jours, puis assaut amphibie.
 */
function orderNavalInvasion(state, nationId, d, targetProvinceId, rules) {
  const cfg = rules?.navalInvasion ?? fail('MOVEMENT_RULES_MISSING');
  if (!atWar(state, nationId, provinceController(state, targetProvinceId))) fail('NOT_AT_WAR');
  const nation = state.nations.find((n) => n.id === nationId);
  if (Object.keys(cfg.hullCostPerDivision).some((eq) => nation.lockedEquipment?.includes(eq))) fail('NO_NAVY');
  const missing = Object.entries(cfg.hullCostPerDivision).filter(([eq, n]) => (nation.equipmentStockpile?.[eq] ?? 0) < n);
  if (missing.length) fail('INSUFFICIENT_EQUIPMENT', missing.map(([eq, n]) => ({ kind: 'equipment', equipment: eq, need: n, have: Math.floor(nation.equipmentStockpile?.[eq] ?? 0) })));
  for (const [eq, n] of Object.entries(cfg.hullCostPerDivision)) nation.equipmentStockpile[eq] -= n;
  Object.assign(d, { order: 'advance', targetProvinceId, amphibious: false, movement: { to: targetProvinceId, daysRemaining: cfg.transitDays, naval: true } });
  return d;
}

/**
 * [EXTENSION] Durée d'un déplacement : ceil(distance / vitesse) ; vitesse = computed.speed (§6.2)
 * modulée par les Titans (Féminin, Mâchoire, §7.3). Refus explicite sans règle de mouvement.
 */
export function movementDays(state, d, rules, getMods = () => ({ speedPct: 0 })) {
  const tpl = state.templates.find((x) => x.id === d.templateId);
  const speed = tpl?.computedStats?.speed;
  if (speed && rules?.movementDistancePerProvince) {
    const eff = speed * (1 + (getMods(d.nationId).speedPct ?? 0) / 100);
    return Math.max(1, Math.ceil(rules.movementDistancePerProvince / eff));
  }
  if (rules?.movementDaysPerProvince == null) fail('MOVEMENT_RULES_MISSING');
  return rules.movementDaysPerProvince;
}

// ---------------------------------------------------------------- journée militaire

const NO_MODS = { attackPct: 0, defensePct: 0, siegePct: 0, defenderOrgLossPct: 0, speedPct: 0, supplyFlat: 0 };

function refreshStateControl(state, st) {
  if (!st) return;
  const controllers = new Set(st.provinceIds.map((pid) => provinceController(state, pid)));
  if (controllers.size === 1) st.controllerId = [...controllers][0];
}

/** supply_value (§3.4) recalculé avec les divisions de front présentes dans chaque état. */
function refreshSupply(state, map, getMods) {
  const stateOf = new Map(map.provinces.map((p) => [p.id, p.stateId]));
  const frontline = {};
  for (const d of state.divisions) {
    if (!d.frontId) continue;
    const sid = stateOf.get(d.locationProvinceId);
    frontline[sid] = (frontline[sid] ?? 0) + 1;
  }
  for (const st of state.states) {
    const base = supplyValue(st.infrastructureLevel, frontline[st.id] ?? 0);
    // TITAN_CART : supplyValueFlat +0.1 sur les états de la nation porteuse (§7.3)
    st.supplyValue = base == null ? null : Math.min(1, base + (getMods(st.ownerId).supplyFlat ?? 0));
  }
}

function random(state) {
  const [v, next] = nextRandom(state.rngState);
  state.rngState = next;
  return v;
}

/**
 * Un jour de combat et d'attrition pour toutes les nations.
 * @returns {{ combats: object[], destroyed: object[], captured: object[] }}
 */
export function militaryDay(state, map, rules, getMods = () => NO_MODS) {
  const templates = new Map(state.templates.map((t) => [t.id, t]));
  const stats = (d) => templates.get(d.templateId)?.computedStats ?? { attack: 0, defense: 0 };
  const inCombat = new Set();
  const combats = [];
  const captured = [];
  const destroyed = [];

  // 1. Mouvements (retraites) en cours
  for (const d of state.divisions) {
    if (!d.movement) continue;
    d.movement.daysRemaining -= 1;
    if (d.movement.daysRemaining <= 0 && d.movement.naval) {
      // Fin du transit : la division reste en mer et donne l'assaut à la côte visée.
      Object.assign(d, { movement: null, amphibious: true });
      continue;
    }
    if (d.movement.daysRemaining <= 0) {
      if (provinceController(state, d.movement.to) === d.nationId) d.locationProvinceId = d.movement.to;
      Object.assign(d, { movement: null, order: 'hold', targetProvinceId: null });
    }
  }

  // 2. Attaques : divisions en « advance » dont la cible est toujours valide
  const attacksByProvince = new Map();
  for (const d of state.divisions) {
    if (d.order !== 'advance' || d.movement) continue;
    const target = d.targetProvinceId;
    const reachable = neighbours(map, d.locationProvinceId).includes(target)
      || (d.amphibious && seaNeighbours(map, d.locationProvinceId).includes(target));
    const valid = reachable && atWar(state, d.nationId, provinceController(state, target));
    // Assaut amphibie abandonné : cible perdue ou organisation effondrée (retour au port d'origine).
    const abort = d.amphibious && d.organization < (rules?.navalInvasion?.abortOrganization ?? 0);
    if (!valid || abort) { Object.assign(d, { order: 'hold', targetProvinceId: null, amphibious: false }); continue; }
    if (!attacksByProvince.has(target)) attacksByProvince.set(target, []);
    attacksByProvince.get(target).push(d);
  }

  // 3. Résolution par province disputée (§6.3). Puissances sommées sur les divisions engagées.
  for (const [provinceId, attackers] of [...attacksByProvince].sort(([a], [b]) => a.localeCompare(b))) {
    const controller = provinceController(state, provinceId);
    const meta = provinceMeta(map, state, provinceId, rules);
    const defenders = state.divisions.filter((d) => d.locationProvinceId === provinceId && d.nationId === controller);
    // Modificateurs (technologies/lois [EXTENSION], Titans §7.3) appliqués à la formule §6.3.
    const fortified = meta.isWallFortified || (meta.state?.fortificationLevel ?? 0) > 0;
    const landing = 1 + (rules?.navalInvasion?.landingAttackPenaltyPct ?? 0) / 100;
    const atkMult = (d) => (1 + getMods(d.nationId).attackPct / 100) * (1 + (fortified ? getMods(d.nationId).siegePct : 0) / 100)
      * (d.amphibious ? landing : 1);
    const defMult = (d) => 1 + getMods(d.nationId).defensePct / 100;
    const atk = attackers.reduce((s, d) => s + attackerPower(d, stats(d)) * atkMult(d), 0);
    const def = defenders.reduce((s, d) => s + defenderPower(d, stats(d), meta) * defMult(d), 0);
    const ratio = resultRatio(atk, def);
    const [lo, hi] = RANDOM_FACTOR_RANGE;
    const randomFactor = lo + (hi - lo) * random(state);
    const outcome = ratio * randomFactor;
    const result = outcome > COMBAT_WIN_THRESHOLD ? 'attacker_wins' : outcome < COMBAT_LOSS_THRESHOLD ? 'defender_holds' : 'inconclusive';
    for (const d of [...attackers, ...defenders]) inCombat.add(d.id);

    const powerByNation = {};
    for (const d of attackers) powerByNation[d.nationId] = (powerByNation[d.nationId] ?? 0) + attackerPower(d, stats(d)) * atkMult(d);
    const winner = Object.entries(powerByNation).sort((a, b) => b[1] - a[1])[0][0];
    // TITAN_COLOSSAL : defenderOrgLossOnAttackPct +5 (§7.3)
    const defLoss = (base) => base * (1 + getMods(winner).defenderOrgLossPct / 100);

    if (result === 'attacker_wins') for (const d of defenders) d.organization = clamp(d.organization - defLoss(ORG_LOSS_DECISIVE), 0, 100);
    else if (result === 'defender_holds') for (const d of attackers) d.organization = clamp(d.organization - ORG_LOSS_DECISIVE, 0, 100);
    else {
      for (const d of attackers) d.organization = clamp(d.organization - ORG_LOSS_INCONCLUSIVE, 0, 100);
      for (const d of defenders) d.organization = clamp(d.organization - defLoss(ORG_LOSS_INCONCLUSIVE), 0, 100);
    }

    combats.push({
      provinceId, attackerNationId: winner, defenderNationId: controller,
      attackerIds: attackers.map((d) => d.id), defenderIds: defenders.map((d) => d.id),
      attackerPower: atk, defenderPower: def, resultRatio: ratio, randomFactor, outcome, result,
      terrainModifier: meta.terrainModifier, isWallFortified: meta.isWallFortified,
      attackerModifierPct: Math.round((atkMult(attackers[0]) - 1) * 100),
      defenderModifierPct: defenders.length ? Math.round((defMult(defenders[0]) - 1) * 100) : 0,
    });

    if (result === 'attacker_wins') {
      state.provinceControl[provinceId] = winner;
      captured.push({ provinceId, from: controller, to: winner });
      // Défenseurs chassés vers une province voisine amie, détruits s'il n'y en a aucune (encerclement).
      for (const d of defenders) {
        const escape = neighbours(map, provinceId).find((pid) => provinceController(state, pid) === d.nationId);
        if (escape) Object.assign(d, { locationProvinceId: escape, order: 'hold', targetProvinceId: null, movement: null });
        else d.strength = 0;
      }
      for (const d of attackers) {
        if (d.nationId === winner) d.locationProvinceId = provinceId;
        Object.assign(d, { order: 'hold', targetProvinceId: null, amphibious: false });
      }
      refreshStateControl(state, meta.state);
    }
  }

  // 4. Récupération d'organisation hors combat, attrition (§6.4 ; ravitaillement si chiffré)
  const supplyOf = new Map(map.provinces.map((p) => [p.id, state.states.find((s) => s.id === p.stateId)?.supplyValue ?? null]));
  const hazard = new Set(map.provinces.filter((p) => p.formerPureTitanTerritory || state.dynamicHazards?.[p.id]).map((p) => p.id));
  for (const d of state.divisions) {
    if (!inCombat.has(d.id)) d.organization = clamp(d.organization + ORG_REGEN_PER_DAY_OUT_OF_COMBAT, 0, 100);
    if (hazard.has(d.locationProvinceId)) d.strength = clamp(d.strength - PURE_TITAN_ATTRITION_PER_DAY * 100, 0, 100);
    const sv = supplyOf.get(d.locationProvinceId);
    if (rules?.supplyAttritionPerDay != null && sv != null && sv < 0.5) {
      d.strength = clamp(d.strength - rules.supplyAttritionPerDay * 100, 0, 100);
    }
    // [EXTENSION] Renforts hors combat : consomment équipement et effectifs du modèle.
    if (rules?.reinforcementPerDay && !inCombat.has(d.id) && d.strength < 100 && !hazard.has(d.locationProvinceId)) {
      const tpl = templates.get(d.templateId);
      const nation = state.nations.find((n) => n.id === d.nationId);
      const f = rules.reinforcementPerDay;
      const eqNeed = Object.entries(tpl?.computedStats?.equipmentCost ?? {}).map(([eq, n]) => [eq, n * f]);
      const mpNeed = (tpl?.computedStats?.manpowerCost ?? 0) * f;
      const ok = nation && eqNeed.every(([eq, n]) => (nation.equipmentStockpile?.[eq] ?? 0) >= n) && (nation.manpower ?? 0) >= mpNeed;
      if (ok) {
        for (const [eq, n] of eqNeed) nation.equipmentStockpile[eq] -= n;
        nation.manpower -= mpNeed;
        d.strength = clamp(d.strength + f * 100, 0, 100);
      }
    }
  }

  // 5. Divisions à effectif nul : détruites
  for (const d of state.divisions.filter((x) => x.strength <= 0)) destroyed.push({ id: d.id, nationId: d.nationId, provinceId: d.locationProvinceId });
  state.divisions = state.divisions.filter((x) => x.strength > 0);

  refreshSupply(state, map, getMods);
  state.lastCombats = combats;
  return { combats, destroyed, captured };
}
