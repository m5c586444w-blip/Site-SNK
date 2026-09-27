# MECHANICS_SPEC.md
STATUS: authoritative default ruleset. Implement these values/formulas as-is. They are original
balancing defaults for this project (not verified figures from any existing game) — treat every
number as a concrete, adjustable baseline, not as something to be invented later or left as a
placeholder. Do not ship a system with a TODO/magic-number gap where this file gives a value.
LINKED DOCS: LORE_BIBLE.md (narrative facts), FEATURES_SPEC.md (UI/interaction layer),
HISTORICAL_EVENT_CHAIN_845_854.md (event chain narrated in full; this file has the implementation
table only — see §5.3).

---

## 0. GAME SETTINGS (chosen at setup, before §1's clock starts)

```
GameSettings {
  historicalMode: boolean   // "Mode historique" vs "Mode libre" — see HISTORICAL_EVENT_CHAIN_845_854.md §0
  nationId: NationId        // the human player's chosen nation, see FEATURES_SPEC.md §0.4
}
```
This is a top-level, game-instance-wide setting (not per-nation) — one value shared by every player
in a multiplayer session, chosen once at game creation and immutable for the rest of that game.

---

## 1. TIME & SIMULATION LOOP

```
TICK_UNIT = 1 in-game day
CALENDAR_START = 01/01/an-844
DATE_FORMAT = "DD/MM/an-YYY"  (no BC/AD; matches setting's own calendar convention)

SPEED_LEVELS = [
  { id: 0, label: "pause",      real_seconds_per_tick: null },
  { id: 1, label: "1x",         real_seconds_per_tick: 2.0 },
  { id: 2, label: "2x",         real_seconds_per_tick: 1.0 },
  { id: 3, label: "3x",         real_seconds_per_tick: 0.5 },
  { id: 4, label: "4x",         real_seconds_per_tick: 0.15 }
]
HOTKEYS = { space: toggle_pause, "1".."4": set_speed_level }
```
Server tick handler MUST process AI nations in a rotating subset per real-time frame (not all 15+
nations synchronously) to keep frame time bounded — see FEATURES_SPEC.md §performance notes.

---

## 2. ENTITIES — CORE DATA SCHEMA

```
State {
  id: string
  name: string
  ownerId: NationId
  controllerId: NationId        // != ownerId while occupied
  provinceIds: string[]
  infrastructureLevel: int       // 0-5
  fortificationLevel: int        // 0-10, meaningful mainly for Paradis Wall states
  resourceDeposits: { steel: int, fuel: int, rareMaterials: int }  // base yield per resource per day
  supplyValue: float             // 0.0-1.0, see §3.4
  factories: Factory[]
}

Factory {
  id: string
  type: "civilian" | "military"
  stateId: string
  assignedLineId: string | null
}

ProductionLine {
  id: string
  nationId: NationId
  equipmentType: string          // see §3.2 catalog
  assignedFactoryIds: string[]
  efficiency: float              // 0.15 - 1.0, see §3.3
  daysActive: int
}

Nation {
  id: string
  name: string
  isPlayable: bool
  stability: float                // 0-100
  warSupport: float               // 0-100
  politicalCapital: int           // accrues over time, spent on diplomacy/laws
  researchSlots: int              // see §4.1
  activeResearch: { techId, daysRemaining }[]
  activeFocusId: string | null
  focusDaysRemaining: int
  completedFocusIds: string[]
  eldianStatusPolicy: "strict" | "moderate" | "relaxed" | null   // Marley only, see §9.3
  fogOfWarEnabled: bool           // true only for Paradis by default
  titanPowersHeld: TitanPowerId[] // subset of the 9 slots, see §7
}

Division {
  id: string, nationId: string, templateId: string
  organization: float  // 0-100, decays in combat, regenerates out of combat
  strength: float       // 0-100 (manpower/equipment fill %)
  locationProvinceId: string
  frontId: string | null
  order: "hold" | "advance" | "retreat" | null
}

DivisionTemplate {
  id: string, nationId: string, name: string
  battalions: { battalionType: string, count: int }[]
  computedStats: { attack, defense, width, speed, manpowerCost, equipmentCost }  // derived, see §6.2
}

Focus {
  id: string, nationId: string, treeBranch: string
  prerequisiteFocusIds: string[]
  costDays: int
  effects: FocusEffect[]
}
FocusEffect = one of:
  { type: "resourceBonus", resource: string, amount: number }
  { type: "unlockTech", techId: string }
  { type: "unlockEquipment", equipmentId: string }
  { type: "triggerEvent", eventId: string }
  { type: "modifyStability", delta: number }
  { type: "modifyWarSupport", delta: number }
  { type: "diplomaticAction", targetNationId: string, action: string }
  { type: "grantTitanPower", titanId: string }   // scripted only, see §7.5

Event {
  id: string, titleKey: string, bodyKey: string
  triggerCondition: string  // evaluated server-side, see §5.3
  choices: { labelKey: string, effects: FocusEffect[] }[]
}
```

---

## 3. ECONOMY

### 3.1 Resources
```
RESOURCE_TYPES = ["steel", "fuel", "rareMaterials"]   // simplified from a 6-resource model on purpose
```
Simplification note: 3 resources chosen deliberately over a larger set to stay legible for a
7v7/10v10 match length; do not expand without an explicit request.

### 3.2 Equipment catalog (baseline, extend per nation as needed)
```
EQUIPMENT_TYPES = [
  "infantry_equipment", "artillery", "light_armor", "medium_armor",
  "fighter_aircraft", "bomber_aircraft",       // locked for Paradis until unlocked via focus
  "naval_hull_light", "naval_hull_heavy"       // locked for Paradis until unlocked via focus
]
BASE_OUTPUT_PER_MILITARY_FACTORY_PER_DAY = {
  infantry_equipment: 3.0, artillery: 1.5, light_armor: 0.8, medium_armor: 0.5,
  fighter_aircraft: 0.6, bomber_aircraft: 0.3,
  naval_hull_light: 0.2, naval_hull_heavy: 0.05
}
```

### 3.3 Production line efficiency
```
EFFICIENCY_START = 0.15
EFFICIENCY_GAIN_PER_DAY = 0.01     // linear ramp
EFFICIENCY_CAP = 1.00
EFFICIENCY_LOSS_ON_REASSIGN = 0.30  // flat penalty applied once when assignedFactoryIds changes

daily_output(line) =
  sum(assignedFactoryIds.length) * BASE_OUTPUT_PER_MILITARY_FACTORY_PER_DAY[line.equipmentType]
  * line.efficiency
```

### 3.4 Infrastructure & supply
```
infrastructure_build_cost(currentLevel) = 5 * (currentLevel + 1)   // in civilian-factory-days
supply_value(state) = clamp(
  0.5 + 0.1 * state.infrastructureLevel - 0.05 * frontlineDivisionsInState, 0.0, 1.0
)
// Divisions with supplyValue < 0.5 in their province suffer the attrition penalty in §6.4.
```

### 3.5 Resource base yields (per state per day, before modifiers)
```
BASE_YIELD_PER_DEPOSIT_POINT = { steel: 1.0, fuel: 1.0, rareMaterials: 1.0 }
state_daily_output(resource) =
  state.resourceDeposits[resource] * BASE_YIELD_PER_DEPOSIT_POINT[resource]
  * (1 + 0.05 * state.infrastructureLevel)
```

---

## 4. RESEARCH

```
RESEARCH_SLOTS_DEFAULT = { major: 4, minor: 2 }
RESEARCH_SLOTS_PARADIS_OVERRIDE = 3   // narrative malus: isolation limits access to outside know-how
CATEGORIES = ["infantry","artillery","armor","aviation","navy","industry","doctrine"]
// "navy" and "aviation" categories are gated OFF for Paradis until the corresponding
// unlockTech focus effect fires (Paradis starts with no navy/air arm per lore §2.1).

research_days(tech) = tech.baseCostDays / (1 + nation.categoryBonus[tech.category])
// categoryBonus default = 0.0 per nation unless granted by a focus effect.
```

---

## 5. FOCUS SYSTEM

```
MAX_CONCURRENT_FOCUS = 1     // per nation, unless a focus effect grants +1 (stack allowed)
focus_completion_check(nation, focus):
  require focus.prerequisiteFocusIds ⊆ nation.completedFocusIds
  require nation.activeFocusId == null (or concurrent slot available)
  on start: nation.activeFocusId = focus.id; nation.focusDaysRemaining = focus.costDays
  on tick: focusDaysRemaining -= 1; if 0 -> apply all focus.effects in order, then
           completedFocusIds.push(focus.id); activeFocusId = null
```

### 5.3 Event trigger evaluation
Event `triggerCondition` is a small boolean expression over Nation/State/Division fields (e.g.
`nation.stability < 30`, `date == "01/01/an-845"`, `nation.completedFocusIds includes "X"`).
Evaluate once per tick, per nation, against all events not yet fired (or repeatable events per an
explicit `repeatable: true` flag not present by default).

**Global historical-mode gate (added this pass):** every event id in the table below is additionally
wrapped as `triggerCondition: "GameSettings.historicalMode == true AND (<event's own condition>)"`.
When `historicalMode` is false, none of them ever evaluate true — this is the entire mechanism behind
"Mode libre" in HISTORICAL_EVENT_CHAIN_845_854.md §0. Do not implement per-event on/off toggles in
addition to this — one global flag is sufficient and matches the design intent.

| Event id | Own trigger condition (before the global gate above) | Avert/delay focus |
|---|---|---|
| `WALL_BREACH_845` | `date == '01/01/an-845'` | `AVERT_BREACH_845` |
| `TROST_CRISIS_850` | `date == '01/01/an-850' AND event.WALL_BREACH_845.fired == true` | `PREVENT_TROST_CRISIS_850` |
| `MARLEY_TITAN_LOSS_850` | `date == '01/01/an-850' AND event.TROST_CRISIS_850.fired == true` | `SECURE_INFILTRATORS_850` (Marley) |
| `PARADIS_COUP_850` | `date == '01/01/an-850'` | `SUPPRESS_COUP_850` (Paradis) |
| `OCEAN_DISCOVERY_850` | `date >= '01/01/an-850' AND date <= '01/01/an-851'` | `DELAY_OCEAN_DISCOVERY` (Paradis, delays only) |
| `MARLEY_MIDEAST_WAR_850_854` | `event.MARLEY_TITAN_LOSS_850.fired == true AND date >= '01/01/an-850'` | none (AI-driven war state, see below) |
| `RUMBLING_854` | `event.MARLEY_MIDEAST_WAR_850_854.resolved == true AND nation('Paradis').titanPowersHeld includes 'TITAN_FOUNDING' AND date >= '01/01/an-854'` | `AVERT_RUMBLING` (Paradis, multi-step focus chain) |

Full paraphrased beat descriptions for each row above live in HISTORICAL_EVENT_CHAIN_845_854.md §1 —
this table is the implementation-ready trigger/avert summary only, not the narrative source.

`MARLEY_MIDEAST_WAR_850_854` resolves over multiple ticks (a multi-year war, not an instant event)
rather than a single trigger; model it as a temporary AI-driven war state between Marley and the
Mid-East Alliance nation(s) rather than a single scripted flag, ending on a warscore/peace-term
threshold per §8, with a soft target end date around an 854 if the simulation is meant to track canon
pacing.

`RUMBLING_854` effects: apply major territory/population losses to affected mainland states, a global
diplomatic shock modifier, and a drastic simulation restructuring for the hit nations — see
HISTORICAL_EVENT_CHAIN_845_854.md §1.7 for tone guidance (effects only, no technical detail).

---

## 6. MILITARY

### 6.1 Battalion baseline stats
```
BATTALION_TYPES = {
  infantry:       { attack: 2,  defense: 3,  width: 1, manpower: 1000, equipmentCost: {infantry_equipment: 36} },
  artillery:      { attack: 5,  defense: 1,  width: 1, manpower: 300,  equipmentCost: {artillery: 12} },
  light_armor:    { attack: 6,  defense: 4,  width: 2, manpower: 200,  equipmentCost: {light_armor: 12} },
  medium_armor:   { attack: 9,  defense: 7,  width: 3, manpower: 200,  equipmentCost: {medium_armor: 12} }
}
MAX_TEMPLATE_WIDTH = 20   // baseline; revisit once playtesting establishes feel
```

### 6.2 Division template computed stats
```
computed.attack  = sum(battalion.attack * count)
computed.defense = sum(battalion.defense * count)
computed.width   = sum(battalion.width * count)
computed.speed   = min(battalion_speeds present)   // slowest component sets division speed
computed.manpowerCost   = sum(battalion.manpower * count)
computed.equipmentCost  = merge-sum(battalion.equipmentCost * count)
```

### 6.3 Combat resolution (land, per combat-day)
```
attacker_power = division.computed.attack * (division.organization/100) * (division.strength/100)
defender_power = division.computed.defense * (division.organization/100) * (division.strength/100)
                 * TERRAIN_MODIFIER[province.terrain]                        // default 1.0 if unset
                 * (1 + 0.5 if province.isWallFortified else 0)              // Wall defense bonus
result_ratio = attacker_power / max(defender_power, 0.01)
random_factor = uniformRandom(0.85, 1.15)
outcome = result_ratio * random_factor
  if outcome > 1.15: attacker wins province, defender.organization -= 25
  elif outcome < 0.85: defender holds, attacker.organization -= 25
  else: inconclusive, both organization -= 10
organization_regen_per_day_out_of_combat = 5   // up to 100
```

### 6.4 Pure Titan hazard (flagged zones only, see LORE_BIBLE.md §3.1)
```
PURE_TITAN_ATTRITION_PER_DAY = 0.02   // 2% strength loss/day for any division stationed/transiting
                                       // in a province flagged "former Pure Titan territory"
// Modifiable later by a "reconnaissance experience" nation-level bonus (extension hook, not yet wired).
```

### 6.5 Wall fortification defaults (Paradis states only)
```
WALL_FORTIFICATION_LEVEL_DEFAULT = 8   // out of 10, reflects lore's very high wall defense
```

---

## 7. TITAN POWERS — NUMERIC LAYER (lore anchor: LORE_BIBLE.md §3.3)

### 7.1 Shifter lifespan
```
SHIFTER_ACTIVE_LIFESPAN_YEARS = 13   // countdown starts at first transformation, per-unit variable
```

### 7.2 Ownership model
```
TitanPowerId = one of the 9 slot ids from LORE_BIBLE.md §3.3
// At most one live holder per slot across the whole game state at any time.
```

### 7.3 Per-slot nation-level bonus (applied while nation holds the slot; flat, non-stacking)
```
TITAN_POWER_BONUS = {
  TITAN_FOUNDING:   { stabilityRegenPerDay: +1.0, note: "full effect requires royal-bloodline flag; else halved" },
  TITAN_ATTACK:     { focusCostDaysReductionPct: -10, note: "CORRECTED from an earlier draft's flat +8% division attack — this slot's lore trait is a memory-link to past/future holders, not combat prowess; modeled here as foresight speeding up focus completion instead" },
  TITAN_COLOSSAL:   { siegeBonusPct: +20, defenderOrgLossOnAttackPct: +5 },
  TITAN_ARMORED:    { divisionDefensePct: +8 },
  TITAN_FEMALE:     { divisionSpeedPct: +10 },
  TITAN_BEAST:      { researchBonusCategory: "doctrine", researchBonusPct: +10 },
  TITAN_CART:       { supplyValueFlat: +0.1, appliesTo: "owning nation's states" },
  TITAN_JAW:        { divisionSpeedPct: +15, divisionDefensePct: -5 },
  TITAN_WARHAMMER:  { siegeBonusPct: +15 }
}
```

### 7.4 Warrior Program (Marley only)
```
WARRIOR_CANDIDATE_POOL_MAX = 5           // concurrent candidates
CANDIDATE_TRAINING_DAYS = 365
DEFECTION_CHANCE_PER_DAY = 0.0005 * (1 - marleyEldianStatusModifier)  // see §9.3
// On defection: candidate removed from pool, small stability hit to Marley (-2).
```

### 7.5 Power transfer
```
on_shifter_death(unit):
  if killed_by_enemy_unit AND enemy_unit.canInherit == true:
     transfer TitanPowerId to enemy_unit.nationId (scripted event, not automatic silent transfer)
     fire event "TITAN_INHERITANCE" with choices for the inheriting nation
  else:
     TitanPowerId becomes unclaimed (lost), remove from TITAN_POWER_BONUS application
```

---

## 8. DIPLOMACY

```
RELATION_SCALE = [-200, 200]
ACTION_COSTS = {
  propose_alliance:      { minRelation: 50,  politicalCapitalCost: 100 },
  propose_nonaggression: { minRelation: -50, politicalCapitalCost: 40 },
  guarantee_independence:{ minRelation: 0,   politicalCapitalCost: 60 },
  embargo:                { minRelation: null, politicalCapitalCost: 20 }
}
WARGOAL_JUSTIFY_DAYS_DEFAULT = 90
warscore_per_objective_captured = 10   // accrues toward a 100-point threshold to force peace terms
```

Fog-of-war interaction (Paradis only, default ON): diplomatic actions targeting a nation not yet
"known" (see §10) are unavailable in the UI until that nation is revealed.

---

## 9. POLITICS

```
STABILITY_RANGE = [0, 100]
WAR_SUPPORT_RANGE = [0, 100]
UNREST_EVENT_CHANCE_PER_DAY_BELOW_30_STABILITY = 0.01
LAW_SWITCH_COOLDOWN_DAYS = 90

LAW_CATEGORIES = ["economic_mobilization", "conscription", "trade_policy"]
```

### 9.3 Eldian status policy (Marley only)
```
ELDIAN_STATUS_MODIFIERS = {
  strict:   { marleyanPopStabilityBonus: +5, eldianPopUnrestChancePerDay: 0.02, warriorProgramDefectionMultiplier: 0.5 },
  moderate: { marleyanPopStabilityBonus: 0,  eldianPopUnrestChancePerDay: 0.01, warriorProgramDefectionMultiplier: 1.0 },
  relaxed:  { marleyanPopStabilityBonus: -5, eldianPopUnrestChancePerDay: 0.002, warriorProgramDefectionMultiplier: 1.5 }
}
// Set via a Marley-only law-like toggle (LAW_SWITCH_COOLDOWN_DAYS applies).
```

---

## 10. FOG OF WAR (Paradis-specific, see LORE_BIBLE.md §1/§2.5)

```
VISIBILITY_STATES = ["hidden", "partially_known", "known"]
DEFAULT_VISIBILITY = { Paradis: "hidden_beyond_home_island", others: "known" }

REVEAL_TRIGGERS = [
  { type: "focus_completed", focusIdPrefix: "EXPLORATION_" },
  { type: "diplomatic_contact_established" },
  { type: "intel_operation_success", operationType: "reconnaissance" },
  { type: "scripted_event", eventId: "WALL_BREACH_845" }   // canon event, if it fires, forcibly reveals Marley
]
// A "hidden" nation/province: no map info, no diplomatic actions available, no intel screen entry.
// A "partially_known" nation: approximate territory shown, no exact stats.
// A "known" nation: full info as any other nation.
```

---

## 11. SAVE FORMAT (baseline)

```
SaveFile {
  formatVersion: "1.0"
  savedAtIso: string
  nations: Nation[]
  states: State[]
  divisions: Division[]
  focuses_completed_by_nation: { [nationId]: string[] }
  activeEvents: string[]
  rngSeed: string    // stored for deterministic replay/debugging
}
```

---
END OF FILE. Every numeric default above is intentionally concrete so no system is implemented with
an invented or placeholder value. Changing a value requires updating this file, not ad-hoc code
constants.
