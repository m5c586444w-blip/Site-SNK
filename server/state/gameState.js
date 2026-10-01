import { randomBytes } from 'node:crypto';
import { CALENDAR_START, SAVE_FORMAT_VERSION, WALL_FORTIFICATION_LEVEL_DEFAULT } from '../../shared/constants.js';
import { formatDate, parseDate } from '../../shared/calendar.js';
import { initialVisibility, provinceVisibility, nationVisibility } from './fog.js';
import { initEconomy, zeroResources, zeroEquipment, controlledStates } from '../simulation/economy.js';
import { supplyValue } from './supply.js';
import { initialProvinceControl, provinceController, templateStats } from '../simulation/military.js';
import { seedFromHex } from '../../shared/rng.js';
import { initialRelations, relation, actionBlocker } from '../simulation/diplomacy.js';
import { focusBlockers } from '../simulation/focus.js';
import { journalFor } from './journal.js';
import { ACTION_COSTS, TITAN_POWER_BONUS, ELDIAN_STATUS_MODIFIERS, WARRIOR_CANDIDATE_POOL_MAX, CANDIDATE_TRAINING_DAYS } from '../../shared/constants.js';
import { initTitans, syncTitanLists } from '../simulation/titans.js';
import { initialLaws, defectionChance } from '../simulation/politics.js';
import { initialAgents, intelTargets } from '../simulation/intel.js';
import { refreshCategoryBonus } from '../simulation/modifiers.js';

const clone = (o) => structuredClone(o);

export { supplyValue };

function buildStates(map) {
  if (!map.available) return [];
  return map.states.map((s) => {
    const isWallState = Boolean(s.isWallState);
    const infrastructureLevel = s.infrastructureLevel ?? null;
    return {
      id: s.id,
      name: s.name,
      ownerId: s.ownerId,
      controllerId: s.controllerId ?? s.ownerId,
      provinceIds: s.provinceIds ?? [],
      infrastructureLevel,
      fortificationLevel: s.fortificationLevel ?? (isWallState ? WALL_FORTIFICATION_LEVEL_DEFAULT : null),
      resourceDeposits: s.resourceDeposits ?? null,
      supplyValue: supplyValue(infrastructureLevel),
      factories: (s.factories ?? []).map((f) => ({ id: f.id, type: f.type, stateId: s.id, assignedLineId: null })),
      isWallState,
      wallRing: s.wallRing ?? null,
    };
  });
}

function buildNation(n, economyRules) {
  const nation = {
    ...clone(n),
    categoryBonus: clone(n.categoryBonus ?? {}),
    baseCategoryBonus: clone(n.categoryBonus ?? {}),
    baselineStability: n.stability ?? null,
    modifiers: {},
    flags: clone(n.flags ?? {}),
    activeResearch: [],
    completedTechIds: [],
    activeFocusId: null,
    focusDaysRemaining: 0,
    completedFocusIds: [],
  };
  initEconomy(nation, economyRules);
  return nation;
}

/**
 * Crée une partie — FEATURES_SPEC.md §0.4 : GameState initialisé depuis les valeurs par défaut de
 * MECHANICS_SPEC.md, CALENDAR_START et GameSettings.historicalMode (immuable ensuite, §0).
 */
export function createGame({ nationId, historicalMode, humanNations = null }, { nations, map, economyRules = null, militaryRules = null, scenario = null, diplomacyRules = null, politics = null }) {
  const playable = nations.filter((n) => n.isPlayable).map((n) => n.id);
  if (!playable.includes(nationId)) throw Object.assign(new Error('Nation inconnue'), { code: 'INVALID_NATION' });
  if (typeof historicalMode !== 'boolean') {
    throw Object.assign(new Error('historicalMode doit être un booléen'), { code: 'INVALID_HISTORICAL_MODE' });
  }
  const gameNations = nations.map((n) => buildNation({ ...n, ...(scenario?.nationOverrides?.[n.id] ?? {}) }, economyRules));
  const states = buildStates(map);
  const rngSeed = randomBytes(8).toString('hex');
  const game = {
    settings: Object.freeze({ historicalMode, nationId }),
    date: { ...CALENDAR_START },
    speed: 0,
    rngSeed,
    rngState: seedFromHex(rngSeed),
    nations: gameNations,
    states,
    divisions: [],
    activeEvents: [],
    visibility: initialVisibility(gameNations, map),
    daysSinceAutosave: 0,
    productionLines: [],
    constructionQueues: {},
    nextId: 1,
    lastDailyNet: {},
    templates: [],
    provinceControl: initialProvinceControl(states),
    wars: [],
    warInfo: {},
    lastCombats: [],
    relations: initialRelations(gameNations, diplomacyRules),
    agreements: [],
    wargoals: [],
    diplomacyLog: [],
    eventLog: {},
    pendingEvents: [],
    journal: [],
    journalSeq: 0,
    dynamicHazards: {},
    humanNations: humanNations ?? [nationId],
    titans: initTitans(gameNations, politics),
    laws: initialLaws(gameNations, politics),
    lawCooldowns: {},
    warriorProgram: { candidates: [] },
    agents: initialAgents(gameNations, politics),
    intelLog: [],
    pendingInheritances: [],
  };
  syncTitanLists(game);
  refreshCategoryBonus(game, politics);
  for (const [a, b] of scenario?.startingWars ?? []) {
    game.wars.push([a, b]);
    game.warInfo[[a, b].sort().join('|')] = { attacker: a, defender: b, startDate: '01/01/an-844', warscore: { [a]: 0, [b]: 0 } };
  }
  applyStartingOrderOfBattle(game, scenario, militaryRules);
  return game;
}

/** Modèles et divisions de départ (data/scenario.json ; vides tant que les specs ne les donnent pas). */
function applyStartingOrderOfBattle(game, scenario, militaryRules) {
  for (const t of scenario?.startingTemplates ?? []) {
    game.templates.push({ ...clone(t), computedStats: templateStats(t, militaryRules) });
  }
  for (const d of scenario?.startingDivisions ?? []) {
    game.divisions.push({
      organization: 100, strength: 100, frontId: null, order: null, targetProvinceId: null, movement: null, ...clone(d),
    });
  }
}

/**
 * Vue filtrée envoyée au client d'une nation. Le filtrage se fait côté serveur : une nation
 * sous brouillard (Paradis) ne reçoit jamais le nom, le propriétaire ni les stats d'une
 * province ou d'une nation qu'elle ne connaît pas.
 */
export function viewFor(state, viewerId, map, { technologies = [], economyRules = null, focuses = [], focusBranches = {}, events = [], politics = null } = {}) {
  const statesById = new Map(state.states.map((s) => [s.id, s]));
  const provinces = (map.available ? map.provinces : []).map((p) => {
    const visibility = provinceVisibility(state, viewerId, p.id);
    const base = { id: p.id, color: p.color, visibility };
    if (visibility !== 'known') return base;
    const st = statesById.get(p.stateId);
    return {
      ...base,
      name: p.name,
      stateId: p.stateId ?? null,
      stateName: st?.name ?? null,
      ownerId: st?.ownerId ?? null,
      controllerId: provinceController(state, p.id) ?? st?.controllerId ?? null,
      infrastructureLevel: st?.infrastructureLevel ?? null,
      resourceDeposits: st?.resourceDeposits ?? null,
      fortificationLevel: st?.fortificationLevel ?? null,
      isWallState: st?.isWallState ?? false,
      supplyValue: st?.supplyValue ?? null,
      formerPureTitanTerritory: Boolean(p.formerPureTitanTerritory || state.dynamicHazards?.[p.id]),
    };
  });
  const nations = state.nations
    .filter((n) => nationVisibility(state, viewerId, n.id) !== 'hidden')
    .map((n) => {
      if (nationVisibility(state, viewerId, n.id) === 'known') return n;
      // partially_known : territoire approximatif, sans statistiques exactes (§10)
      return { id: n.id, name: n.name, colors: n.colors, visibility: 'partially_known' };
    });
  return {
    settings: state.settings,
    viewerId,
    date: formatDate(state.date),
    speed: state.speed,
    fogOfWarEnabled: Boolean(state.visibility[viewerId]),
    map: map.available ? { available: true, hasBackground: Boolean(map.backgroundPath) } : { available: false, reason: map.reason },
    nations,
    provinces,
    economy: economyView(state, viewerId, economyRules),
    technologies,
    military: militaryView(state, viewerId, map),
    ...politicalView(state, viewerId, { focuses, focusBranches, events, politics }),
  };
}

/** Focus, diplomatie, évènements en attente, journal (phase 4) — filtrés pour la nation. */
export function politicalView(state, viewerId, { focuses = [], focusBranches = {}, events = [], politics = null } = {}) {
  const nation = state.nations.find((n) => n.id === viewerId);
  const knownIds = state.nations.map((n) => n.id).filter((id) => id !== viewerId && nationVisibility(state, viewerId, id) === 'known');
  const involves = (x) => x.actor === viewerId || x.target === viewerId || x.a === viewerId || x.b === viewerId;
  return {
    focus: {
      branches: focusBranches[viewerId] ?? {},
      tree: focuses.filter((f) => f.nationId === viewerId).map((f) => ({ ...f, blockers: focusBlockers(state, nation, f) })),
      activeFocusId: nation.activeFocusId,
      focusDaysRemaining: nation.focusDaysRemaining,
      completedFocusIds: nation.completedFocusIds,
    },
    diplomacy: {
      politicalCapital: nation.politicalCapital,
      costs: ACTION_COSTS,
      nations: knownIds.map((id) => ({
        id,
        relation: relation(state, viewerId, id),
        blockers: Object.fromEntries(['propose_alliance', 'propose_nonaggression', 'guarantee_independence', 'embargo', 'justify_wargoal', 'declare_war']
          .map((a) => [a, actionBlocker(state, viewerId, id, a)])),
      })),
      agreements: state.agreements.filter(involves),
      wargoals: state.wargoals.filter((w) => w.nationId === viewerId),
      wars: Object.values(state.warInfo).filter((w) => w.attacker === viewerId || w.defender === viewerId),
      log: state.diplomacyLog.filter(involves),
    },
    pendingEvents: [
      ...state.pendingEvents
        .map((id) => events.find((e) => e.id === id))
        .filter((e) => e && e.nationId === viewerId)
        .map(({ id, title, body, choices, category }) => ({ id, title, body, category, choices: choices.map((c) => ({ label: c.label, effects: c.effects })) })),
      // TITAN_INHERITANCE (§7.5) : évènement dynamique pour la nation héritière
      ...(state.pendingInheritances ?? []).filter((p) => p.nationId === viewerId).map((p) => ({
        id: `TITAN_INHERITANCE:${p.id}`, kind: 'titan_inheritance', titanId: p.titanId, cause: p.cause, category: 'titan',
      })),
    ],
    journal: journalFor(state, viewerId),
    titans: titansView(state, viewerId),
    politics: politicsView(state, viewerId, politics),
    intel: {
      agents: state.agents?.[viewerId] ?? [],
      targets: intelTargets(state, viewerId),
      operations: politics?.intel?.operations ?? {},
      log: (state.intelLog ?? []).filter((x) => x.nationId === viewerId),
    },
    warriorProgram: viewerId === 'marley' ? {
      candidates: state.warriorProgram.candidates,
      poolMax: WARRIOR_CANDIDATE_POOL_MAX,
      trainingDays: CANDIDATE_TRAINING_DAYS,
      defectionChancePerDay: defectionChance(nation),
    } : null,
  };
}

/** Écran des Neuf Titans (FEATURES §7) : « ??? » pour ce que le brouillard cache. */
export function titansView(state, viewerId) {
  return Object.entries(state.titans ?? {}).map(([id, t]) => {
    const own = t.holderNationId === viewerId;
    const holderKnown = own || !t.holderNationId || nationVisibility(state, viewerId, t.holderNationId) === 'known';
    const locKnown = own || (t.provinceId && provinceVisibility(state, viewerId, t.provinceId) === 'known');
    return {
      id,
      holderNationId: holderKnown ? t.holderNationId : '???',
      provinceId: locKnown ? t.provinceId : (t.provinceId ? '???' : null),
      status: holderKnown ? t.status : '???',
      yearsRemaining: own ? Math.round((t.daysRemaining / 365) * 10) / 10 : null,
      holderRole: own ? t.holderRole : null,
      bonus: TITAN_POWER_BONUS[id],
    };
  });
}

/** Écran politique (FEATURES §10). */
export function politicsView(state, viewerId, politics) {
  const nation = state.nations.find((n) => n.id === viewerId);
  return {
    laws: state.laws?.[viewerId] ?? {},
    lawDefs: politics?.laws ?? {},
    cooldowns: state.lawCooldowns?.[viewerId] ?? {},
    eldianStatusPolicy: nation.eldianStatusPolicy ?? null,
    eldianModifiers: ELDIAN_STATUS_MODIFIERS,
  };
}

/**
 * Données militaires visibles par la nation (FEATURES §8, §13). Brouillard : seules les divisions
 * et les combats situés dans une province `known` sont transmis, sauf les divisions du joueur.
 */
export function militaryView(state, viewerId, map) {
  const known = (pid) => provinceVisibility(state, viewerId, pid) === 'known';
  const visibleWars = (state.wars ?? []).filter(([a, b]) => a === viewerId || b === viewerId
    || (nationVisibility(state, viewerId, a) === 'known' && nationVisibility(state, viewerId, b) === 'known'));
  return {
    templates: state.templates.filter((t) => t.nationId === viewerId),
    divisions: state.divisions.filter((d) => d.nationId === viewerId || known(d.locationProvinceId)),
    wars: visibleWars,
    combats: (state.lastCombats ?? []).filter((c) => known(c.provinceId)),
    adjacency: map.available ? map.adjacency : {},
    seaAdjacency: map.available ? map.seaAdjacency ?? {} : {},
  };
}

/** Données économiques propres au joueur (écran production, barre supérieure). */
export function economyView(state, viewerId, economyRules) {
  return {
    productionLines: state.productionLines.filter((l) => l.nationId === viewerId),
    constructionQueue: state.constructionQueues[viewerId] ?? [],
    states: controlledStates(state, viewerId).map((s) => ({
      id: s.id,
      name: s.name,
      civilian: s.factories.filter((f) => f.type === 'civilian').length,
      military: s.factories.filter((f) => f.type === 'military').length,
      factories: s.factories,
    })),
    dailyNet: state.lastDailyNet?.[viewerId] ?? null,
    rules: {
      factoryBuildCost: { civilian: economyRules?.factoryBuildCost?.civilian ?? null, military: economyRules?.factoryBuildCost?.military ?? null },
      factoryConversionCost: economyRules?.factoryConversionCost ?? null,
    },
  };
}

/**
 * SaveFile — MECHANICS_SPEC.md §11.
 * [EXTENSION TECHNIQUE, Phase 2] Les entités ProductionLine (§2) et la file de construction ne
 * figurent pas non plus dans §11 : ajoutées sous `productionLines`, `constructionQueues`, `nextId`.
 * [EXTENSION TECHNIQUE, Phase 3] `templates`, `provinceControl`, `wars`, `rngState` (état du PRNG
 * pour un rejeu déterministe), `lastCombats`.
 * [EXTENSION TECHNIQUE, Phase 4] `warInfo`, `relations`, `agreements`, `wargoals`, `diplomacyLog`,
 * `eventLog`, `pendingEvents`, `journal`, `dynamicHazards`.
 * [EXTENSION TECHNIQUE, Phase 5] `humanNations`, `titans`, `laws`, `lawCooldowns`, `warriorProgram`,
 * `agents`, `intelLog`, `pendingInheritances`.
 * [EXTENSION TECHNIQUE À VALIDER] §11 ne contient ni GameSettings, ni la date courante, ni
 * l'état du brouillard. Sans eux, une sauvegarde rechargée perdrait le mode choisi (pourtant
 * immuable) et repartirait au 01/01/an-844. Ils sont ajoutés sous `settings`, `currentDate`
 * et `visibility`.
 */
export function toSaveFile(state) {
  const focuses = {};
  for (const n of state.nations) focuses[n.id] = [...n.completedFocusIds];
  return {
    formatVersion: SAVE_FORMAT_VERSION,
    savedAtIso: new Date().toISOString(),
    nations: clone(state.nations),
    states: clone(state.states),
    divisions: clone(state.divisions),
    focuses_completed_by_nation: focuses,
    activeEvents: [...state.activeEvents],
    rngSeed: state.rngSeed,
    settings: { ...state.settings },
    currentDate: formatDate(state.date),
    visibility: clone(state.visibility),
    productionLines: clone(state.productionLines),
    constructionQueues: clone(state.constructionQueues),
    nextId: state.nextId,
    templates: clone(state.templates),
    provinceControl: clone(state.provinceControl),
    wars: clone(state.wars),
    rngState: state.rngState,
    lastCombats: clone(state.lastCombats ?? []),
    warInfo: clone(state.warInfo),
    relations: clone(state.relations),
    agreements: clone(state.agreements),
    wargoals: clone(state.wargoals),
    diplomacyLog: clone(state.diplomacyLog),
    eventLog: clone(state.eventLog),
    pendingEvents: [...state.pendingEvents],
    journal: clone(state.journal),
    journalSeq: state.journalSeq,
    dynamicHazards: clone(state.dynamicHazards),
    humanNations: [...(state.humanNations ?? [])],
    titans: clone(state.titans),
    laws: clone(state.laws),
    lawCooldowns: clone(state.lawCooldowns),
    warriorProgram: clone(state.warriorProgram),
    agents: clone(state.agents),
    intelLog: clone(state.intelLog),
    pendingInheritances: clone(state.pendingInheritances),
  };
}

export function fromSaveFile(save) {
  if (!save || save.formatVersion !== SAVE_FORMAT_VERSION) {
    throw Object.assign(new Error('Sauvegarde incompatible'), { code: 'INCOMPATIBLE_SAVE' });
  }
  const s = save.settings;
  if (!s || typeof s.historicalMode !== 'boolean' || typeof s.nationId !== 'string') {
    throw Object.assign(new Error('Sauvegarde incompatible'), { code: 'INCOMPATIBLE_SAVE' });
  }
  const nations = clone(save.nations);
  for (const n of nations) {
    n.completedFocusIds = [...(save.focuses_completed_by_nation?.[n.id] ?? n.completedFocusIds ?? [])];
    // Sauvegardes de Phase 1 : champs économiques absents
    n.resourceStockpile ??= zeroResources();
    n.equipmentStockpile ??= zeroEquipment();
    n.completedTechIds ??= [];
    n.activeResearch ??= [];
    n.categoryBonus ??= {};
    n.lockedEquipment ??= [];
    n.lockedResearchCategories ??= [];
    n.modifiers ??= {};
    n.baseCategoryBonus ??= { ...n.categoryBonus };
    n.flags ??= {};
    n.baselineStability ??= n.stability ?? null;
  }
  return {
    settings: Object.freeze({ historicalMode: s.historicalMode, nationId: s.nationId }),
    date: parseDate(save.currentDate),
    speed: 0,
    rngSeed: save.rngSeed,
    nations,
    states: clone(save.states),
    divisions: clone(save.divisions ?? []),
    activeEvents: [...(save.activeEvents ?? [])],
    visibility: clone(save.visibility ?? {}),
    daysSinceAutosave: 0,
    productionLines: clone(save.productionLines ?? []),
    constructionQueues: clone(save.constructionQueues ?? {}),
    nextId: save.nextId ?? 1,
    lastDailyNet: {},
    templates: clone(save.templates ?? []),
    provinceControl: clone(save.provinceControl ?? initialProvinceControl(save.states ?? [])),
    wars: clone(save.wars ?? []),
    rngState: save.rngState ?? seedFromHex(save.rngSeed),
    lastCombats: clone(save.lastCombats ?? []),
    warInfo: clone(save.warInfo ?? {}),
    relations: clone(save.relations ?? initialRelations(nations, null)),
    agreements: clone(save.agreements ?? []),
    wargoals: clone(save.wargoals ?? []),
    diplomacyLog: clone(save.diplomacyLog ?? []),
    eventLog: clone(save.eventLog ?? {}),
    pendingEvents: [...(save.pendingEvents ?? [])],
    journal: clone(save.journal ?? []),
    journalSeq: save.journalSeq ?? 0,
    dynamicHazards: clone(save.dynamicHazards ?? {}),
    humanNations: [...(save.humanNations ?? [s.nationId])],
    titans: clone(save.titans ?? initTitans(nations, null)),
    laws: clone(save.laws ?? {}),
    lawCooldowns: clone(save.lawCooldowns ?? {}),
    warriorProgram: clone(save.warriorProgram ?? { candidates: [] }),
    agents: clone(save.agents ?? {}),
    intelLog: clone(save.intelLog ?? []),
    pendingInheritances: clone(save.pendingInheritances ?? []),
  };
}
