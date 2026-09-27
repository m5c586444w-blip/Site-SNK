# HISTORICAL_EVENT_CHAIN_845_854.md
STATUS: extension of LORE_BIBLE.md — defines the full optional-scripted event chain that
"Historical Mode" enables (see MECHANICS_SPEC.md for the mode flag and trigger wiring).
AUDIENCE: AI implementation agent (Opus). Same rules apply as LORE_BIBLE.md §0 (no named
individual characters, no verbatim reproduction, CANON/EXTENSION tagging, tonal guidance).
SOURCING: cross-checked against general secondary sources (a fan wiki — unofficial — plus
chapter-dated fan timeline compilations); no official source consulted directly. Confidence level
given per entry; treat anything marked `[MODERATE CONFIDENCE]` as usable but not certain on the
exact date.

---

## 0. THE TWO GAME MODES

```
GameSettings.historicalMode: boolean   // chosen at game setup, see FEATURES_SPEC.md §0.4
```

- **`historicalMode = true` ("Mode historique")**: every event listed in §1 below is scheduled and
  will fire when its `triggerCondition` is met, UNLESS the relevant player nation completes the
  matching "avert/delay" focus in time — exactly like HOI4's historical-AI-focus toggle: enabled by
  default, but still divertible through deliberate player action. AI-controlled nations do not
  actively try to avert these events on their own in this mode (they follow the historical path
  unless a human player intervenes).
- **`historicalMode = false` ("Mode libre")**: NONE of the events in §1 are scheduled at all — the
  global gate in MECHANICS_SPEC.md §5.3 skips them entirely. The starting conditions (LORE_BIBLE.md
  §1-2, i.e. the state of the world as of 01/01/an 844) still apply either way; only the *scripted
  future* differs between modes. From turn one, Mode Libre is a pure sandbox: everything after 844
  is emergent simulation only.
- Both modes share the identical starting scenario. "Mode historique" is strictly additive (extra
  scheduled events on top of the base scenario); it does not change LORE_BIBLE.md §1-4 in any way.

---

## 1. EVENT CHAIN (chronological, "Historical Mode" only)

Each entry: id, date/trigger, paraphrased beat description, avert/delay mechanism, confidence.

### 1.1 `WALL_BREACH_845` [already defined in MECHANICS_SPEC.md §5.3 — restated for chain order]
- Date: 01/01/an 845. [CANON, HIGH CONFIDENCE]
- Beat: a breach in the outermost Wall allows a mass Pure Titan incursion into previously safe
  territory; large-scale loss of that territory and population displacement follows.
- Avert: Paradis focus `AVERT_BREACH_845`.
- Downstream gate: everything below in this file assumes this fired, unless noted otherwise.

### 1.2 `TROST_CRISIS_850` [NEW]
- Date: 01/01/an 850 (approximate — the source material places this a few years after 845 without
  an exact day/month I could verify). [CANON beat, MODERATE CONFIDENCE on exact date]
- Beat: a major Titan incursion at a still-held settlement near the breached wall is repelled at
  heavy cost; in the aftermath, suspicion grows that one or more shifters have been operating
  undetected within Paradis's own ranks.
- Prerequisite: `WALL_BREACH_845` fired.
- Avert: Paradis focus `PREVENT_TROST_CRISIS_850` (represents reinforcing that settlement's defenses
  pre-emptively). If averted, `MARLEY_TITAN_LOSS_850` (§1.3) and `PARADIS_COUP_850` (§1.4) below lose
  their normal trigger path — see those entries for the fallback.

### 1.3 `MARLEY_TITAN_LOSS_850` [already added to MECHANICS_SPEC.md §5.3 last pass — restated for chain order]
- Date: 01/01/an 850, same cluster as §1.2. [CANON, HIGH CONFIDENCE on the fact, MODERATE on exact
  date]
- Beat: during the campaign following `TROST_CRISIS_850`, two of Marley's Titan-holding infiltrators
  are defeated; their powers pass to individuals aligned with Paradis rather than returning to
  Marley.
- Prerequisite: `TROST_CRISIS_850` fired (if that was averted, this event does not fire by its normal
  path in Historical Mode — no alternate path is scripted; flag this as a gap if it matters to you).
- Avert: Marley focus `SECURE_INFILTRATORS_850` (represents extracting the at-risk Warriors before
  they can be defeated) — success prevents the power transfer but is narratively costly (Marley loses
  the intelligence-gathering value of the mission instead).

### 1.4 `PARADIS_COUP_850` [NEW]
- Date: 01/01/an 850, same general window as §1.2/1.3 — the succession record I could verify shows
  a change of ruling administration dated to an 850. [CANON, MODERATE-HIGH CONFIDENCE on year]
- Beat: an internal political crisis exposes the sitting government as illegitimate (not the true
  royal line); a coup replaces it with a different administration aligned with the true bloodline.
  Per LORE_BIBLE.md §0.5, do not frame this as a clean "good guys win" moment — both the old and new
  governments should read as flawed institutions in generated flavor text.
- Prerequisite: none strictly required, but thematically tied to the general unrest following
  `WALL_BREACH_845`/`TROST_CRISIS_850` — recommend gating behind at least one of those two.
- Effect (mechanical): `modifyStability` swing (temporary drop during the crisis, recovery afterward
  if handled well) + unlocks a `royalBloodlineFlag` on whichever in-game entity represents the new
  head of state, relevant to the `TITAN_FOUNDING` bonus in MECHANICS_SPEC.md §7.3.
- Avert: Paradis focus `SUPPRESS_COUP_850` (the old administration holds on) — offered as a genuine
  branch, not a "wrong choice"; both outcomes should have real mechanical tradeoffs, not a hidden
  correct answer.

### 1.5 `OCEAN_DISCOVERY_850` [NEW]
- Date: an 850–851 — sources disagree by about a year depending on counting convention.
  [CANON beat, LOW-MODERATE CONFIDENCE on exact year, HIGH CONFIDENCE it happens in this general
  window]
- Beat: an expedition beyond the walls reaches open coastline, the first confirmed physical proof
  that the outside world exists. This is the natural mechanical hook for lifting Paradis's fog of war
  — wire it directly to a `REVEAL_TRIGGERS` entry in MECHANICS_SPEC.md §10 (partial reveal: ocean's
  existence and general world shape, NOT full nation-by-nation detail yet).
- Prerequisite: none required, but should logically follow some exploration-flavored Paradis focus
  completing.
- Delay (not a full avert — you can't indefinitely hide a landmark discovery from your own people):
  Paradis focus `DELAY_OCEAN_DISCOVERY` pushes the date back by a fixed period rather than cancelling
  it.

### 1.6 `MARLEY_MIDEAST_WAR_850_854` [already added to MECHANICS_SPEC.md §5.3 last pass — restated]
- Date: begins ≈01/01/an 850, resolves ≈01/01/an 854. [CANON, HIGH CONFIDENCE]
- Beat: the Mid-East Alliance, reading Marley's loss of Titan power (§1.3) as an opening, goes to war
  with Marley; a multi-year conflict follows, ending with a Marley victory and peace treaty.
- Prerequisite: `MARLEY_TITAN_LOSS_850` fired.
- No clean "avert" for either side — model as an AI-driven war state per MECHANICS_SPEC.md §5.3's
  existing note, not a togglable flag. A Marley player CAN influence the outcome through ordinary
  military/production play; that is the intended lever, not a focus-based cancel button.

### 1.7 `RUMBLING_854` [NEW — terminal event of the chain]
- Date: 01/01/an 854 earliest possible trigger. [CANON that this event exists and is dated to an
  854, HIGH CONFIDENCE on the year; the exact chain of preconditions in the source material is more
  intricate than what's modeled here — this is a deliberately simplified gate, see note below]
- Beat: catastrophic activation of the Wall Titans, causing devastating, wide-scale destruction
  across the mainland. Per the cahier des charges §5.7 (already agreed), implement this ONLY by its
  game effects (major territory/population losses for affected mainland nations, global diplomatic
  shock, and a hard stop or drastic restructuring of the affected nations' simulation) — no technical
  detail, no glorification, keep the tone somber per LORE_BIBLE.md §0.5.
- Prerequisite (simplified — see note): `MARLEY_MIDEAST_WAR_850_854` resolved AND Paradis still holds
  `TITAN_FOUNDING` AND date ≥ 01/01/an 854.
- Avert: Paradis focus chain `AVERT_RUMBLING` (multi-step, higher cost than other avert focuses given
  the stakes) — completing it keeps the game running past 854 without this event firing.
- **Design note (not a lore claim):** the real causal chain leading to this event in the source
  material is more specific than "war resolves + still holds the Founding Titan" — I simplified it
  for implementability. If you want tighter fidelity here specifically, this is the entry most worth
  revisiting with more targeted research before Opus builds it, rather than the earlier links in the
  chain.

---

## 2. WHAT THIS FILE DELIBERATELY DOES NOT COVER

- Any scene-level detail, named individuals, or dialogue — out of scope per LORE_BIBLE.md §0.1/§0.3.
- The internal politics of Marley's high command or Paradis's post-coup government beyond the single
  stability/bloodline effects noted above — flagged as a gap, not filled with invention.
- Anything after `RUMBLING_854` fires — the chain stops there; post-Rumbling simulation is emergent
  in both modes.

---
END OF FILE. Wire the event ids above into MECHANICS_SPEC.md's Event catalog and gate them all
behind `GameSettings.historicalMode` per §0 above.
