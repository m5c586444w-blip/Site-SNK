import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const FIXTURE = path.resolve('tests/fixtures/map');
let tmp;

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'snk-test-'));
  process.env.SNK_SAVES_DIR = path.join(tmp, 'saves');
  process.env.SNK_SETTINGS_FILE = path.join(tmp, 'settings.json');
  process.env.SNK_MAP_DIR = FIXTURE;
});
after(async () => { await rm(tmp, { recursive: true, force: true }); });

const load = async () => {
  const { loadNations, loadMap } = await import('../server/data/loadData.js');
  return { nations: await loadNations(), map: await loadMap() };
};

test('calendrier : format DD/MM/an-YYY et passage de mois/année', async () => {
  const { formatDate, parseDate, nextDay } = await import('../shared/calendar.js');
  assert.equal(formatDate({ day: 1, month: 1, year: 844 }), '01/01/an-844');
  assert.deepEqual(nextDay({ day: 31, month: 12, year: 844 }), { day: 1, month: 1, year: 845 });
  assert.deepEqual(nextDay({ day: 28, month: 2, year: 844 }), { day: 1, month: 3, year: 844 });
  assert.deepEqual(parseDate('15/06/an-850'), { day: 15, month: 6, year: 850 });
  assert.throws(() => parseDate('32/01/an-844'));
});

test('nouvelle partie : CALENDAR_START, historicalMode figé, validation des entrées', async () => {
  const { createGame } = await import('../server/state/gameState.js');
  const data = await load();
  for (const historicalMode of [true, false]) {
    const g = createGame({ nationId: 'paradis', historicalMode }, data);
    assert.equal(g.settings.historicalMode, historicalMode);
    assert.deepEqual(g.date, { day: 1, month: 1, year: 844 });
    assert.ok(Object.isFrozen(g.settings));
  }
  // Les deux modes partagent exactement le même scénario de départ
  const a = createGame({ nationId: 'marley', historicalMode: true }, data);
  const b = createGame({ nationId: 'marley', historicalMode: false }, data);
  assert.deepEqual(a.nations, b.nations);
  assert.deepEqual(a.states, b.states);
  assert.throws(() => createGame({ nationId: 'nope', historicalMode: true }, data), { code: 'INVALID_NATION' });
  assert.throws(() => createGame({ nationId: 'paradis' }, data), { code: 'INVALID_HISTORICAL_MODE' });
  assert.throws(() => createGame({ nationId: 'paradis', historicalMode: 'true' }, data), { code: 'INVALID_HISTORICAL_MODE' });
});

test('État de Mur : fortification par défaut 8 (MECHANICS §6.5)', async () => {
  const { createGame } = await import('../server/state/gameState.js');
  const g = createGame({ nationId: 'paradis', historicalMode: true }, await load());
  assert.equal(g.states.find((s) => s.id === 'test_state_a1').fortificationLevel, 8);
  assert.equal(g.states.find((s) => s.id === 'test_state_a2').fortificationLevel, null);
});

test('brouillard : Paradis ne reçoit rien au-delà de son île, les autres voient tout', async () => {
  const { createGame, viewFor } = await import('../server/state/gameState.js');
  const data = await load();
  const g = createGame({ nationId: 'paradis', historicalMode: true }, data);
  const pv = viewFor(g, 'paradis', data.map);
  assert.equal(pv.fogOfWarEnabled, true);
  const byId = Object.fromEntries(pv.provinces.map((p) => [p.id, p]));
  assert.equal(byId.test_a1.visibility, 'known');
  assert.equal(byId.test_a1.name, 'Test A1');
  for (const id of ['test_b1', 'test_b2']) {
    assert.equal(byId[id].visibility, 'hidden');
    assert.deepEqual(Object.keys(byId[id]).sort(), ['color', 'id', 'visibility']); // aucune fuite
  }
  assert.deepEqual(pv.nations.map((n) => n.id), ['paradis']);

  const mv = viewFor(createGame({ nationId: 'marley', historicalMode: false }, data), 'marley', data.map);
  assert.equal(mv.fogOfWarEnabled, false);
  assert.ok(mv.provinces.every((p) => p.visibility === 'known'));
  assert.equal(mv.nations.length, 4);
});

test('sauvegarde : format 1.0, conflit de nom, rechargement fidèle, version incompatible refusée', async () => {
  const { createGame } = await import('../server/state/gameState.js');
  const saves = await import('../server/state/saves.js');
  const g = createGame({ nationId: 'paradis', historicalMode: false }, await load());
  g.date = { day: 12, month: 3, year: 844 };
  const s = await saves.createSave('Ma partie', g);
  await assert.rejects(saves.createSave('Ma partie', g), { code: 'SAVE_EXISTS' });
  await saves.createSave('Ma partie', g, { overwrite: true });
  await assert.rejects(saves.createSave('autosave_1', g), { code: 'RESERVED_SAVE_NAME' });

  const file = JSON.parse(await readFile(path.join(process.env.SNK_SAVES_DIR, `${s.id}.json`), 'utf8'));
  for (const k of ['formatVersion', 'savedAtIso', 'nations', 'states', 'divisions', 'focuses_completed_by_nation', 'activeEvents', 'rngSeed']) {
    assert.ok(k in file, `champ §11 manquant : ${k}`);
  }
  assert.equal(file.formatVersion, '1.0');

  const loaded = await saves.loadSave(s.id);
  assert.equal(loaded.settings.historicalMode, false);
  assert.deepEqual(loaded.date, { day: 12, month: 3, year: 844 });
  assert.deepEqual(loaded.visibility, g.visibility);

  file.formatVersion = '0.9';
  await writeFile(path.join(process.env.SNK_SAVES_DIR, 'old.json'), JSON.stringify(file));
  await assert.rejects(saves.loadSave('old'), { code: 'INCOMPATIBLE_SAVE' });
  await assert.rejects(saves.loadSave('../etc'), { code: 'INVALID_SAVE_NAME' });
});

test('autosave : 3 emplacements tournants, jamais de sauvegarde manuelle écrasée', async () => {
  const { createGame } = await import('../server/state/gameState.js');
  const saves = await import('../server/state/saves.js');
  const g = createGame({ nationId: 'hizuru', historicalMode: true }, await load());
  const ids = [];
  for (let i = 0; i < 5; i++) { ids.push((await saves.autosave(g)).id); await new Promise((r) => setTimeout(r, 5)); }
  assert.deepEqual(ids, ['autosave_1', 'autosave_2', 'autosave_3', 'autosave_1', 'autosave_2']);
  const list = await saves.listSaves();
  assert.equal(list.filter((x) => x.isAutosave).length, 3);
  assert.ok(list.some((x) => x.id === 'Ma_partie'));
});

test('horloge : vitesse validée, tick = 1 jour', async () => {
  const { Clock } = await import('../server/simulation/clock.js');
  const state = { date: { day: 31, month: 1, year: 844 }, speed: 0, daysSinceAutosave: 0 };
  const clock = new Clock({ getState: () => state, onTick: () => {} });
  assert.throws(() => clock.setSpeed(7), { code: 'INVALID_SPEED' });
  assert.throws(() => clock.setSpeed('2'), { code: 'INVALID_SPEED' });
  clock.tick();
  assert.deepEqual(state.date, { day: 1, month: 2, year: 844 });
  clock.stop();
});

test('carte absente : le jeu reste jouable, sans géographie inventée', async () => {
  process.env.SNK_MAP_DIR = path.join(tmp, 'nomap');
  try {
    const { loadMap } = await import('../server/data/loadData.js');
    const map = await loadMap();
    assert.equal(map.available, false);
    const { createGame, viewFor } = await import('../server/state/gameState.js');
    const { loadNations } = await import('../server/data/loadData.js');
    const g = createGame({ nationId: 'paradis', historicalMode: true }, { nations: await loadNations(), map });
    assert.deepEqual(g.states, []);
    assert.equal(viewFor(g, 'paradis', map).map.available, false);
  } finally {
    process.env.SNK_MAP_DIR = FIXTURE;
  }
});

test('validateur de carte : fixture valide', async () => {
  const { validateMap } = await import('../tools/validate-map.js');
  const r = await validateMap(FIXTURE);
  assert.deepEqual(r.errors, []);
});

test('API HTTP : new game, vitesse, erreurs explicites', async () => {
  const { createServer } = await import('../server/app.js');
  const { server, close } = await createServer({ onQuit: () => {} });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  try {
    let r = await post('/api/game/speed', { level: 1 });
    assert.equal(r.status, 409);
    r = await post('/api/game/new', { nationId: 'paradis' });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.code, 'INVALID_HISTORICAL_MODE');
    r = await post('/api/game/new', { nationId: 'paradis', historicalMode: true });
    assert.equal(r.status, 200);
    const v = await r.json();
    assert.equal(v.date, '01/01/an-844');
    assert.equal(v.settings.historicalMode, true);
    r = await post('/api/game/speed', { level: 9 });
    assert.equal(r.status, 400);
    const meta = await (await fetch(`${base}/api/meta`)).json();
    assert.deepEqual(meta.nations.map((n) => n.id), ['paradis', 'marley', 'mideast_alliance', 'hizuru']);
  } finally {
    close();
  }
});
