import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let tmp;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'snk-ai-'));
  process.env.SNK_SAVES_DIR = path.join(tmp, 'saves');
  delete process.env.SNK_MAP_DIR;
  delete process.env.SNK_DATA_OVERLAY;
});
after(async () => { await rm(tmp, { recursive: true, force: true }); });

async function setup({ nationId = 'paradis', historicalMode = false, humanNations } = {}) {
  const { loadGameData } = await import('../server/data/loadData.js');
  const { createGame } = await import('../server/state/gameState.js');
  const data = await loadGameData();
  return { data, state: createGame({ nationId, historicalMode, humanNations }, data) };
}
async function simulate(state, data, days) {
  const { runDay } = await import('../server/simulation/tick.js');
  const { nextDay } = await import('../shared/calendar.js');
  for (let i = 0; i < days; i++) { state.date = nextDay(state.date); await runDay(state, data); }
}
const nation = (s, id) => s.nations.find((n) => n.id === id);

test('IA : focus, recherche, lignes de production et construction dès la première semaine', async () => {
  const { state, data } = await setup({ humanNations: [] });
  await simulate(state, data, 8);
  for (const id of ['marley', 'mideast_alliance', 'hizuru', 'paradis']) {
    const n = nation(state, id);
    assert.ok(n.activeFocusId || n.completedFocusIds.length, `${id} focus`);
    assert.ok(n.activeResearch.length > 0, `${id} recherche`);
    assert.ok(state.productionLines.some((l) => l.nationId === id && l.assignedFactoryIds.length), `${id} production`);
  }
});

test('IA en Mode historique : aucun focus d\'évitement, aucune guerre spontanée', async () => {
  const { state, data } = await setup({ historicalMode: true, humanNations: [] });
  await simulate(state, data, 360);
  const avert = new Set(data.focuses.filter((f) => f.avertsEventId || f.delaysEventId).map((f) => f.id));
  for (const n of state.nations) {
    assert.ok(![...n.completedFocusIds, n.activeFocusId].some((f) => avert.has(f)), `${n.id} a pris un focus d'évitement`);
  }
  assert.deepEqual(state.wars, []);
  assert.deepEqual(state.wargoals, []);
});

test('IA : la nation du joueur humain n\'est jamais pilotée', async () => {
  const { state, data } = await setup({ nationId: 'hizuru', humanNations: ['hizuru'] });
  await simulate(state, data, 14);
  const h = nation(state, 'hizuru');
  assert.equal(h.activeFocusId, null);
  assert.equal(h.activeResearch.length, 0);
  assert.ok(!state.productionLines.some((l) => l.nationId === 'hizuru'));
});

test('débarquement : coques consommées, transit, assaut amphibie à -50 %, refus sans marine', async () => {
  const mil = await import('../server/simulation/military.js');
  const { startWar } = await import('../server/simulation/diplomacy.js');
  const { nationModifiers } = await import('../server/simulation/modifiers.js');
  const { state, data } = await setup({ humanNations: ['marley', 'paradis'] });
  const getMods = (id) => nationModifiers(state, id, data.politics);
  startWar(state, 'marley', 'paradis');
  const d = state.divisions.find((x) => x.nationId === 'marley' && x.locationProvinceId === 'mar_ne2');
  const hulls = nation(state, 'marley').equipmentStockpile.naval_hull_light;
  mil.orderDivision(state, data.map, 'marley', d.id, 'advance', 'pa_titan_s', data.militaryRules, getMods);
  assert.equal(nation(state, 'marley').equipmentStockpile.naval_hull_light, hulls - 2);
  assert.equal(d.movement.naval, true);
  for (let i = 0; i < 9; i++) mil.militaryDay(state, data.map, data.militaryRules, getMods);
  assert.equal(d.movement.naval, true); // encore en mer
  assert.equal(d.locationProvinceId, 'mar_ne2');
  // 10e jour : fin du transit et assaut amphibie le jour même
  const r = mil.militaryDay(state, data.map, data.militaryRules, getMods);
  const c = r.combats.find((x) => x.provinceId === 'pa_titan_s');
  assert.ok(c, 'assaut amphibie');
  assert.ok(c.attackerModifierPct <= -40, `malus de débarquement (${c.attackerModifierPct})`);
  // côte non défendue : tête de pont prise, la division débarque
  assert.equal(c.result, 'attacker_wins');
  assert.equal(d.locationProvinceId, 'pa_titan_s');
  assert.equal(d.amphibious, false);
  // Paradis : marine verrouillée
  const p = state.divisions.find((x) => x.nationId === 'paradis');
  p.locationProvinceId = 'pa_titan_s';
  assert.throws(() => mil.orderDivision(state, data.map, 'paradis', p.id, 'advance', 'mar_ne2', data.militaryRules, getMods), { code: 'NO_NAVY' });
});

test('usines : emplacements par état (2 + 2 × infrastructure)', async () => {
  const eco = await import('../server/simulation/economy.js');
  const { state, data } = await setup({ humanNations: ['paradis'] });
  const st = state.states.find((s) => s.id === 'titan_n'); // infrastructure 0 → 2 emplacements, 0 usine
  eco.queueNewFactory(state, 'paradis', st.id, 'civilian', data.economyRules);
  eco.queueNewFactory(state, 'paradis', st.id, 'civilian', data.economyRules);
  assert.throws(() => eco.queueNewFactory(state, 'paradis', st.id, 'civilian', data.economyRules), { code: 'STATE_FULL' });
});

test('Titans : le porteur se replie si une province amie est voisine, sinon il tombe', async () => {
  const { onProvincesCaptured } = await import('../server/simulation/titans.js');
  const { state, data } = await setup();
  const q = [];
  onProvincesCaptured(state, [{ provinceId: 'mar_c', from: 'marley', to: 'mideast_alliance' }], data.politics, (p) => q.push(p), data.map);
  assert.equal(state.titans.TITAN_CART.holderNationId, 'marley');
  assert.notEqual(state.titans.TITAN_CART.provinceId, 'mar_c');
  for (const p of data.map.adjacency.pa_mitras) state.provinceControl[p] = 'marley';
  onProvincesCaptured(state, [{ provinceId: 'pa_mitras', from: 'paradis', to: 'marley' }], data.politics, (p) => q.push(p), data.map);
  assert.deepEqual(q.map((p) => p.titanId), ['TITAN_FOUNDING']);
});

test('chaîne historique sur 11 ans : la guerre Marley/Alliance dure jusqu\'en 854 et Marley la gagne', async () => {
  const { state, data } = await setup({ historicalMode: true, humanNations: [] });
  await simulate(state, data, 4015);
  const peace = state.journal.filter((j) => j.textKey === 'journal.peace');
  assert.ok(peace.some((j) => j.date === '01/01/an-854' && j.vars.winner === 'marley'));
  assert.equal(state.eventLog.RUMBLING_854?.fired, true);
});
