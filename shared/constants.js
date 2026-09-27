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
