import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let tmp;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'snk-p3-'));
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
  return { data, state: createGame({ nationId, historicalMode: false }, data) };
}
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('voisinage déduit du masque (la mer ne relie rien)', async () => {
  const { data } = await newGame();
  const adj = data.map.adjacency;
  assert.deepEqual(adj.test_b3, ['test_a2', 'test_b1']);
  assert.ok(adj.test_a1.includes('test_a2') && adj.test_a1.includes('test_a3'));
  assert.ok(!adj.test_a1.includes('test_b1'));
  assert.deepEqual(adj.test_b2, ['test_b1']);
});

test('§6.2 statistiques de modèle ; vitesse N/D sans données', async () => {
  const { computeTemplateStats } = await import('../shared/military.js');
  const s = computeTemplateStats([{ battalionType: 'infantry', count: 4 }, { battalionType: 'artillery', count: 2 }]);
  assert.deepEqual(s, { attack: 18, defense: 14, width: 6, speed: null, manpowerCost: 4600, equipmentCost: { infantry_equipment: 144, artillery: 24 } });
  const f = computeTemplateStats([{ battalionType: 'infantry', count: 1 }, { battalionType: 'medium_armor', count: 1 }], { infantry: 4, medium_armor: 6 });
  assert.equal(f.speed, 4);
});

test('modèles : largeur max 20, validation, suppression refusée si utilisé', async () => {
  const mil = await import('../server/simulation/military.js');
  const { state, data } = await newGame();
  assert.throws(() => mil.saveTemplate(state, 'paradis', { name: 'x', battalions: [{ battalionType: 'medium_armor', count: 7 }] }, data.militaryRules), { code: 'TEMPLATE_TOO_WIDE' });
  assert.throws(() => mil.saveTemplate(state, 'paradis', { name: 'x', battalions: [] }, data.militaryRules), { code: 'EMPTY_TEMPLATE' });
  assert.throws(() => mil.saveTemplate(state, 'paradis', { name: 'x', battalions: [{ battalionType: 'titan', count: 1 }] }, data.militaryRules), { code: 'INVALID_BATTALION' });
  const t = mil.saveTemplate(state, 'paradis', { name: 'Large', battalions: [{ battalionType: 'infantry', count: 10 }, { battalionType: 'infantry', count: 10 }] }, data.militaryRules);
  assert.deepEqual(t.battalions, [{ battalionType: 'infantry', count: 20 }]);
  assert.equal(t.computedStats.width, 20);
  mil.saveTemplate(state, 'paradis', { id: t.id, name: 'Renamed', battalions: [{ battalionType: 'infantry', count: 2 }] }, data.militaryRules);
  assert.equal(state.templates.find((x) => x.id === t.id).name, 'Renamed');
  assert.throws(() => mil.deleteTemplate(state, 'paradis', 'tpl_test_p'), { code: 'TEMPLATE_IN_USE' });
  mil.deleteTemplate(state, 'paradis', t.id);
});

test('création de division : coûts déduits, manques refusés avec détail', async () => {
  const mil = await import('../server/simulation/military.js');
  const { state } = await newGame();
  const p = state.nations.find((n) => n.id === 'paradis');
  // 4 inf = 4000 hommes, 144 équipements ; stock de test : 100
  assert.throws(() => mil.createDivision(state, 'paradis', 'tpl_test_p', 'test_a1'), (e) => e.code === 'INSUFFICIENT_EQUIPMENT' && e.details[0].need === 144);
  p.equipmentStockpile.infantry_equipment = 200;
  assert.throws(() => mil.createDivision(state, 'paradis', 'tpl_test_p', 'test_b1'), { code: 'INVALID_PROVINCE' });
  const d = mil.createDivision(state, 'paradis', 'tpl_test_p', 'test_a1');
  assert.equal(p.manpower, 16000);
  assert.equal(p.equipmentStockpile.infantry_equipment, 56);
  assert.equal(d.organization, 100);
  const h = state.nations.find((n) => n.id === 'hizuru');
  state.templates.push({ id: 'tpl_h', nationId: 'hizuru', name: 'h', battalions: [], computedStats: { manpowerCost: 1, equipmentCost: {} } });
  assert.equal(h.manpower, null);
  assert.throws(() => mil.createDivision(state, 'hizuru', 'tpl_h', 'test_a1'), { code: 'INVALID_PROVINCE' });
});

test('ordres : cible voisine en guerre, retraite refusée sans règle de mouvement, front', async () => {
  const mil = await import('../server/simulation/military.js');
  const { state, data } = await newGame();
  const { map, militaryRules } = data;
  assert.throws(() => mil.orderDivision(state, map, 'marley', 'div_test_m1', 'advance', 'test_a1', militaryRules), { code: 'INVALID_TARGET' });
  // Avancer vers une province amie = se déplacer : refusé sans règle de mouvement
  assert.throws(() => mil.orderDivision(state, map, 'marley', 'div_test_m1', 'advance', 'test_b1', militaryRules), { code: 'MOVEMENT_RULES_MISSING' });
  state.wars = [];
  assert.throws(() => mil.orderDivision(state, map, 'marley', 'div_test_m1', 'advance', 'test_a2', militaryRules), { code: 'NOT_AT_WAR' });
  state.wars = [['paradis', 'marley']];
  mil.orderDivision(state, map, 'marley', 'div_test_m1', 'advance', 'test_a2', militaryRules);
  assert.throws(() => mil.orderDivision(state, map, 'paradis', 'div_test_m1', 'hold', null, militaryRules), { code: 'INVALID_DIVISION' });
  assert.throws(() => mil.orderDivision(state, map, 'paradis', 'div_test_p1', 'retreat', null, militaryRules), { code: 'MOVEMENT_RULES_MISSING' });
  assert.throws(() => mil.orderDivision(state, map, 'paradis', 'div_test_p1', 'charge', null, militaryRules), { code: 'INVALID_ORDER' });
  assert.equal(mil.setFront(state, map, 'paradis', 'div_test_p1').frontId, 'front:marley|paradis');
  assert.throws(() => mil.setFront(state, map, 'paradis', 'div_test_p2'), { code: 'NO_FRONT' });
  // Retraite avec une règle de mouvement renseignée
  const rules = { ...militaryRules, movementDaysPerProvince: 2 };
  mil.orderDivision(state, map, 'paradis', 'div_test_p1', 'retreat', 'test_a1', rules);
  mil.militaryDay(state, map, rules);
  mil.militaryDay(state, map, rules);
  assert.equal(state.divisions.find((d) => d.id === 'div_test_p1').locationProvinceId, 'test_a1');
});

test('§6.3 combat : puissances, facteur aléatoire, organisation, bonus du Mur', async () => {
  const mil = await import('../server/simulation/military.js');
  const { state, data } = await newGame();
  const { map, militaryRules } = data;
  // Mur : A1 est un état de Mur ; on place le défenseur en A1 et l'attaquant en A2 (conquis).
  state.provinceControl.test_a2 = 'marley';
  const p1 = state.divisions.find((d) => d.id === 'div_test_p1');
  p1.locationProvinceId = 'test_a1';
  const m1 = state.divisions.find((d) => d.id === 'div_test_m1');
  m1.locationProvinceId = 'test_a2';
  mil.orderDivision(state, map, 'marley', 'div_test_m1', 'advance', 'test_a1', militaryRules);
  const { combats } = mil.militaryDay(state, map, militaryRules);
  const c = combats[0];
  approx(c.attackerPower, 18); // 4*2 + 2*5, org 100, eff 100
  approx(c.defenderPower, 12 * 1.5); // 4*3 * (1 + 0.5 Mur)
  approx(c.resultRatio, 1.0);
  assert.ok(c.randomFactor >= 0.85 && c.randomFactor <= 1.15);
  assert.equal(c.isWallFortified, true);
  const expected = c.outcome > 1.15 ? 'attacker_wins' : c.outcome < 0.85 ? 'defender_holds' : 'inconclusive';
  assert.equal(c.result, expected);
});

test('combat décisif : capture, défenseurs repoussés, attaquant avance, contrôle de l\'état', async () => {
  const mil = await import('../server/simulation/military.js');
  const { state, data } = await newGame();
  const { map, militaryRules } = data;
  const p1 = state.divisions.find((d) => d.id === 'div_test_p1');
  p1.organization = 1; // défense quasi nulle -> victoire certaine de l'attaquant
  mil.orderDivision(state, map, 'marley', 'div_test_m1', 'advance', 'test_a2', militaryRules);
  const r = mil.militaryDay(state, map, militaryRules);
  assert.equal(r.combats[0].result, 'attacker_wins');
  assert.deepEqual(r.captured, [{ provinceId: 'test_a2', from: 'paradis', to: 'marley' }]);
  assert.equal(state.provinceControl.test_a2, 'marley');
  assert.equal(state.states.find((s) => s.id === 'test_state_a2').controllerId, 'marley');
  const m1 = state.divisions.find((d) => d.id === 'div_test_m1');
  assert.equal(m1.locationProvinceId, 'test_a2');
  assert.equal(m1.order, 'hold');
  assert.notEqual(p1.locationProvinceId, 'test_a2'); // repoussée vers A1 ou A3
  assert.equal(p1.organization, 0); // 1 - 25, borné à 0 (pas de regain : en combat ce jour)
});

test('encerclement : défenseur sans repli détruit ; hors combat +5 org', async () => {
  const mil = await import('../server/simulation/military.js');
  const { state, data } = await newGame();
  const { map, militaryRules } = data;
  state.provinceControl.test_a1 = 'marley';
  state.provinceControl.test_a3 = 'marley';
  const p1 = state.divisions.find((d) => d.id === 'div_test_p1');
  p1.organization = 1;
  state.divisions = state.divisions.filter((d) => d.id !== 'div_test_p2');
  const m2 = state.divisions.find((d) => d.id === 'div_test_m2');
  m2.organization = 50;
  mil.orderDivision(state, map, 'marley', 'div_test_m1', 'advance', 'test_a2', militaryRules);
  const r = mil.militaryDay(state, map, militaryRules);
  assert.deepEqual(r.destroyed.map((d) => d.id), ['div_test_p1']);
  assert.equal(m2.organization, 55);
});

test('§6.4 Titans purs : −2 points d\'effectif par jour, destruction à 0', async () => {
  const mil = await import('../server/simulation/military.js');
  const { state, data } = await newGame();
  const p2 = state.divisions.find((d) => d.id === 'div_test_p2'); // en A3, zone de Titans purs
  mil.militaryDay(state, data.map, data.militaryRules);
  assert.equal(p2.strength, 98);
  p2.strength = 1;
  const r = mil.militaryDay(state, data.map, data.militaryRules);
  assert.ok(r.destroyed.some((d) => d.id === 'div_test_p2'));
});

test('ravitaillement : supply_value recalculé avec les divisions de front (§3.4)', async () => {
  const mil = await import('../server/simulation/military.js');
  const { state, data } = await newGame();
  mil.setFront(state, data.map, 'paradis', 'div_test_p1'); // A2, infra 0
  mil.militaryDay(state, data.map, data.militaryRules);
  approx(state.states.find((s) => s.id === 'test_state_a2').supplyValue, 0.45);
});

test('déterminisme : même graine, mêmes combats ; sauvegarde conserve l\'état du PRNG', async () => {
  const mil = await import('../server/simulation/military.js');
  const saves = await import('../server/state/saves.js');
  const run = async () => {
    const { state, data } = await newGame();
    state.rngSeed = 'abc'; state.rngState = 12345;
    mil.orderDivision(state, data.map, 'marley', 'div_test_m1', 'advance', 'test_a2', data.militaryRules);
    return { factor: mil.militaryDay(state, data.map, data.militaryRules).combats[0]?.randomFactor, state };
  };
  const a = await run();
  const b = await run();
  assert.equal(a.factor, b.factor);
  const s = await saves.createSave('p3', a.state);
  const loaded = await saves.loadSave(s.id);
  assert.equal(loaded.rngState, a.state.rngState);
  assert.deepEqual(loaded.provinceControl, a.state.provinceControl);
  assert.deepEqual(loaded.templates, a.state.templates);
  assert.deepEqual(loaded.wars, a.state.wars);
});

test('brouillard : Paradis ne voit pas les divisions ennemies en territoire inconnu', async () => {
  const { viewFor } = await import('../server/state/gameState.js');
  const { state, data } = await newGame();
  const v = viewFor(state, 'paradis', data.map, data);
  assert.deepEqual(v.military.divisions.map((d) => d.id).sort(), ['div_test_p1', 'div_test_p2']);
  assert.deepEqual(v.military.templates.map((t) => t.id), ['tpl_test_p']);
  const m = viewFor(state, 'marley', data.map, data);
  assert.equal(m.military.divisions.length, 4);
});

test('scénario réel : aucune guerre en 844 ; ordre de bataille [EXTENSION] sur des provinces existantes', async () => {
  const { readFile } = await import('node:fs/promises');
  const sc = JSON.parse(await readFile('data/scenario.json', 'utf8'));
  const map = JSON.parse(await readFile('data/map/provinces.json', 'utf8'));
  assert.deepEqual(sc.startingWars, []);
  const provinces = new Set(map.provinces.map((p) => p.id));
  const owner = Object.fromEntries(map.states.flatMap((s) => s.provinceIds.map((p) => [p, s.ownerId])));
  const tpl = new Set(sc.startingTemplates.map((t) => t.id));
  for (const d of sc.startingDivisions) {
    assert.ok(provinces.has(d.locationProvinceId), d.locationProvinceId);
    assert.equal(owner[d.locationProvinceId], d.nationId);
    assert.ok(tpl.has(d.templateId));
  }
});
