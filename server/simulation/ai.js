// [EXTENSION] IA des nations non jouées (cahier des charges §6 : « comportement scripté simplifié »).
// Les specs n'en décrivent pas les règles ; celles-ci sont volontairement simples et lisibles :
//  - économie : un focus, des recherches, des lignes pour l'équipement de ses modèles, des usines ;
//  - armée : recrute tant que les effectifs et l'équipement le permettent ;
//  - guerre : attaque la province ennemie voisine la moins défendue, débarque si aucune frontière.
// HISTORICAL_EVENT_CHAIN §0 : en Mode historique, l'IA ne prend pas les focus d'évitement et ne
// déclare aucune guerre d'elle-même (elle suit le cours historique). En Mode libre, une rivalité
// marquée peut dégénérer en guerre.
import { nextRandom } from '../../shared/rng.js';
import { researchSlotCount, researchDays } from '../../shared/research.js';
import { startFocus, focusBlockers } from './focus.js';
import { assignResearch, researchBlocker } from './research.js';
import { createLine, assignFactories, nationFactories, controlledStates, queueNewFactory, factorySlots } from './economy.js';
import { createDivision, orderDivision, atWar, provinceController, divisionCostCheck } from './military.js';
import { actionBlocker, diplomaticAction, relation } from './diplomacy.js';

/** Focus jamais choisis par l'IA : arme de fin de partie (choix du joueur uniquement). */
const AI_FORBIDDEN_FOCUS = new Set(['PARADIS_WALLS_AWAKEN']);
const AI_WAR_CHANCE_PER_WEEK = 0.005;

function random(state) {
  const [v, next] = nextRandom(state.rngState);
  state.rngState = next;
  return v;
}

const tryDo = (fn) => { try { return fn(); } catch { return null; } };

function enemiesOf(state, nationId) {
  return (state.wars ?? []).filter(([a, b]) => a === nationId || b === nationId).map(([a, b]) => (a === nationId ? b : a));
}

function weeklyEconomy(state, nationId, data) {
  const nation = state.nations.find((n) => n.id === nationId);
  const { focuses = [], technologies = [], economyRules, politics } = data;

  // Focus : premier focus disponible, dans l'ordre de l'arbre (haut en bas, gauche à droite).
  if (!nation.activeFocusId) {
    const pick = focuses
      .filter((f) => f.nationId === nationId && !AI_FORBIDDEN_FOCUS.has(f.id))
      .filter((f) => !(state.settings.historicalMode && (f.avertsEventId || f.delaysEventId)))
      .filter((f) => focusBlockers(state, nation, f).length === 0)
      .sort((a, b) => a.y - b.y || a.x - b.x)[0];
    if (pick) tryDo(() => startFocus(state, nationId, pick.id, focuses, politics));
  }

  // Recherche : chaque slot libre reçoit la technologie disponible la plus rapide.
  const slots = researchSlotCount(nation) ?? 0;
  for (let i = 0; i < slots; i++) {
    if (nation.activeResearch.some((r) => r.slotIndex === i)) continue;
    const tech = technologies.filter((t) => !researchBlocker(nation, t)).sort((a, b) => researchDays(a, nation) - researchDays(b, nation))[0];
    if (!tech) break;
    tryDo(() => assignResearch(state, nationId, tech.id, i, technologies));
  }

  // Production : une ligne par équipement utilisé par ses modèles ; chaque usine militaire libre va
  // à la ligne dont le stock est le plus faible.
  const needs = new Set(state.templates.filter((t) => t.nationId === nationId).flatMap((t) => Object.keys(t.computedStats?.equipmentCost ?? {})));
  for (const eq of needs) {
    if (!state.productionLines.some((l) => l.nationId === nationId && l.equipmentType === eq) && !nation.lockedEquipment?.includes(eq)) {
      tryDo(() => createLine(state, nationId, eq));
    }
  }
  const lines = state.productionLines.filter((l) => l.nationId === nationId);
  const free = nationFactories(state, nationId).filter((f) => f.type === 'military' && !f.assignedLineId);
  if (free.length && lines.length) {
    const line = lines.sort((a, b) => (nation.equipmentStockpile[a.equipmentType] ?? 0) - (nation.equipmentStockpile[b.equipmentType] ?? 0))[0];
    tryDo(() => assignFactories(state, nationId, line.id, [...line.assignedFactoryIds, free[0].id]));
  }

  // Construction : file vide → une usine dans l'état le mieux équipé, en alternant les types.
  if (!(state.constructionQueues[nationId]?.length)) {
    const queued = (sid) => (state.constructionQueues[nationId] ?? []).filter((p) => p.stateId === sid).length;
    const st = controlledStates(state, nationId)
      .filter((s) => s.infrastructureLevel != null && s.factories.length + queued(s.id) < (factorySlots(s, economyRules) ?? Infinity))
      .sort((a, b) => b.infrastructureLevel - a.infrastructureLevel)[0];
    const all = nationFactories(state, nationId);
    const type = all.filter((f) => f.type === 'military').length < all.filter((f) => f.type === 'civilian').length ? 'military' : 'civilian';
    if (st) tryDo(() => queueNewFactory(state, nationId, st.id, type, economyRules));
  }
}

function recruit(state, nationId, map) {
  const nation = state.nations.find((n) => n.id === nationId);
  const own = state.divisions.filter((d) => d.nationId === nationId).length;
  const cap = Math.max(4, Object.values(state.provinceControl).filter((c) => c === nationId).length);
  if (own >= cap) return;
  const tpl = state.templates.filter((t) => t.nationId === nationId).find((t) => divisionCostCheck(nation, t).missing.length === 0);
  if (!tpl) return;
  const enemies = enemiesOf(state, nationId);
  const provinces = Object.entries(state.provinceControl).filter(([, c]) => c === nationId).map(([p]) => p);
  // En guerre : au front ; sinon dans la première province contrôlée.
  const frontline = provinces.find((p) => (map.adjacency?.[p] ?? []).some((n) => enemies.includes(provinceController(state, n))));
  tryDo(() => createDivision(state, nationId, tpl.id, frontline ?? provinces[0]));
}

function maybeStartWar(state, nationId, data) {
  if (state.settings.historicalMode) return; // HISTORICAL_EVENT_CHAIN §0
  const nation = state.nations.find((n) => n.id === nationId);
  if (enemiesOf(state, nationId).length || (nation.warSupport ?? 0) < 60) return;
  // But de guerre prêt : déclaration.
  const ready = state.wargoals.find((w) => w.nationId === nationId && w.daysRemaining <= 0);
  if (ready) { tryDo(() => diplomaticAction(state, nationId, ready.targetId, 'declare_war')); return; }
  if (state.wargoals.some((w) => w.nationId === nationId)) return;
  const mine = state.divisions.filter((d) => d.nationId === nationId).length;
  const rivals = state.nations.filter((n) => n.id !== nationId && relation(state, nationId, n.id) <= -50
    && mine >= 1.5 * Math.max(1, state.divisions.filter((d) => d.nationId === n.id).length)
    && !actionBlocker(state, nationId, n.id, 'justify_wargoal'));
  if (rivals.length && random(state) < AI_WAR_CHANCE_PER_WEEK) {
    tryDo(() => diplomaticAction(state, nationId, rivals[0].id, 'justify_wargoal'));
  }
}

function dailyMilitary(state, nationId, data, getMods) {
  const { map, militaryRules } = data;
  const enemies = enemiesOf(state, nationId);
  if (!enemies.length) return;
  const defenders = (pid) => state.divisions.filter((d) => d.locationProvinceId === pid && d.nationId !== nationId).length;
  let invasionLaunched = state.divisions.some((d) => d.nationId === nationId && d.movement?.naval);
  for (const d of state.divisions.filter((x) => x.nationId === nationId)) {
    if (d.movement || d.amphibious) continue;
    if (d.organization < 30) { if (d.order === 'advance') tryDo(() => orderDivision(state, map, nationId, d.id, 'hold', null, militaryRules, getMods)); continue; }
    if (d.order === 'advance' || d.organization < 60) continue;
    const land = (map.adjacency?.[d.locationProvinceId] ?? []).filter((p) => enemies.includes(provinceController(state, p)));
    if (land.length) {
      const target = land.sort((a, b) => defenders(a) - defenders(b) || a.localeCompare(b))[0];
      tryDo(() => orderDivision(state, map, nationId, d.id, 'advance', target, militaryRules, getMods));
      continue;
    }
    // Pas de frontière terrestre : un débarquement à la fois.
    const sea = (map.seaAdjacency?.[d.locationProvinceId] ?? []).filter((p) => enemies.includes(provinceController(state, p)));
    if (sea.length && !invasionLaunched) {
      if (tryDo(() => orderDivision(state, map, nationId, d.id, 'advance', sea[0], militaryRules, getMods))) invasionLaunched = true;
    }
  }
}

/** Décisions quotidiennes d'une nation IA. */
export function aiDay(state, nationId, data, getMods) {
  const weekly = (state.date.day + nationId.length) % 7 === 0;
  if (weekly) {
    weeklyEconomy(state, nationId, data);
    recruit(state, nationId, data.map);
    maybeStartWar(state, nationId, data);
  }
  if (data.map?.available) dailyMilitary(state, nationId, data, getMods);
}

export { atWar };
