// Valeurs reprises telles quelles de docs/MECHANICS_SPEC.md.
// Règle du document : changer une valeur = mettre à jour la spec, pas une constante ad hoc.

/** MECHANICS_SPEC.md §1 */
export const CALENDAR_START = { day: 1, month: 1, year: 844 };

/** MECHANICS_SPEC.md §1 — real_seconds_per_tick null = pause */
export const SPEED_LEVELS = [
  { id: 0, label: 'pause', realSecondsPerTick: null },
  { id: 1, label: '1x', realSecondsPerTick: 2.0 },
  { id: 2, label: '2x', realSecondsPerTick: 1.0 },
  { id: 3, label: '3x', realSecondsPerTick: 0.5 },
  { id: 4, label: '4x', realSecondsPerTick: 0.15 },
];

/** MECHANICS_SPEC.md §9 */
export const STABILITY_RANGE = [0, 100];
export const WAR_SUPPORT_RANGE = [0, 100];
/** Seul seuil de stabilité défini par §9 (UNREST_EVENT_CHANCE_PER_DAY_BELOW_30_STABILITY). */
export const STABILITY_UNREST_THRESHOLD = 30;

/** MECHANICS_SPEC.md §6.5 */
export const WALL_FORTIFICATION_LEVEL_DEFAULT = 8;

/** MECHANICS_SPEC.md §10 */
export const VISIBILITY_STATES = ['hidden', 'partially_known', 'known'];

/** MECHANICS_SPEC.md §11 */
export const SAVE_FORMAT_VERSION = '1.0';

/** FEATURES_SPEC.md §16 */
export const AUTOSAVE_INTERVAL_DAYS = 5;
export const AUTOSAVE_SLOTS = 3;

/** FEATURES_SPEC.md §0.1 */
export const DEFAULT_PORT = 5173;
export const PORT_MAX_ATTEMPTS = 20;

/** LORE_BIBLE.md §3.3 / MECHANICS_SPEC.md §7.2 */
export const TITAN_POWER_IDS = [
  'TITAN_FOUNDING', 'TITAN_ATTACK', 'TITAN_COLOSSAL', 'TITAN_ARMORED', 'TITAN_FEMALE',
  'TITAN_BEAST', 'TITAN_CART', 'TITAN_JAW', 'TITAN_WARHAMMER',
];

/** FEATURES_SPEC.md §2 — seuls political et fog_of_war relèvent de la Phase 1. */
export const MAP_MODES = ['political', 'resources', 'supply', 'front_combat', 'fog_of_war'];

// ---------------- Phase 2 : économie / production (MECHANICS_SPEC.md §3) ----------------

/** §3.1 */
export const RESOURCE_TYPES = ['steel', 'fuel', 'rareMaterials'];

/** §3.2 */
export const EQUIPMENT_TYPES = [
  'infantry_equipment', 'artillery', 'light_armor', 'medium_armor',
  'fighter_aircraft', 'bomber_aircraft',
  'naval_hull_light', 'naval_hull_heavy',
];
export const BASE_OUTPUT_PER_MILITARY_FACTORY_PER_DAY = {
  infantry_equipment: 3.0, artillery: 1.5, light_armor: 0.8, medium_armor: 0.5,
  fighter_aircraft: 0.6, bomber_aircraft: 0.3,
  naval_hull_light: 0.2, naval_hull_heavy: 0.05,
};
/** §3.2 : verrouillés pour Paradis jusqu'à un effet de focus unlockEquipment. */
export const PARADIS_LOCKED_EQUIPMENT = ['fighter_aircraft', 'bomber_aircraft', 'naval_hull_light', 'naval_hull_heavy'];

/** §3.3 */
export const EFFICIENCY_START = 0.15;
export const EFFICIENCY_GAIN_PER_DAY = 0.01;
export const EFFICIENCY_CAP = 1.0;
export const EFFICIENCY_LOSS_ON_REASSIGN = 0.30;

/** §3.5 */
export const BASE_YIELD_PER_DEPOSIT_POINT = { steel: 1.0, fuel: 1.0, rareMaterials: 1.0 };

// ---------------- Phase 2 : recherche (MECHANICS_SPEC.md §4) ----------------
export const RESEARCH_SLOTS_DEFAULT = { major: 4, minor: 2 };
export const RESEARCH_SLOTS_PARADIS_OVERRIDE = 3;
export const RESEARCH_CATEGORIES = ['infantry', 'artillery', 'armor', 'aviation', 'navy', 'industry', 'doctrine'];
/** §4 : navy et aviation fermées pour Paradis jusqu'à l'effet de focus unlockTech correspondant. */
export const PARADIS_LOCKED_RESEARCH_CATEGORIES = ['aviation', 'navy'];

// ---------------- Phase 3 : militaire (MECHANICS_SPEC.md §6) ----------------
/** §6.1 (aucune vitesse fournie : voir data/military_rules.json → battalionSpeeds) */
export const BATTALION_TYPES = {
  infantry: { attack: 2, defense: 3, width: 1, manpower: 1000, equipmentCost: { infantry_equipment: 36 } },
  artillery: { attack: 5, defense: 1, width: 1, manpower: 300, equipmentCost: { artillery: 12 } },
  light_armor: { attack: 6, defense: 4, width: 2, manpower: 200, equipmentCost: { light_armor: 12 } },
  medium_armor: { attack: 9, defense: 7, width: 3, manpower: 200, equipmentCost: { medium_armor: 12 } },
};
export const MAX_TEMPLATE_WIDTH = 20;

/** §6.3 */
export const COMBAT_WIN_THRESHOLD = 1.15;
export const COMBAT_LOSS_THRESHOLD = 0.85;
export const RANDOM_FACTOR_RANGE = [0.85, 1.15];
export const ORG_LOSS_DECISIVE = 25;
export const ORG_LOSS_INCONCLUSIVE = 10;
export const ORG_REGEN_PER_DAY_OUT_OF_COMBAT = 5;
export const WALL_DEFENSE_BONUS = 0.5;
export const TERRAIN_MODIFIER_DEFAULT = 1.0;

/** §6.4 */
export const PURE_TITAN_ATTRITION_PER_DAY = 0.02;

export const DIVISION_ORDERS = ['hold', 'advance', 'retreat'];

// ---------------- Phase 4 : focus, diplomatie ----------------
/** MECHANICS_SPEC.md §5 */
export const MAX_CONCURRENT_FOCUS = 1;
/** §8 */
export const RELATION_SCALE = [-200, 200];
export const ACTION_COSTS = {
  propose_alliance: { minRelation: 50, politicalCapitalCost: 100 },
  propose_nonaggression: { minRelation: -50, politicalCapitalCost: 40 },
  guarantee_independence: { minRelation: 0, politicalCapitalCost: 60 },
  embargo: { minRelation: null, politicalCapitalCost: 20 },
};
export const WARGOAL_JUSTIFY_DAYS_DEFAULT = 90;
export const WARSCORE_PER_OBJECTIVE_CAPTURED = 10;
export const WARSCORE_PEACE_THRESHOLD = 100;
/** FEATURES §14.3 */
export const JOURNAL_CATEGORIES = ['military', 'diplomacy', 'politics', 'focus', 'titan', 'intel', 'historical_chain'];

// ---------------- Phase 5 : Titans, Guerriers, politique (MECHANICS_SPEC.md §7, §9) ----------------
/** §7.1 */
export const SHIFTER_ACTIVE_LIFESPAN_YEARS = 13;
/** §7.3 (bonus plats, non cumulables : chaque emplacement s'applique une fois) */
export const TITAN_POWER_BONUS = {
  TITAN_FOUNDING: { stabilityRegenPerDay: 1.0 },          // effet complet avec le drapeau de lignée royale, sinon divisé par deux
  TITAN_ATTACK: { focusCostDaysReductionPct: -10 },
  TITAN_COLOSSAL: { siegeBonusPct: 20, defenderOrgLossOnAttackPct: 5 },
  TITAN_ARMORED: { divisionDefensePct: 8 },
  TITAN_FEMALE: { divisionSpeedPct: 10 },
  TITAN_BEAST: { researchBonusCategory: 'doctrine', researchBonusPct: 10 },
  TITAN_CART: { supplyValueFlat: 0.1 },
  TITAN_JAW: { divisionSpeedPct: 15, divisionDefensePct: -5 },
  TITAN_WARHAMMER: { siegeBonusPct: 15 },
};
/** §7.4 */
export const WARRIOR_CANDIDATE_POOL_MAX = 5;
export const CANDIDATE_TRAINING_DAYS = 365;
export const DEFECTION_CHANCE_PER_DAY_BASE = 0.0005;
export const DEFECTION_STABILITY_HIT = -2;
/** §9 */
export const UNREST_EVENT_CHANCE_PER_DAY_BELOW_30_STABILITY = 0.01;
export const LAW_SWITCH_COOLDOWN_DAYS = 90;
export const LAW_CATEGORIES = ['economic_mobilization', 'conscription', 'trade_policy'];
/** §9.3 */
export const ELDIAN_STATUS_MODIFIERS = {
  strict: { marleyanPopStabilityBonus: 5, eldianPopUnrestChancePerDay: 0.02, warriorProgramDefectionMultiplier: 0.5 },
  moderate: { marleyanPopStabilityBonus: 0, eldianPopUnrestChancePerDay: 0.01, warriorProgramDefectionMultiplier: 1.0 },
  relaxed: { marleyanPopStabilityBonus: -5, eldianPopUnrestChancePerDay: 0.002, warriorProgramDefectionMultiplier: 1.5 },
};
/** FEATURES §11 */
export const INTEL_OPERATIONS = ['reconnaissance', 'sabotage', 'support_faction'];
