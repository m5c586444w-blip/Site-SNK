# FEATURES_SPEC.md
STATUS: exhaustive functional requirement checklist. Every screen/control listed is REQUIRED unless
tagged `[OPTIONAL]`. Do not invent additional unlisted core screens without flagging the gap; do not
skip listed ones. This is the implementation contract for the client + server API surface.
LINKED DOCS: LORE_BIBLE.md (narrative content source), MECHANICS_SPEC.md (data/formulas referenced
by id below — e.g. `MECHANICS_SPEC.md#3.3` means "see that file, section 3.3"),
HISTORICAL_EVENT_CHAIN_845_854.md (source for the Historical Mode toggle in §0.4).

---

## 0. APP SHELL

### 0.1 Launcher (server-side process, not a UI screen)
- On start: bind to `DEFAULT_PORT=5173`; if busy, increment until a free port is found (max 20
  attempts, then fail with a clear console error).
- Print to console: local URL (`http://localhost:<port>`) AND LAN URL (host machine's local network
  IP + port), both copy-pasteable.
- Auto-open the OS default browser at the local URL after the server reports "ready".
- `[OPTIONAL]` system tray icon with "Open in browser" / "Quit" if packaged as a desktop-like app.

### 0.2 Main menu screen
Widgets: `New Game` button, `Load Game` button, `Settings` button, `Quit` button (closes server
process). No other elements.

### 0.3 Settings screen
Fields: master volume slider, UI scale selector (`small|medium|large`), language toggle (`FR|EN`),
`[OPTIONAL]` colorblind-safe palette toggle. `Save` and `Back` buttons. Persist to a local
`settings.json` file, not tied to any save game.

### 0.4 Nation/scenario select screen (before "New Game" starts)
- One card per playable nation (see MECHANICS_SPEC.md Nation entity): flag placeholder, name, one-
  line blurb sourced from LORE_BIBLE.md §2, a difficulty tag (`Paradis: isolated/hard`,
  `Marley: complex/hegemon`, others: `standard`).
- **Historical Mode toggle (REQUIRED, new this pass):** a two-option switch, `Mode historique` vs
  `Mode libre`, show below the nation cards. Include a short inline explainer text pulled/paraphrased
  from HISTORICAL_EVENT_CHAIN_845_854.md §0 (e.g. "Mode historique : les grands évènements connus
  entre 845 et 854 se dérouleront sauf si vous agissez pour les éviter. Mode libre : rien n'est
  scripté après le début de partie."). Default value: `Mode historique` (matches "historical AI
  focuses ON by default" convention this design is modeled on).
- `Start Game` button on the selected card → calls `POST /api/game/new` with
  `{ nationId, historicalMode }`, server initializes GameState from MECHANICS_SPEC.md defaults,
  CALENDAR_START, and the chosen `GameSettings.historicalMode`.
- `[OPTIONAL]` host/join toggle here if not handled in §15. In multiplayer, only the host sees/sets
  the Historical Mode toggle; other players see it as read-only in the waiting room (§15.1).

---

## 1. TOP BAR (persistent across all in-game screens)

| Widget | Behavior |
|---|---|
| Resource pips (steel/fuel/rareMaterials icons + running total) | Live-updates on server push; tooltip shows daily net (production − consumption) |
| Manpower pip | Shows available/total manpower pool |
| Date/clock text | Format from MECHANICS_SPEC.md §1; click opens a small calendar popover (no interaction beyond display) |
| Speed control (5 buttons: pause,1x,2x,3x,4x) | Sends `POST /api/game/speed {level}`; keyboard shortcuts per MECHANICS_SPEC.md §1 |
| Nation flag + name | Click → opens screen §3 (Fiche pays) |
| Notification bell icon with unread badge | Click → opens screen §14 |

---

## 2. MAP SCREEN (default screen after game start)

- Map mode selector: icon row, modes = `political | resources | supply | front_combat | fog_of_war`
  (fog_of_war option only visible/selectable for the Paradis player).
- Province hover: tooltip with `{name, owner, controller, infrastructureLevel, resourceDeposits}`
  (fields hidden/blurred per current VISIBILITY_STATE if fog of war applies — MECHANICS_SPEC.md §10).
- Province left-click: opens right-side province panel (owner, garrison summary, fortification level
  if Wall state, "manage" button linking to relevant screen depending on ownership).
- Own-division right-click on map: context menu → `Set front here | Advance order | Hold order |
  Retreat order` (writes `division.order`, see MECHANICS_SPEC.md §6.3 consumer).
- Zoom: mouse wheel / pinch; Pan: click-drag or arrow keys.
- Visual overlays required: Wall lines rendered distinctly for Paradis states (per
  WALL_FORTIFICATION_LEVEL_DEFAULT), "former Pure Titan territory" zones shaded with a hazard pattern
  distinct from normal terrain shading.
- Fog-of-war rendering rule: `hidden` = solid unrevealed shading, no borders drawn; `partially_known`
  = approximate border only, no color/owner fill; `known` = full normal rendering.

---

## 3. FICHE PAYS / OVERVIEW SCREEN

Fields: flag, nation name, government/ideology label, stability gauge (0-100, colored by threshold
per MECHANICS_SPEC.md §9), war support gauge, political capital counter, quick-nav buttons to every
other screen listed in this document, and (if applicable) a "Titan powers held" mini-list pulling
from `nation.titanPowersHeld` with a link to screen §9.

---

## 4. PRODUCTION SCREEN

- List of active `ProductionLine`s: equipment icon, assigned factory count, efficiency bar (0-100%,
  formula MECHANICS_SPEC.md §3.3), daily output number, `+`/`-` buttons to (re)assign factories
  (triggers `EFFICIENCY_LOSS_ON_REASSIGN` per that formula — show a confirm tooltip warning of the
  penalty before applying).
- Unassigned civilian/military factory counters, with a `Build new factory` button opening a state-
  picker modal (cost per MECHANICS_SPEC.md §3.4).
- `Convert civilian → military factory` action available per-state, with a confirm modal.
- Equipment stockpile numbers per `EQUIPMENT_TYPES` (MECHANICS_SPEC.md §3.2), locked/greyed entries
  (e.g. naval/air for Paradis) show a lock icon with tooltip "unlocked by focus: <focusName>".

---

## 5. RESEARCH SCREEN

- Grid grouped by `CATEGORIES` (MECHANICS_SPEC.md §4); locked categories (navy/aviation for Paradis)
  shown greyed with lock tooltip.
- Each tech node: icon, name, cost in days (computed per §4 formula given current slot/bonus state),
  prerequisite lines drawn between nodes, click → assign to a free research slot (respect
  `RESEARCH_SLOTS_DEFAULT` / `RESEARCH_SLOTS_PARADIS_OVERRIDE`).
- Active research list (up to slot count) with progress bars and a `cancel` button (cancelling loses
  progress — confirm modal required).

---

## 6. FOCUS TREE SCREEN

- Node graph rendered per nation's focus tree (data source: Focus entities filtered by
  `nation.id`), node states: `locked | available | in_progress | completed`, colored distinctly.
- Hover on a node: tooltip listing full `effects[]` in plain language (map each `FocusEffect.type` to
  a human-readable template — do not show raw enum values to the player).
- Click on `available` node with no active focus (or a free concurrent slot): starts it, calls
  `POST /api/nation/{id}/focus/start {focusId}`.
- Progress bar on `in_progress` node reflecting `focusDaysRemaining`.

---

## 7. TITAN POWERS SCREEN (project-specific, no direct HOI4 equivalent)

Table columns: `Titan slot name | Current holder (nationId or "unclaimed"/"lost") | Location
(provinceId, if known/visible) | Status (secure | at-risk | lost) | Action`.
- `Action` column: `View power effect` button opens a modal showing the row from
  MECHANICS_SPEC.md §7.3 in plain language.
- Rows for slots not visible to the current nation (fog of war) show `"???"` instead of holder/
  location, consistent with §10 of MECHANICS_SPEC.md.
- `TITAN_INHERITANCE` event (MECHANICS_SPEC.md §7.5) firing must also push a toast + journal entry
  (see §14) in addition to updating this screen's data.

---

## 8. DIVISIONS / ORDER OF BATTLE (OOB) SCREEN

- Left panel: tree `Armies → Divisions → Battalions` for the current nation.
- Right panel: `Division Template Editor` — drag battalion-type icons into template slots (respecting
  `MAX_TEMPLATE_WIDTH`), live-updating computed stats panel (attack/defense/width/speed/costs) per
  MECHANICS_SPEC.md §6.2 formulas, `Save template` / `Delete template` buttons.
- `Assign division to front` action from the tree (or from the map screen, §2) opens a front-order
  submenu (`hold|advance|retreat`).
- Manpower/equipment cost preview shown before confirming a new division from a template
  (blocks confirmation if insufficient stockpile/manpower, with an inline error message — no silent
  failure).

---

## 9. DIPLOMACY SCREEN

- Nation list (excluding `hidden` nations per fog of war) with relation value (-200..200 slider
  visual) and action buttons gated by `ACTION_COSTS` minimums (MECHANICS_SPEC.md §8) — disabled
  buttons show a tooltip explaining why (relation too low / insufficient political capital).
- Action history log per nation pair (chronological, filterable).
- Faction/alliance map overlay `[OPTIONAL toggle]` showing current alliance blocs.
- Wargoal flow: `Justify wargoal` button → target-nation picker → justification timer starts
  (`WARGOAL_JUSTIFY_DAYS_DEFAULT`) → on completion, `Declare war` button becomes available.

---

## 10. POLITICS SCREEN

- Active laws per `LAW_CATEGORIES`, each with a `Change` button (disabled during
  `LAW_SWITCH_COOLDOWN_DAYS`, shows remaining cooldown as a countdown).
- Marley-only: `Eldian status policy` selector (`strict|moderate|relaxed`, MECHANICS_SPEC.md §9.3),
  same cooldown rule, with a confirm modal that states the tradeoffs in plain language (pulling
  numbers from that section, not inventing new copy).
- Pending political events list (if any `Event` with unresolved choices is active) with `Resolve`
  buttons opening the event modal (§14.2).

---

## 11. INTELLIGENCE SCREEN

- Available operations list (`reconnaissance`, `sabotage`, `support_faction` — baseline set; exact
  effects TBD per MECHANICS_SPEC.md extension hooks) with agent-assignment control and a cost/cooldown
  display.
- Past operations log (success/failure, date, target).
- For Paradis: a `reconnaissance` success against a `hidden`/`partially_known` nation must trigger the
  relevant `REVEAL_TRIGGERS` entry in MECHANICS_SPEC.md §10.

---

## 12. WARRIOR PROGRAM SCREEN (Marley only, project-specific)

- Candidate pool list (`WARRIOR_CANDIDATE_POOL_MAX` slots), each with training progress
  (`CANDIDATE_TRAINING_DAYS`) and a defection-risk indicator derived from
  `DEFECTION_CHANCE_PER_DAY` (MECHANICS_SPEC.md §7.4/§9.3).
- `Recruit candidate` button (consumes a pool slot, starts training timer).
- Not visible/accessible to non-Marley nations.

---

## 13. FRONT / COMBAT OVERLAY (part of map screen §2, listed separately for completeness)

- When a front line exists between two nations, render it as a distinct line style on the map.
- Active combats: small icon on the map at the contested province; click opens a combat detail modal
  showing attacker/defender power values and the live `result_ratio` computation
  (MECHANICS_SPEC.md §6.3) — expose the numbers, don't hide the math from the player.

---

## 14. NOTIFICATIONS / EVENT JOURNAL

### 14.1 Toast notifications
- Appear top-right, auto-dismiss after 6s unless hovered, max 3 stacked, overflow collapses into a
  "+N more" indicator opening the journal.

### 14.2 Event modal
- Triggered by any `Event` per MECHANICS_SPEC.md §5.3. Shows title/body (sourced/generated per
  LORE_BIBLE.md content rules), one button per `choices[]` entry, each applying its `effects[]` on
  click and closing the modal. Modal is BLOCKING (pauses game speed automatically) unless the event is
  explicitly flagged non-blocking.

### 14.3 Journal screen
- Chronological list of all past notifications/events, filterable by category
  (`military|diplomacy|politics|focus|titan|intel|historical_chain`), searchable by date range.
  `historical_chain` covers any event from HISTORICAL_EVENT_CHAIN_845_854.md when it fires — always
  empty for the whole game if `GameSettings.historicalMode == false`.

---

## 15. MULTIPLAYER / SESSION SCREEN

### 15.1 Host flow
- After launcher start (§0.1), a `Session` screen shows the LAN URL with a `Copy address` button and
  a live list of connected players (nickname + assigned nation, editable by host before game start).
- `Start Game` button (host-only) locks nation assignments and transitions all connected clients to
  §0.4 confirmation → then into the running game.

### 15.2 Join flow
- Address input field (prefilled if opened via a shared link) + nickname field + `Connect` button.
- Waiting-room view: list of other connected players/nations, a `Ready` toggle, disabled `Start Game`
  (host-only action).

### 15.3 Disconnect handling
- On client disconnect mid-game: that nation's control reverts to AI (see MECHANICS_SPEC.md AI notes)
  until the player reconnects with the same session token; UI shows a "reconnecting..." banner to
  other players for that nation.

---

## 16. SAVE / LOAD

- `Save` screen: name field (default = date/nation), list of existing saves with timestamp + nation +
  in-game date, `Overwrite` confirm modal if name collides.
- `Load` screen: same list, `Load` button per row, `Delete` button with confirm modal.
- Autosave: every 5 in-game days by default (`AUTOSAVE_INTERVAL_DAYS = 5`), stored as a rotating slot
  (`autosave_1`, `autosave_2`, keep last 3), never overwrites a manual save.
- Save file format: `MECHANICS_SPEC.md §11`.

---

## 17. ERROR / EDGE-CASE HANDLING CHECKLIST

- [ ] Insufficient resources/manpower for an action → inline error message at the point of action,
      never a silent no-op.
- [ ] Duplicate save name → overwrite confirm modal (§16), never silent overwrite.
- [ ] Focus click with unmet prerequisites → disabled node state with tooltip listing missing
      prerequisites by name.
- [ ] WebSocket disconnect (any client) → automatic reconnect attempt (exponential backoff, max 5
      tries) before showing a manual "reconnect" button.
- [ ] Invalid/blocked diplomatic action (relation too low, capital too low) → disabled button + reason
      tooltip, never a rejected-after-click flow.
- [ ] Loading a save from an older `formatVersion` → explicit "incompatible save" error, no silent
      partial load.

---

## 18. WEBSOCKET / API MESSAGE CATALOG (client ↔ server)

```
Client → Server:
  game/new              { nationId }
  game/speed            { level }
  focus/start           { nationId, focusId }
  research/assign       { nationId, techId, slotIndex }
  production/assign     { nationId, lineId, factoryIds[] }
  production/newFactory { nationId, stateId, type }
  division/order        { nationId, divisionId, order, targetProvinceId? }
  template/save         { nationId, template }
  diplomacy/action      { nationId, targetNationId, action }
  law/change            { nationId, category, newValue }
  intel/operation       { nationId, operationType, targetNationId?, agentId }
  event/resolve         { nationId, eventId, choiceIndex }
  save/create           { name }
  save/load             { saveId }
  session/join          { nickname, sessionToken? }

Server → Client (push):
  state/delta           { changedFields... }     // diff only, never full state unless requested
  state/full            { ...}                    // on initial connect/reconnect only
  notification/toast     { id, category, textKey }
  event/trigger          { event }
  session/playerList     { players[] }
  error                  { code, messageKey }
```
Every client action above MUST validate server-side against MECHANICS_SPEC.md rules even if the UI
already disabled the control — never trust client-side gating alone.

---
END OF FILE. This checklist plus LORE_BIBLE.md and MECHANICS_SPEC.md together are intended to be
sufficient for implementation without further invention of core systems.
