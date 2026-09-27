# LORE_BIBLE.md
STATUS: reference document — authoritative for narrative content generation.
AUDIENCE: AI implementation agent (Opus). Format is intentionally dense/structured, not written for human narrative reading.
LINKED DOCS: MECHANICS_SPEC.md (numeric rules), FEATURES_SPEC.md (UI/functional spec),
HISTORICAL_EVENT_CHAIN_845_854.md (full an-845→854 scripted event chain for "Mode historique").

---

## 0. META RULES — READ BEFORE GENERATING ANY TEXT

0.1 CHARACTER POLICY: do not name specific individual manga/anime characters (protagonists,
antagonists, named royals) anywhere in generated content (focus names, focus descriptions, event
text, flavor text, unit names). Use role/title abstractions instead ("le commandant du bataillon
d'exploration", "l'héritier du Titan Fondateur", "le chef du programme des Guerriers"). This is a
deliberate design choice, not a gap — it reduces both copyright exposure and the risk of violating
rule 0.2, and it matches the "Nine Titans as abstract transferable hero units" design already fixed
in the HOI4 mechanics document.

0.2 NAMING RESTRICTION (carried over from the existing Pax Historia preset project): if rule 0.1 is
ever relaxed and named characters are used, the specific restriction "no mention of [the protagonist
who is later revealed as a Titan shifter] before that reveal" still applies to any chronologically-
ordered content dated before that in-universe event. Default behavior under 0.1 makes this moot.

0.3 COPYRIGHT: this file is an original paraphrase/summary for a personal, non-commercial fan
project. Never reproduce manga panels, anime dialogue, chapter titles, or official marketing copy
verbatim. Do not reproduce official artwork or logos (see HOI4 doc section 9 / 1).

0.4 CANON vs EXTENSION: every entry below is tagged `[CANON]` (matches the source material,
described in original wording) or `[EXTENSION]` (invented specifically for this project, e.g. the
extra internal provinces visible on the reference map that are not individually named in the source
material). Opus must not blur this distinction in generated text — extensions may be freely expanded,
canon entries may be elaborated stylistically but must not contradict the facts listed here.

0.5 TONE: morally ambiguous, no flat "good empire / evil empire" framing. Both Paradis and Marley
have internal factions with competing views. Encode this in flavor text (e.g. focus descriptions
should acknowledge costs/tradeoffs, not just benefits).

0.6 GAP HANDLING: if content needed for a feature (e.g. a specific focus's flavor text) requires a
lore detail not covered here, generate a plausible `[EXTENSION]` consistent with sections 1-4 rather
than inventing something that could contradict `[CANON]` facts — and flag it with `[EXTENSION]` in
code comments so it can be reviewed.

---

## 1. WORLD TIMELINE (relative to game start: 01/01/an 844)

| Era tag | Approx. date | Summary (paraphrased, no verbatim quotes) |
|---|---|---|
| `ERA_ANTIQUITY` | undated / distant past (commonly cited in-universe as roughly 2000 years before the present) | [CANON] Origin of the Titan power is uncertain in-universe; treat as an unresolved mystery, not a fact to state plainly in generated text. |
| `ERA_EMPIRE` | multi-century span, ending ≈ year 743 | [CANON] Era of a dominant Eldian empire that used Titan power to control much of the known world; ended in internal collapse (`ERA_GREAT_CONFLICT` below). |
| `ERA_GREAT_CONFLICT` / `ERA_MIGRATION` | year 743 (≈101 years before game start) — CORRECTED from an earlier draft's "745" | [CANON] The reigning Eldian ruler, seeking to end the empire's wars, deliberately let the empire collapse: the ruling family relocated a remnant population to an island (later Paradis), raised three concentric Walls there, and used the Founding Titan's mind-altering ability to erase the outside world from that population's memory. In the same period, the mainland's remaining Titan-holding factions fought each other while Marley rose and secured most of the Nine Titans. Do not narrate battle-by-battle detail — keep at "a ruler engineered his own empire's fall and relocated his people" level. |
| `ERA_ISOLATION` | 743–845 — CORRECTED range | [CANON] Paradis has been sealed behind its Walls for this whole period: no verified contact with the outside world for the general population, by design (see mechanism above). This is the default epistemic state of the Paradis nation at game start (mid-isolation, since the game begins in 844) — see FOG_OF_WAR in MECHANICS_SPEC.md. |
| `ERA_GAME_START` | 01/01/an 844 | Player-controlled simulation begins here — one year before the next entry. |
| `ERA_HISTORICAL_CHAIN` | an 845 → an 854 | [CANON] Full event chain now specified in a dedicated file: **HISTORICAL_EVENT_CHAIN_845_854.md**. It is only scheduled when `GameSettings.historicalMode = true` ("Mode historique"); with `historicalMode = false` ("Mode libre") none of it is scheduled and the world is purely emergent from 844 onward. Both modes share the identical starting scenario above — see that file §0 for the mode definition. |

Design note: this table used to inline the individual `an 845`/`an 850`/`an 850-854` rows directly;
they are now consolidated into HISTORICAL_EVENT_CHAIN_845_854.md alongside two further beats found on
a follow-up pass (a political coup and the discovery of the ocean, both ≈an 850) and the terminal
Rumbling event (an 854). Read that file before implementing anything date-related past 01/01/an 845.

---

## 2. GEOGRAPHY & POLITIES

Cross-reference: nation table already fixed in the HOI4 mechanics document §4. This section adds lore
texture only; do not duplicate the province list here — pull it from that document at implementation
time.

### 2.1 Paradis Island (Eldia) `[CANON structure, EXTENSION detail]`
- Three concentric defensive Walls (outer/middle/inner), each enclosing settled land.
- Capital: inner-wall city (administrative + royal seat).
- Military doctrine: static defense-in-depth, small standing field army, reliance on wall height as
  primary deterrent against the Pure Titan hazard (MECHANICS_SPEC.md §7).
- Governance: monarchy + a layered military command structure (three branches — see §4.1).
- Epistemic state: no accurate knowledge of the outside world at game start (FOG_OF_WAR default ON).

### 2.2 Marleyan Empire `[CANON structure, EXTENSION provinces]`
- Dominant continental/global power; colonial-style administration over multiple subordinate
  territories.
- Maintains internment districts for its Eldian minority population — legally distinct status, tied
  to `EldianStatusModifier` in MECHANICS_SPEC.md §9.
- Runs a state program (the Warrior program, `[CANON]`) recruiting Eldian children from internment
  districts as Titan-shifter candidates — see §3.4 and MECHANICS_SPEC.md §7.4.
- `[EXTENSION]` Internal provinces (Nidereldia, Obereldia, Patria, Sudennland, etc., per the reference
  map) are non-canon administrative subdivisions added for gameplay granularity; treat as ordinary
  Marleyan states with no independent lore beyond "loyal/administered Marleyan territory."

### 2.3 Mid-East Alliance `[CANON as a named faction — RETAGGED twice now, see correction note below]`
- [CANON] A real coalition of nations in the source material (rendered here as "Mid-East Alliance";
  the closest verified in-universe name is "Mid-East Allied Forces" — treat "Mid-East Alliance" as
  this project's working translation of that faction, not a different invented one).
- **CORRECTION (second verification pass, replaces a wrong statement in the previous draft):** the
  Mid-East–Marley war is NOT a past event already concluded before this project's game start. Per the
  timeline in §1, it is a downstream canon consequence dated to roughly an 850–854 — i.e. it lies in
  the game's future, contingent on Marley first losing significant Titan power around an 850, which
  is itself contingent on the (optional, unscripted-by-default) chain starting at `WALL_BREACH_845`.
  The earlier draft had the causality backwards (said the war was already fought and lost by game
  start); this is now corrected.
- [CANON] At game start (an 844), no specific pre-845 Mid-East–Marley conflict is established with
  confidence in the sources checked — default to standing tension/rivalry rather than an active or
  concluded war, and flag this as `[UNCONFIRMED default]` rather than asserting a war history.
- [CANON] Once/if the an 850–854 war occurs in a given playthrough, Marley is documented as the
  eventual victor (peace treaty signed in 854); the Alliance is also documented as later developing
  anti-Titan technology that erodes Marley's edge over time, and as losing a fortified position back
  to Marley around the same late period — moderate confidence on the exact year for that last point.
- Exact internal politics beyond the above are `[EXTENSION]` — default to "federation prioritizing
  collective security against Marleyan hegemony."

### 2.4 Hizuru `[CANON existence & broad status, EXTENSION detail]`
- [CANON] An East Asian power in the source material, historically diminished largely because of a
  past association/alliance with the Eldian Empire (reputational fallout), not primarily because of a
  lost war like the Mid-East Alliance — keep this distinction in generated flavor text.
- [CANON] Of the outside powers, Hizuru is depicted as comparatively favorable toward people of
  Eldian descent, in contrast to most other nations' hostility.
- [CANON, supporting detail] A small Hizuru-descended lineage is said to live inside Paradis's Walls,
  unaffected by the general memory-erasure described in §1 — a concrete in-world basis for a future
  Hizuru–Paradis diplomatic hook (not a certainty to script, but not an invented connection either).
- [EXTENSION] Internal provinces/islands per the reference map; treat as ordinary Hizuru territory.

### 2.5 "Uncharted by Eldia" zones
- Not empty map space — represents the limit of Paradis's knowledge, not the limit of the actual
  world. Other nations should have normal knowledge of these zones. Implementation: see FOG_OF_WAR
  in MECHANICS_SPEC.md §10.

---

## 3. THE TITANS — LORE LAYER (mechanical numbers live in MECHANICS_SPEC.md §7)

### 3.1 Pure Titans `[CANON]`
- Mindless giant humanoid entities. Do not reproduce, cannot be reasoned with. Found roaming certain
  territories (flagged on the reference map as "former Pure Titan territory").
- Lore framing: a background hazard/curse affecting the setting broadly, not an "enemy faction" with
  intent. Keep generated flavor text at this register (environmental threat, not villain).

### 3.2 Titan Shifters `[CANON]`
- Specific humans capable of controlled transformation into a giant form, each tied to inheriting one
  of nine specific, named power-slots (§3.3).
- A shifter's remaining active lifespan is finite once their power first activates (commonly
  summarized in the source material as a multi-year countdown). Implement as a per-unit countdown
  variable; exact default length is a MECHANICS_SPEC.md numeric decision, not a lore fact to hardcode
  here.
- Power transfers to whoever consumes a shifter's remains under the right conditions — treat as a
  scripted transfer event, not a simulated combat sub-system.

### 3.3 The Nine Titans — abstracted power table `[CANON existence/traits, EXTENSION exact game bonus values]`

| Slot id | Signature trait (paraphrased) | Typical narrative role |
|---|---|---|
| `TITAN_FOUNDING` | Command authority over Titan-kind plus the ability to alter the minds/memories of the wider Eldian population; full potential requires contact with someone of the royal bloodline | Strategic/narrative linchpin, tied to Paradis's royal line |
| `TITAN_ATTACK` | CORRECTED — its defining trait is NOT combat prowess: the holder can partially access the memories of both past and future holders of this specific power (a unique two-directional memory link) | Narrative/strategic-foresight archetype rather than a pure frontline fighter |
| `TITAN_COLOSSAL` | Very large form, releases scalding steam usable both offensively and as a shield | Siege/area-denial archetype |
| `TITAN_ARMORED` | Hardened plating | Breakthrough/tank archetype |
| `TITAN_FEMALE` | CORRECTED — adds: can emit a call that draws nearby Pure Titans; skilled individual combatant; limited hardening (crystallization) | Versatile infiltrator/duelist archetype |
| `TITAN_BEAST` | Enhanced intellect, ranged throwing capability; outward appearance is described as varying by holder | Commander/support archetype |
| `TITAN_CART` | Quadrupedal form, very high endurance — can reportedly stay transformed far longer than other shifters | Logistics/utility archetype |
| `TITAN_JAW` | Hardened bite and claws, small frame, notably fast (commonly described as the second-fastest of the nine) | Skirmisher archetype |
| `TITAN_WARHAMMER` | On-demand hardened weapon constructs (documented examples: a war hammer, a crossbow, a whip) | Engineer/siege-support archetype |

Exact in-game stat bonuses per slot: defined in MECHANICS_SPEC.md §7.3 as `[EXTENSION]` balancing
values — this table is the lore anchor only, not the numeric source of truth.

### 3.4 Warrior Program `[CANON]`
- Marleyan state program: recruits Eldian children (roughly ages 5-7 in the source material) from
  internment districts as shifter candidates, in exchange for the promise of "honorary Marleyan"
  status for their family. Framed in canon with real moral weight — children raised for a dangerous,
  short-lived role, and the "honorary" status itself is repeatedly portrayed in-universe as a hollow
  title that doesn't meaningfully change how the family is treated. Generated flavor text should not
  sanitize this into a simple "recruit unit" description, and should not portray the reward as
  straightforwardly positive — keep at least one line acknowledging both the cost and the hollowness
  of the promised reward.

---

## 4. FACTIONS & ORGANIZATIONS (role-based, no named individuals per §0.1)

### 4.1 Paradis military branches `[CANON]`
- Perimeter garrison branch — mans the Walls, largest branch by headcount, lower prestige.
- External reconnaissance branch — smallest branch, operates beyond the innermost wall, highest
  casualty rate, associated narratively with direct Pure Titan combat.
- Internal police/order branch — urban law enforcement, highest prestige, associated with the capital.
- Royal government — monarchy + advisory council; degree of real authority vs. military influence is
  `[EXTENSION]`-adjustable for gameplay (recommend: partially checked by military factions, giving a
  legitimate internal-politics axis, see MECHANICS_SPEC.md §9).

### 4.2 Marleyan structures `[CANON existence, EXTENSION org-chart detail]`
- Colonial administration corps — governs subordinate territories.
- Warrior program directorate — runs §3.4.
- Internment district authority — administers Eldian internment zones; policy lever ties directly to
  `EldianStatusModifier`.

---

## 5. THEMATIC GUIDANCE FOR GENERATED CONTENT

- Avoid resolving the setting's central moral tensions (Eldian/Marleyan conflict, the ethics of the
  Warrior program, the isolationist policy) into a clean "correct side." Focus trees for both Paradis
  and Marley should include options with genuine costs, not just upside.
- Prefer institutional/role framing over individual heroics in flavor text (reinforces §0.1 and keeps
  events replayable across different players/nations without contradicting a fixed protagonist arc).
- `[EXTENSION]` content (invented provinces, federations' internal politics, exact NPC dialogue for
  events) should stay tonally consistent with `[CANON]` entries: militaristic, somber, bureaucratic
  rather than fantastical.

---

## 6. FIDELITY CHECK NOTE (for the human reader, not for Opus's content generation)

This file has now been cross-checked twice against general web sources (a fan wiki,
attackontitan.fandom.com — unofficial, fan-maintained — plus several secondary recap/timeline
articles and a chapter-dated fan compilation on Reddit; no official Kodansha/Isayama source was
directly consulted). Treat `[CANON]` tags as "corroborated by fan/secondary sources," not as verified
against the original Japanese text.

Pass 1 fixed: wrong migration year (745→743), a mischaracterized Attack Titan trait, a missing
Female Titan ability, and a wrong `[EXTENSION]` tag on the Mid-East Alliance.

Pass 2 fixed a further error introduced during pass 1's Mid-East Alliance correction: the Mid-East–
Marley war was wrongly placed in the past (before game start); it is actually a documented an
850–854 event, downstream of other canon events that this project deliberately leaves unscripted by
default. Two additional optional event hooks were added to §1 to reflect this chain accurately rather
than leaving it half-corrected.

Remaining low-confidence point: the exact year the Mid-East Alliance loses its fortified position
back to Marley (§2.3) — placed "around the same late period" as the 854 peace treaty without a firm
citation.

---
END OF FILE. Cross-check MECHANICS_SPEC.md before implementing any numeric system referenced above.
