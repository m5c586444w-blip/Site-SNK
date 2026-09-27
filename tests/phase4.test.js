import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let tmp;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'snk-p4-'));
  process.env.SNK_SAVES_DIR = path.join(tmp, 'saves');
  process.env.SNK_SETTINGS_FILE = path.join(tmp, 'settings.json');
  process.env.SNK_MAP_DIR = path.resolve('tests/fixtures/map');
  delete process.env.SNK_DATA_OVERLAY; // vraies données : focus, évènements, scénario sans guerre
});
after(async () => { await rm(tmp, { recursive: true, force: true }); });

async function setup(nationId = 'paradis', historicalMode = true) {
  const { loadGameData } = await import('../server/data/loadData.js');
  const { createGame } = await import('../server/state/gameState.js');
  const { effectContext } = await import('../server/simulation/tick.js');
  const data = await loadGameData();
  const state = createGame({ nationId, historicalMode }, data);
  return { data, state, ctx: effectContext(state, data) };
}
const setDate = (state, s) => { const [d, m, y] = s.match(/\d+/g).map(Number); state.date = { day: d, month: m, year: y }; };
const nation = (state, id) => state.nations.find((n) => n.id === id);

test('conditions §5.3 : grammaire de la table, erreurs de syntaxe refusées', async () => {
  const { evaluateCondition, parseCondition } = await import('../shared/conditions.js');
  const ctx = {
    date: { day: 1, month: 1, year: 850 }, settings: { historicalMode: true },
    nations: [{ id: 'paradis', titanPowersHeld: ['TITAN_FOUNDING'], completedFocusIds: ['X'], stability: 20 }],
    events: { WALL_BREACH_845: { fired: true } },
  };
  ctx.nation = ctx.nations[0];
  assert.equal(evaluateCondition("date == '01/01/an-850' AND event.WALL_BREACH_845.fired == true", ctx), true);
  assert.equal(evaluateCondition("date >= '01/01/an-850' AND date <= '01/01/an-851'", ctx), true);
  assert.equal(evaluateCondition("nation('Paradis').titanPowersHeld includes 'TITAN_FOUNDING'", ctx), true);
  assert.equal(evaluateCondition('nation.completedFocusIds includes "X" AND nation.stability < 30', ctx), true);
  assert.equal(evaluateCondition('event.TROST_CRISIS_850.fired == true', ctx), false);
  assert.equal(evaluateCondition("GameSettings.historicalMode == true AND NOT (date < '01/01/an-845')", ctx), true);
  assert.throws(() => parseCondition("date == '01/01/an-850' AND"));
  assert.throws(() => parseCondition('eval(1)'));
});

test('Mode libre : aucun évènement de la chaîne ne se déclenche, quelle que soit la date', async () => {
  const { eventsDay } = await import('../server/simulation/events.js');
  const { state, ctx } = await setup('paradis', false);
  for (const d of ['01/01/an-845', '01/01/an-850', '15/06/an-850', '01/01/an-851', '01/01/an-854', '01/01/an-860']) {
    setDate(state, d);
    assert.deepEqual(eventsDay(state, ctx), []);
  }
  assert.deepEqual(state.pendingEvents, []);
  assert.deepEqual(state.journal.filter((j) => j.category === 'historical_chain'), []);
});

test('Mode historique : la brèche de 845 survient et révèle Marley ; modale bloquante pour le joueur', async () => {
  const { eventsDay } = await import('../server/simulation/events.js');
  const { state, ctx } = await setup('paradis', true);
  setDate(state, '31/12/an-844');
  assert.deepEqual(eventsDay(state, ctx), []);
  setDate(state, '01/01/an-845');
  assert.deepEqual(eventsDay(state, ctx), ['WALL_BREACH_845']);
  assert.deepEqual(state.pendingEvents, ['WALL_BREACH_845']);
  assert.equal(state.eventLog.WALL_BREACH_845.fired, true);
  const { resolveEvent } = await import('../server/simulation/events.js');
  resolveEvent(state, 'paradis', 'WALL_BREACH_845', 0, ctx);
  assert.equal(state.visibility.paradis.nations.marley, 'known'); // REVEAL_TRIGGERS scripted_event
  assert.deepEqual(state.pendingEvents, []);
  assert.ok(state.journal.some((j) => j.category === 'historical_chain'));
});

test('focus d\'évitement : AVERT_BREACH_845 terminé à temps empêche la brèche et la suite de la chaîne', async () => {
  const { startFocus, focusDay } = await import('../server/simulation/focus.js');
  const { eventsDay } = await import('../server/simulation/events.js');
  const { state, data, ctx } = await setup('paradis', true);
  assert.throws(() => startFocus(state, 'paradis', 'AVERT_BREACH_845', data.focuses), { code: 'PREREQUISITES_MISSING' });
  startFocus(state, 'paradis', 'PARADIS_WALL_WATCH', data.focuses);
  assert.throws(() => startFocus(state, 'paradis', 'PARADIS_COMMAND_REVIEW', data.focuses), { code: 'FOCUS_SLOT_BUSY' });
  for (let i = 0; i < 35; i++) focusDay(state, 'paradis', data.focuses, ctx);
  startFocus(state, 'paradis', 'AVERT_BREACH_845', data.focuses);
  for (let i = 0; i < 70; i++) focusDay(state, 'paradis', data.focuses, ctx);
  assert.ok(nation(state, 'paradis').completedFocusIds.includes('AVERT_BREACH_845'));
  setDate(state, '01/01/an-845');
  assert.deepEqual(eventsDay(state, ctx), []);
  setDate(state, '01/01/an-850');
  // Sans la brèche, ni Trost ni la perte des Titans marleyens ; le coup d'État reste possible (§5.3).
  assert.deepEqual(eventsDay(state, ctx).sort(), ['OCEAN_DISCOVERY_850', 'PARADIS_COUP_850']);
});

test('chaîne complète : 850 → guerre Marley/Alliance → fin souple 854 → Grondement', async () => {
  const { eventsDay, resolveEvent } = await import('../server/simulation/events.js');
  const { diplomacyDay } = await import('../server/simulation/diplomacy.js');
  const { state, data, ctx } = await setup('paradis', true);
  setDate(state, '01/01/an-845');
  eventsDay(state, ctx);
  resolveEvent(state, 'paradis', 'WALL_BREACH_845', 0, ctx);
  setDate(state, '01/01/an-850');
  const fired = eventsDay(state, ctx);
  assert.deepEqual(fired, ['TROST_CRISIS_850', 'MARLEY_TITAN_LOSS_850', 'PARADIS_COUP_850', 'OCEAN_DISCOVERY_850', 'MARLEY_MIDEAST_WAR_850_854']);
  // Marley est IA : ses évènements sont appliqués (premier choix) sans modale
  assert.deepEqual(state.pendingEvents, ['TROST_CRISIS_850', 'PARADIS_COUP_850', 'OCEAN_DISCOVERY_850']);
  assert.deepEqual(state.wars, [['marley', 'mideast_alliance']]);
  for (const id of [...state.pendingEvents]) resolveEvent(state, 'paradis', id, 0, ctx);
  assert.equal(nation(state, 'paradis').flags.royalBloodlineFlag, true);
  assert.equal(state.visibility.paradis.nations.hizuru, 'partially_known'); // découverte de l'océan
  assert.equal(state.visibility.paradis.nations.marley, 'known'); // jamais dégradé
  setDate(state, '31/12/an-853');
  diplomacyDay(state, data.diplomacyRules);
  assert.equal(state.wars.length, 1);
  setDate(state, '01/01/an-854');
  diplomacyDay(state, data.diplomacyRules);
  assert.equal(state.wars.length, 0);
  assert.equal(state.eventLog.MARLEY_MIDEAST_WAR_850_854.resolved, true);
  assert.deepEqual(eventsDay(state, ctx), ['RUMBLING_854']);
  resolveEvent(state, 'paradis', 'RUMBLING_854', 0, ctx);
  assert.equal(state.states.find((s) => s.id === 'test_state_b').factories.length, 0);
  assert.ok(state.states.find((s) => s.id === 'test_state_a1').factories.length > 0);
});

test('DELAY_OCEAN_DISCOVERY repousse la découverte d\'un an sans l\'annuler', async () => {
  const { eventsDay } = await import('../server/simulation/events.js');
  const { state, ctx } = await setup('paradis', true);
  nation(state, 'paradis').completedFocusIds.push('DELAY_OCEAN_DISCOVERY');
  setDate(state, '01/06/an-850');
  assert.ok(!eventsDay(state, ctx).includes('OCEAN_DISCOVERY_850'));
  setDate(state, '01/01/an-851');
  assert.ok(eventsDay(state, ctx).includes('OCEAN_DISCOVERY_850'));
});

test('AVERT_RUMBLING empêche le Grondement ; le focus de fin de partie l\'exige et l\'exclut', async () => {
  const { eventsDay } = await import('../server/simulation/events.js');
  const { focusBlockers } = await import('../server/simulation/focus.js');
  const { state, data, ctx } = await setup('paradis', true);
  const p = nation(state, 'paradis');
  state.eventLog.MARLEY_MIDEAST_WAR_850_854 = { fired: true, resolved: true };
  p.completedFocusIds.push('AVERT_RUMBLING');
  setDate(state, '01/01/an-854');
  assert.ok(!eventsDay(state, ctx).includes('RUMBLING_854'));
  const awaken = data.focuses.find((f) => f.id === 'PARADIS_WALLS_AWAKEN');
  assert.ok(focusBlockers(state, p, awaken).some((b) => b.code === 'MUTUALLY_EXCLUSIVE'));
  p.titanPowersHeld = [];
  assert.ok(focusBlockers(state, p, awaken).some((b) => b.code === 'TITAN_POWER_REQUIRED'));
});

test('focus EXPLORATION_ : levée progressive du brouillard et contact diplomatique', async () => {
  const { focusDay } = await import('../server/simulation/focus.js');
  const { state, data, ctx } = await setup('paradis', false);
  const p = nation(state, 'paradis');
  p.completedFocusIds.push('PARADIS_COMMAND_REVIEW', 'PARADIS_GARRISON_DRILL', 'PARADIS_RECON_CORPS');
  p.activeFocusId = 'EXPLORATION_BEYOND_WALLS'; p.focusDaysRemaining = 1;
  focusDay(state, 'paradis', data.focuses, ctx);
  assert.equal(state.visibility.paradis.nations.marley, 'partially_known');
  assert.equal(state.visibility.paradis.provinces.test_b1, 'partially_known');
  p.activeFocusId = 'EXPLORATION_HIZURU_LINEAGE'; p.focusDaysRemaining = 1;
  focusDay(state, 'paradis', data.focuses, ctx);
  assert.equal(state.visibility.paradis.nations.hizuru, 'known');
});

test('focus : effets appliqués ; stabilité absente = effet ignoré et signalé', async () => {
  const { startFocus, focusDay } = await import('../server/simulation/focus.js');
  const { state, data, ctx } = await setup('marley', false);
  const m = nation(state, 'marley');
  startFocus(state, 'marley', 'MARLEY_COLONIAL_LEVIES', data.focuses);
  for (let i = 0; i < 70; i++) focusDay(state, 'marley', data.focuses, ctx);
  assert.equal(m.resourceStockpile.steel, 40);
  assert.equal(m.stability, null);
  assert.ok(state.journal.some((j) => j.textKey === 'journal.effectsSkipped' && j.vars.list.includes('modifyStability')));
  assert.throws(() => startFocus(state, 'marley', 'PARADIS_WALL_WATCH', data.focuses), { code: 'INVALID_FOCUS' });
});

test('Paradis : focus de débouché naval rouvre équipements et catégorie marine', async () => {
  const { applyEffects } = await import('../server/simulation/effects.js');
  const { state, data, ctx } = await setup('paradis', false);
  const p = nation(state, 'paradis');
  applyEffects(state, 'paradis', data.focuses.find((f) => f.id === 'PARADIS_NAVAL_YARDS').effects, ctx);
  assert.ok(!p.lockedEquipment.includes('naval_hull_light'));
  assert.ok(!p.lockedResearchCategories.includes('navy'));
  assert.ok(p.lockedResearchCategories.includes('aviation'));
});

test('diplomatie §8 : capital politique inconnu, seuils, brouillard', async () => {
  const dip = await import('../server/simulation/diplomacy.js');
  const { state } = await setup('marley', false);
  assert.equal(dip.actionBlocker(state, 'marley', 'hizuru', 'guarantee_independence'), 'POLITICAL_CAPITAL_UNKNOWN');
  nation(state, 'marley').politicalCapital = 150;
  assert.equal(dip.actionBlocker(state, 'marley', 'hizuru', 'propose_alliance'), 'RELATION_TOO_LOW');
  dip.changeRelation(state, 'marley', 'hizuru', 60);
  dip.diplomaticAction(state, 'marley', 'hizuru', 'propose_alliance');
  assert.equal(nation(state, 'marley').politicalCapital, 50);
  assert.equal(dip.actionBlocker(state, 'marley', 'hizuru', 'propose_alliance'), 'INSUFFICIENT_POLITICAL_CAPITAL');
  nation(state, 'marley').politicalCapital = 150;
  assert.equal(dip.actionBlocker(state, 'marley', 'hizuru', 'propose_alliance'), 'AGREEMENT_EXISTS');
  dip.changeRelation(state, 'marley', 'hizuru', 500);
  assert.equal(dip.relation(state, 'marley', 'hizuru'), 200); // RELATION_SCALE
  // Paradis sous brouillard : nations inconnues inaccessibles
  assert.equal(dip.actionBlocker(state, 'paradis', 'marley', 'justify_wargoal'), 'NATION_UNKNOWN');
});

test('guerre : 90 jours de justification, garants entraînés, score 100 = paix et cession', async () => {
  const dip = await import('../server/simulation/diplomacy.js');
  const { state, data } = await setup('marley', false);
  const hz = nation(state, 'hizuru'); hz.politicalCapital = 100;
  dip.diplomaticAction(state, 'hizuru', 'paradis', 'guarantee_independence');
  dip.diplomaticAction(state, 'marley', 'paradis', 'justify_wargoal');
  assert.equal(dip.actionBlocker(state, 'marley', 'paradis', 'declare_war'), 'WARGOAL_NOT_READY');
  for (let i = 0; i < 90; i++) dip.diplomacyDay(state, data.diplomacyRules);
  dip.diplomaticAction(state, 'marley', 'paradis', 'declare_war');
  assert.deepEqual(state.wars, [['marley', 'paradis'], ['marley', 'hizuru']]);
  // Marley prend l'état A2 (une province) ; 10 captures = score 100
  state.provinceControl.test_a2 = 'marley';
  state.states.find((s) => s.id === 'test_state_a2').controllerId = 'marley';
  dip.recordCaptures(state, Array.from({ length: 10 }, () => ({ provinceId: 'test_a2', from: 'paradis', to: 'marley' })));
  dip.diplomacyDay(state, data.diplomacyRules);
  assert.deepEqual(state.wars, [['marley', 'hizuru']]);
  assert.equal(state.states.find((s) => s.id === 'test_state_a2').ownerId, 'marley');
  // Pacte de non-agression : plus de but de guerre possible
  nation(state, 'marley').politicalCapital = 100;
  dip.diplomaticAction(state, 'marley', 'mideast_alliance', 'propose_nonaggression');
  assert.equal(dip.actionBlocker(state, 'marley', 'mideast_alliance', 'justify_wargoal'), 'TREATY_FORBIDS_WAR');
});

test('API : évènement bloquant (vitesse refusée), résolution, sauvegarde de la chaîne', async () => {
  const { createServer } = await import('../server/app.js');
  const saves = await import('../server/state/saves.js');
  const { server, close } = await createServer({ onQuit: () => {} });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) });
  try {
    const v = await (await post('/api/game/new', { nationId: 'paradis', historicalMode: true })).json();
    assert.equal(v.focus.tree.length, 21);
    assert.deepEqual(v.diplomacy.nations, []); // Paradis ne connaît personne en 844
    let r = await post('/api/nation/paradis/focus/start', { focusId: 'PARADIS_WALL_WATCH' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).focus.activeFocusId, 'PARADIS_WALL_WATCH');
    r = await post('/api/nation/paradis/event/resolve', { eventId: 'WALL_BREACH_845', choiceIndex: 0 });
    assert.equal(r.status, 404);
  } finally {
    close();
  }
  // sauvegarde : journal, eventLog, pendingEvents
  const { state, ctx } = await setup('paradis', true);
  const { eventsDay } = await import('../server/simulation/events.js');
  setDate(state, '01/01/an-845');
  eventsDay(state, ctx);
  const s = await saves.createSave('p4', state);
  const loaded = await saves.loadSave(s.id);
  assert.deepEqual(loaded.pendingEvents, ['WALL_BREACH_845']);
  assert.deepEqual(loaded.eventLog, state.eventLog);
  assert.equal(loaded.journal.length, state.journal.length);
});
