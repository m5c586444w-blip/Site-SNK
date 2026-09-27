import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let tmp;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'snk-p5-'));
  process.env.SNK_SAVES_DIR = path.join(tmp, 'saves');
  process.env.SNK_SETTINGS_FILE = path.join(tmp, 'settings.json');
  delete process.env.SNK_MAP_DIR; // vraie carte [EXTENSION]
  delete process.env.SNK_DATA_OVERLAY; // vraies données [EXTENSION]
});
after(async () => { await rm(tmp, { recursive: true, force: true }); });

async function setup(nationId = 'paradis', historicalMode = false) {
  const { loadGameData } = await import('../server/data/loadData.js');
  const { createGame } = await import('../server/state/gameState.js');
  const { effectContext } = await import('../server/simulation/tick.js');
  const data = await loadGameData();
  const state = createGame({ nationId, historicalMode }, data);
  return { data, state, ctx: effectContext(state, data) };
}
const nation = (s, id) => s.nations.find((n) => n.id === id);

test('données réelles : carte valide, nations complètes, 9 Titans répartis selon le lore', async () => {
  const { validateMap } = await import('../tools/validate-map.js');
  const r = await validateMap(path.resolve('data/map'));
  assert.deepEqual(r.errors, []);
  const { state } = await setup();
  for (const n of state.nations) {
    for (const k of ['stability', 'warSupport', 'politicalCapital', 'manpower']) assert.equal(typeof n[k], 'number', `${n.id}.${k}`);
  }
  assert.deepEqual(nation(state, 'paradis').titanPowersHeld, ['TITAN_FOUNDING', 'TITAN_ATTACK']);
  assert.equal(nation(state, 'marley').titanPowersHeld.length, 7);
  assert.ok(Object.values(state.titans).every((t) => t.holderNationId));
  assert.equal(state.divisions.length, 25);
});

test('§7.3 bonus des Titans : Fondateur (moitié sans lignée royale), Attaque (-10 % focus), Bestial (doctrine)', async () => {
  const { nationModifiers } = await import('../server/simulation/modifiers.js');
  const { startFocus } = await import('../server/simulation/focus.js');
  const { state, data } = await setup();
  const m = nationModifiers(state, 'paradis', data.politics);
  assert.equal(m.stabilityRegen, 0.5);
  nation(state, 'paradis').flags.royalBloodlineFlag = true;
  assert.equal(nationModifiers(state, 'paradis', data.politics).stabilityRegen, 1.0);
  assert.equal(startFocus(state, 'paradis', 'PARADIS_COMMAND_REVIEW', data.focuses, data.politics).daysRemaining, 63);
  const mm = nationModifiers(state, 'marley', data.politics);
  assert.equal(mm.siegePct, 35); // Colossal 20 + Marteau 15
  assert.equal(mm.defensePct, 8 - 5); // Cuirassé +8, Mâchoire -5
  assert.equal(mm.speedPct, 25); // Féminin 10 + Mâchoire 15
  assert.ok(Math.abs(nation(state, 'marley').categoryBonus.doctrine - 0.1) < 1e-9);
});

test('§7.1/§7.5 fin de cycle : Marley sans candidat formé perd le pouvoir, avec candidat il le transmet', async () => {
  const { titansDay, resolveInheritance } = await import('../server/simulation/titans.js');
  const { state } = await setup('paradis');
  state.titans.TITAN_CART.daysRemaining = 1;
  const q = [];
  titansDay(state, (p) => q.push(p));
  assert.deepEqual(q.map((p) => p.titanId), ['TITAN_CART']);
  resolveInheritance(state, q[0], 0);
  assert.equal(state.titans.TITAN_CART.holderNationId, null);
  assert.ok(!nation(state, 'marley').titanPowersHeld.includes('TITAN_CART'));
  state.titans.TITAN_BEAST.daysRemaining = 1;
  state.warriorProgram.candidates.push({ id: 'c1', daysTrained: 365, ready: true });
  const q2 = [];
  titansDay(state, (p) => q2.push(p));
  resolveInheritance(state, q2[0], 0);
  assert.equal(state.titans.TITAN_BEAST.holderNationId, 'marley');
  assert.equal(state.titans.TITAN_BEAST.daysRemaining, 13 * 365);
  assert.equal(state.warriorProgram.candidates.length, 0);
});

test('§7.5 porteur tué par l\'ennemi : un Eldien hérite, un non-Eldien ne peut pas', async () => {
  const { onProvincesCaptured } = await import('../server/simulation/titans.js');
  const { state, data } = await setup('marley');
  const q = [];
  onProvincesCaptured(state, [{ provinceId: 'mar_c', from: 'marley', to: 'mideast_alliance' }], data.politics, (p) => q.push(p));
  assert.deepEqual(q, []);
  assert.equal(state.titans.TITAN_CART.holderNationId, null); // Charrette perdue
  onProvincesCaptured(state, [{ provinceId: 'pa_mitras', from: 'paradis', to: 'marley' }], data.politics, (p) => q.push(p));
  assert.deepEqual(q.map((p) => [p.titanId, p.nationId]), [['TITAN_FOUNDING', 'marley']]);
});

test('évènement historique : les Titans Colossal et Mâchoire passent à Paradis en 850', async () => {
  const { applyEffects } = await import('../server/simulation/effects.js');
  const { state, data, ctx } = await setup('paradis', true);
  const ev = data.events.find((e) => e.id === 'MARLEY_TITAN_LOSS_850');
  applyEffects(state, 'marley', ev.choices[0].effects, ctx);
  assert.ok(nation(state, 'paradis').titanPowersHeld.includes('TITAN_COLOSSAL'));
  assert.ok(nation(state, 'paradis').titanPowersHeld.includes('TITAN_JAW'));
  assert.equal(nation(state, 'marley').titanPowersHeld.length, 5);
});

test('§7.4 programme des Guerriers : vivier max 5, formation 365 jours, défection selon §9.3', async () => {
  const pol = await import('../server/simulation/politics.js');
  const { state, data, ctx } = await setup('marley');
  for (let i = 0; i < 5; i++) pol.recruitCandidate(state, 'marley');
  assert.throws(() => pol.recruitCandidate(state, 'marley'), { code: 'POOL_FULL' });
  assert.throws(() => pol.recruitCandidate(state, 'paradis'), { code: 'MARLEY_ONLY' });
  assert.equal(pol.defectionChance(nation(state, 'marley')), 0.0005 * 0.5); // strict
  state.rngState = 1;
  for (let i = 0; i < 365; i++) pol.politicsDay(state, 'marley', data.politics, ctx);
  const c = state.warriorProgram.candidates;
  assert.ok(c.every((x) => x.ready || x.daysTrained < 365));
  assert.ok(c.some((x) => x.ready));
});

test('§9 lois : délai de 90 jours, effets à l\'adoption ; statut eldien §9.3', async () => {
  const pol = await import('../server/simulation/politics.js');
  const { state, data, ctx } = await setup('marley');
  const m = nation(state, 'marley');
  const s0 = m.stability;
  pol.changeLaw(state, 'marley', 'economic_mobilization', 'war_economy', data.politics, ctx);
  assert.equal(m.stability, s0 - 8);
  assert.throws(() => pol.changeLaw(state, 'marley', 'economic_mobilization', 'civilian_economy', data.politics, ctx), { code: 'LAW_COOLDOWN' });
  for (let i = 0; i < 90; i++) pol.politicsDay(state, 'marley', data.politics, ctx);
  pol.changeLaw(state, 'marley', 'economic_mobilization', 'civilian_economy', data.politics, ctx);
  const s1 = m.stability;
  pol.changeEldianPolicy(state, 'marley', 'relaxed');
  assert.equal(m.stability, Math.max(0, s1 - 10)); // +5 (strict) -> -5 (relaxed)
  assert.equal(pol.defectionChance(m), 0.0005 * 1.5);
  assert.throws(() => pol.changeEldianPolicy(state, 'paradis', 'strict'), { code: 'MARLEY_ONLY' });
});

test('renseignement : reconnaissance de Paradis vers le territoire inconnu révèle une nation', async () => {
  const intel = await import('../server/simulation/intel.js');
  const { state, data } = await setup('paradis');
  assert.deepEqual(intel.intelTargets(state, 'paradis'), [intel.UNKNOWN_TARGET]);
  let revealed = false;
  for (let i = 0; i < 10 && !revealed; i++) {
    state.agents.paradis[0].busyDays = 0;
    nation(state, 'paradis').politicalCapital = 50;
    const r = intel.runOperation(state, data.map, 'paradis', 'reconnaissance', intel.UNKNOWN_TARGET, 'agent_paradis_1', data.politics);
    revealed = r.success;
  }
  assert.ok(revealed);
  assert.ok(Object.values(state.visibility.paradis.nations).includes('partially_known'));
  assert.throws(() => intel.runOperation(state, data.map, 'paradis', 'reconnaissance', intel.UNKNOWN_TARGET, 'agent_paradis_1', data.politics), { code: 'AGENT_BUSY' });
});

test('technologies [EXTENSION] : effets appliqués à la fin de la recherche', async () => {
  const { assignResearch } = await import('../server/simulation/research.js');
  const { runDay } = await import('../server/simulation/tick.js');
  const { state, data } = await setup('marley');
  assignResearch(state, 'marley', 'ind_mechanised_mills', 0, data.technologies);
  for (let i = 0; i < 100; i++) await runDay(state, data);
  assert.equal(nation(state, 'marley').modifiers.productionOutputPct, 10);
});

test('mouvement : durée selon la vitesse (§6.2 + Titans) ; renforts hors combat', async () => {
  const mil = await import('../server/simulation/military.js');
  const { nationModifiers } = await import('../server/simulation/modifiers.js');
  const { state, data } = await setup('marley');
  const getMods = (id) => nationModifiers(state, id, data.politics);
  const d = state.divisions.find((x) => x.nationId === 'marley' && x.locationProvinceId === 'mar_cap');
  const to = data.map.adjacency.mar_cap.find((p) => state.provinceControl[p] === 'marley');
  mil.orderDivision(state, data.map, 'marley', d.id, 'advance', to, data.militaryRules, getMods);
  // infanterie vitesse 4, +25 % (Féminin + Mâchoire) = 5 -> ceil(12/5) = 3 jours
  assert.equal(d.movement.daysRemaining, 3);
  for (let i = 0; i < 3; i++) mil.militaryDay(state, data.map, data.militaryRules, getMods);
  assert.equal(d.locationProvinceId, to);
  d.strength = 50;
  mil.militaryDay(state, data.map, data.militaryRules, getMods);
  assert.equal(d.strength, 52);
});

test('économie : consommation de ressources et Titan Charrette (+0,1 ravitaillement)', async () => {
  const eco = await import('../server/simulation/economy.js');
  const mil = await import('../server/simulation/military.js');
  const { nationModifiers } = await import('../server/simulation/modifiers.js');
  const { state, data } = await setup('marley');
  const line = eco.createLine(state, 'marley', 'light_armor');
  const fac = eco.nationFactories(state, 'marley').filter((f) => f.type === 'military').slice(0, 2).map((f) => f.id);
  eco.assignFactories(state, 'marley', line.id, fac);
  const m = nation(state, 'marley');
  const fuel0 = m.resourceStockpile.fuel;
  const net = eco.economyDay(state, 'marley', data.economyRules, data.politics);
  assert.ok(Math.abs(net.consumed.fuel - 0.6) < 1e-9);
  assert.ok(m.resourceStockpile.fuel < fuel0 + net.produced.fuel);
  mil.militaryDay(state, data.map, data.militaryRules, (id) => nationModifiers(state, id, data.politics));
  const patria = state.states.find((s) => s.id === 'patria');
  assert.equal(patria.supplyValue, 1); // 0.5 + 0.5 infra, +0.1 plafonné
  const st = state.states.find((s) => s.id === 'nidereldia');
  assert.ok(Math.abs(st.supplyValue - 0.9) < 1e-9); // 0.5 + 0.3 + 0.1 (Charrette)
});

test('multijoueur : les évènements d\'un autre joueur humain ne sont pas résolus par l\'IA', async () => {
  const { loadGameData } = await import('../server/data/loadData.js');
  const { createGame } = await import('../server/state/gameState.js');
  const { effectContext } = await import('../server/simulation/tick.js');
  const { eventsDay } = await import('../server/simulation/events.js');
  const data = await loadGameData();
  const state = createGame({ nationId: 'paradis', historicalMode: true, humanNations: ['paradis', 'marley'] }, data);
  const ctx = effectContext(state, data);
  state.date = { day: 1, month: 1, year: 850 };
  state.eventLog.WALL_BREACH_845 = { fired: true };
  state.eventLog.TROST_CRISIS_850 = { fired: true };
  eventsDay(state, ctx);
  assert.ok(state.pendingEvents.includes('MARLEY_TITAN_LOSS_850'));
});
