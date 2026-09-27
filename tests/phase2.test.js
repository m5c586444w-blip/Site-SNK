import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let tmp;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'snk-p2-'));
  process.env.SNK_SAVES_DIR = path.join(tmp, 'saves');
  process.env.SNK_SETTINGS_FILE = path.join(tmp, 'settings.json');
  process.env.SNK_MAP_DIR = path.resolve('tests/fixtures/map');
  process.env.SNK_DATA_OVERLAY = path.resolve('tests/fixtures/overlay');
});
after(async () => { await rm(tmp, { recursive: true, force: true }); });

async function newGame(nationId = 'paradis') {
  const { loadGameData } = await import('../server/data/loadData.js');
  const { createGame } = await import('../server/state/gameState.js');
  const data = await loadGameData();
  return { data, state: createGame({ nationId, historicalMode: true }, data) };
}

test('formules §3.3 : production, rampe, pénalité, plancher et plafond', async () => {
  const eco = await import('../shared/economy.js');
  assert.equal(eco.dailyOutput({ equipmentType: 'artillery', assignedFactoryIds: ['a', 'b'], efficiency: 0.5 }), 1.5);
  assert.equal(eco.efficiencyAfterDay(0.995), 1.0);
  assert.ok(Math.abs(eco.efficiencyAfterDay(0.15) - 0.16) < 1e-12);
  assert.ok(Math.abs(eco.efficiencyAfterReassign(0.9) - 0.6) < 1e-12);
  assert.equal(eco.efficiencyAfterReassign(0.2), 0.15);
  assert.equal(eco.infrastructureBuildCost(0), 5);
  assert.equal(eco.infrastructureBuildCost(3), 20);
  assert.ok(Math.abs(eco.stateDailyOutput({ infrastructureLevel: 2, resourceDeposits: { steel: 4 } }, 'steel') - 4.4) < 1e-12);
  assert.equal(eco.stateDailyOutput({ infrastructureLevel: 2, resourceDeposits: null }, 'steel'), null);
});

test('stocks initiaux depuis economy_rules, 0 sinon', async () => {
  const { state } = await newGame();
  const p = state.nations.find((n) => n.id === 'paradis');
  const m = state.nations.find((n) => n.id === 'marley');
  assert.deepEqual(p.resourceStockpile, { steel: 5, fuel: 0, rareMaterials: 0 });
  assert.equal(p.equipmentStockpile.infantry_equipment, 100);
  assert.deepEqual(m.resourceStockpile, { steel: 0, fuel: 0, rareMaterials: 0 });
});

test('lignes : création, verrou Paradis, assignation + pénalité, usines déjà prises', async () => {
  const eco = await import('../server/simulation/economy.js');
  const { state } = await newGame();
  assert.throws(() => eco.createLine(state, 'paradis', 'fighter_aircraft'), { code: 'EQUIPMENT_LOCKED' });
  assert.throws(() => eco.createLine(state, 'paradis', 'laser'), { code: 'INVALID_EQUIPMENT' });
  const line = eco.createLine(state, 'paradis', 'infantry_equipment');
  assert.equal(line.efficiency, 0.15);
  line.efficiency = 0.8;
  eco.assignFactories(state, 'paradis', line.id, ['tf_a1_m1']);
  assert.ok(Math.abs(line.efficiency - 0.5) < 1e-12);
  eco.assignFactories(state, 'paradis', line.id, ['tf_a1_m1']); // aucun changement : pas de pénalité
  assert.ok(Math.abs(line.efficiency - 0.5) < 1e-12);
  assert.throws(() => eco.assignFactories(state, 'paradis', line.id, ['tf_a1_c1']), { code: 'FACTORY_NOT_MILITARY' });
  assert.throws(() => eco.assignFactories(state, 'paradis', line.id, ['tf_b_m1']), { code: 'INVALID_FACTORIES' }); // usine de Marley
  const other = eco.createLine(state, 'paradis', 'artillery');
  assert.throws(() => eco.assignFactories(state, 'paradis', other.id, ['tf_a1_m1']), { code: 'FACTORY_BUSY' });
  eco.deleteLine(state, 'paradis', line.id);
  eco.assignFactories(state, 'paradis', other.id, ['tf_a1_m1']);
});

test('tick : ressources, production, rampe d\'efficacité, construction', async () => {
  const eco = await import('../server/simulation/economy.js');
  const { runDay } = await import('../server/simulation/tick.js');
  const { state, data } = await newGame();
  const p = state.nations.find((n) => n.id === 'paradis');
  const line = eco.createLine(state, 'paradis', 'infantry_equipment');
  eco.assignFactories(state, 'paradis', line.id, ['tf_a1_m1', 'tf_a1_m2']);
  eco.queueNewFactory(state, 'paradis', 'test_state_a2', 'military', data.economyRules); // coût 15
  const { dailyNet } = await runDay(state, data);
  // A1 : acier 1 * 1.10 ; A2 : carburant 2, rares 1 (infra 0)
  assert.ok(Math.abs(dailyNet.paradis.produced.steel - 1.1) < 1e-9);
  assert.equal(dailyNet.paradis.produced.fuel, 2);
  assert.ok(Math.abs(p.resourceStockpile.steel - 6.1) < 1e-9);
  // 2 usines * 3.0 * 0.15 = 0.9
  assert.ok(Math.abs(p.equipmentStockpile.infantry_equipment - 100.9) < 1e-9);
  assert.ok(Math.abs(line.efficiency - 0.16) < 1e-9);
  // 3 usines civiles -> 3/jour ; 15 -> terminé au 5e jour
  assert.equal(state.constructionQueues.paradis[0].progress, 3);
  for (let i = 0; i < 4; i++) await runDay(state, data);
  assert.equal(state.constructionQueues.paradis.length, 0);
  assert.equal(state.states.find((s) => s.id === 'test_state_a2').factories.filter((f) => f.type === 'military').length, 1);
});

test('construction : coût manquant = refus explicite ; conversion civile -> militaire', async () => {
  const eco = await import('../server/simulation/economy.js');
  const { state } = await newGame();
  const noRules = { factoryBuildCost: { civilian: null, military: null }, factoryConversionCost: null };
  assert.throws(() => eco.queueNewFactory(state, 'paradis', 'test_state_a1', 'civilian', noRules), { code: 'FACTORY_COST_MISSING' });
  assert.throws(() => eco.queueConversion(state, 'paradis', 'test_state_a1', noRules), { code: 'CONVERSION_COST_MISSING' });
  const rules = { factoryConversionCost: 1 };
  assert.throws(() => eco.queueNewFactory(state, 'paradis', 'test_state_b', 'civilian', { factoryBuildCost: { civilian: 1 } }), { code: 'INVALID_STATE' });
  eco.queueConversion(state, 'paradis', 'test_state_a2', rules);
  assert.throws(() => eco.queueConversion(state, 'paradis', 'test_state_a2', rules), { code: 'NO_CIVILIAN_FACTORY' });
  eco.economyDay(state, 'paradis', rules);
  assert.equal(state.states.find((s) => s.id === 'test_state_a2').factories[0].type, 'military');
});

test('recherche §4 : slots, durée, prérequis, catégories verrouillées, annulation', async () => {
  const rs = await import('../server/simulation/research.js');
  const { researchDays, researchSlotCount } = await import('../shared/research.js');
  const { state, data } = await newGame();
  const techs = data.technologies;
  const p = state.nations.find((n) => n.id === 'paradis');
  const m = state.nations.find((n) => n.id === 'marley');
  assert.equal(researchSlotCount(p), 3);
  assert.equal(researchSlotCount(m), null); // rang major/minor non spécifié
  assert.throws(() => rs.assignResearch(state, 'marley', 'test_infantry_1', 0, techs), { code: 'RESEARCH_SLOTS_UNKNOWN' });
  m.researchTier = 'major';
  assert.equal(researchSlotCount(m), 4);

  assert.throws(() => rs.assignResearch(state, 'paradis', 'test_navy_1', 0, techs), { code: 'CATEGORY_LOCKED' });
  assert.throws(() => rs.assignResearch(state, 'paradis', 'test_infantry_2', 0, techs), { code: 'PREREQUISITES_MISSING' });
  assert.throws(() => rs.assignResearch(state, 'paradis', 'test_infantry_1', 3, techs), { code: 'INVALID_SLOT' });
  rs.assignResearch(state, 'paradis', 'test_infantry_1', 0, techs);
  assert.throws(() => rs.assignResearch(state, 'paradis', 'test_industry_1', 0, techs), { code: 'SLOT_BUSY' });
  assert.throws(() => rs.assignResearch(state, 'paradis', 'test_infantry_1', 1, techs), { code: 'TECH_IN_PROGRESS' });

  assert.equal(researchDays({ baseCostDays: 30, category: 'doctrine' }, { categoryBonus: { doctrine: 0.5 } }), 20);

  for (let i = 0; i < 9; i++) rs.researchDay(state, 'paradis');
  assert.equal(p.activeResearch[0].daysRemaining, 1);
  assert.deepEqual(rs.researchDay(state, 'paradis'), ['test_infantry_1']);
  assert.deepEqual(p.completedTechIds, ['test_infantry_1']);
  rs.assignResearch(state, 'paradis', 'test_infantry_2', 0, techs);
  rs.cancelResearch(state, 'paradis', 0);
  assert.equal(p.activeResearch.length, 0);
});

test('sauvegarde : lignes, file de construction et stocks conservés', async () => {
  const eco = await import('../server/simulation/economy.js');
  const saves = await import('../server/state/saves.js');
  const { state, data } = await newGame();
  const line = eco.createLine(state, 'paradis', 'artillery');
  eco.assignFactories(state, 'paradis', line.id, ['tf_a1_m1']);
  eco.queueNewFactory(state, 'paradis', 'test_state_a1', 'civilian', data.economyRules);
  const s = await saves.createSave('p2', state);
  const loaded = await saves.loadSave(s.id);
  assert.deepEqual(loaded.productionLines, state.productionLines);
  assert.deepEqual(loaded.constructionQueues, state.constructionQueues);
  assert.equal(loaded.nextId, state.nextId);
  assert.deepEqual(loaded.nations[0].resourceStockpile, state.nations[0].resourceStockpile);
});

test('API : actions de nation validées côté serveur', async () => {
  const { createServer } = await import('../server/app.js');
  const { server, close } = await createServer({ onQuit: () => {} });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) });
  try {
    await post('/api/game/new', { nationId: 'paradis', historicalMode: false });
    let r = await post('/api/nation/marley/production/newLine', { equipmentType: 'artillery' });
    assert.equal(r.status, 403);
    r = await post('/api/nation/paradis/production/newLine', { equipmentType: 'naval_hull_light' });
    assert.equal((await r.json()).error.code, 'EQUIPMENT_LOCKED');
    r = await post('/api/nation/paradis/production/newLine', { equipmentType: 'artillery' });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.economy.productionLines.length, 1);
    r = await post('/api/nation/paradis/research/assign', { techId: 'test_industry_1', slotIndex: 0 });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).nation.activeResearch[0].techId, 'test_industry_1');
    r = await post('/api/nation/paradis/nope/nope', {});
    assert.equal(r.status, 404);
  } finally {
    close();
  }
});
