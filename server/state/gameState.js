import { randomBytes } from 'node:crypto';
import { CALENDAR_START, SAVE_FORMAT_VERSION, WALL_FORTIFICATION_LEVEL_DEFAULT } from '../../shared/constants.js';
import { formatDate, parseDate } from '../../shared/calendar.js';
import { initialVisibility, provinceVisibility, nationVisibility } from './fog.js';

const clone = (o) => structuredClone(o);

/** supply_value(state) — MECHANICS_SPEC.md §3.4 (0 division au démarrage). */
export function supplyValue(infrastructureLevel, frontlineDivisionsInState = 0) {
  if (infrastructureLevel == null) return null;
  return Math.min(1, Math.max(0, 0.5 + 0.1 * infrastructureLevel - 0.05 * frontlineDivisionsInState));
}

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
      factories: s.factories ?? [],
      isWallState,
    };
  });
}

function buildNation(n) {
  return {
    ...clone(n),
    activeResearch: [],
    activeFocusId: null,
    focusDaysRemaining: 0,
    completedFocusIds: [],
  };
}

/**
 * Crée une partie — FEATURES_SPEC.md §0.4 : GameState initialisé depuis les valeurs par défaut de
 * MECHANICS_SPEC.md, CALENDAR_START et GameSettings.historicalMode (immuable ensuite, §0).
 */
export function createGame({ nationId, historicalMode }, { nations, map }) {
  const playable = nations.filter((n) => n.isPlayable).map((n) => n.id);
  if (!playable.includes(nationId)) throw Object.assign(new Error('Nation inconnue'), { code: 'INVALID_NATION' });
  if (typeof historicalMode !== 'boolean') {
    throw Object.assign(new Error('historicalMode doit être un booléen'), { code: 'INVALID_HISTORICAL_MODE' });
  }
  const gameNations = nations.map(buildNation);
  return {
    settings: Object.freeze({ historicalMode, nationId }),
    date: { ...CALENDAR_START },
    speed: 0,
    rngSeed: randomBytes(8).toString('hex'),
    nations: gameNations,
    states: buildStates(map),
    divisions: [],
    activeEvents: [],
    visibility: initialVisibility(gameNations, map),
    daysSinceAutosave: 0,
  };
}

/**
 * Vue filtrée envoyée au client d'une nation. Le filtrage se fait côté serveur : une nation
 * sous brouillard (Paradis) ne reçoit jamais le nom, le propriétaire ni les stats d'une
 * province ou d'une nation qu'elle ne connaît pas.
 */
export function viewFor(state, viewerId, map) {
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
      controllerId: st?.controllerId ?? null,
      infrastructureLevel: st?.infrastructureLevel ?? null,
      resourceDeposits: st?.resourceDeposits ?? null,
      fortificationLevel: st?.fortificationLevel ?? null,
      isWallState: st?.isWallState ?? false,
      formerPureTitanTerritory: Boolean(p.formerPureTitanTerritory),
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
  };
}

/**
 * SaveFile — MECHANICS_SPEC.md §11.
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
  for (const n of nations) n.completedFocusIds = [...(save.focuses_completed_by_nation?.[n.id] ?? n.completedFocusIds ?? [])];
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
  };
}
