// Serveur local : API REST + WebSocket + fichiers statiques du client.
// Toute action client est revalidée ici (FEATURES_SPEC.md §18).
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import path from 'node:path';
import { ROOT_DIR, loadNations, loadMap } from './data/loadData.js';
import { createGame, viewFor } from './state/gameState.js';
import { Clock } from './simulation/clock.js';
import { listSaves, createSave, loadSave, deleteSave, autosave } from './state/saves.js';
import { readSettings, writeSettings } from './state/settings.js';
import { AUTOSAVE_INTERVAL_DAYS } from '../shared/constants.js';
import { formatDate } from '../shared/calendar.js';

const HTTP_STATUS = {
  INVALID_NATION: 400, INVALID_HISTORICAL_MODE: 400, INVALID_SPEED: 400, INVALID_SETTINGS: 400,
  INVALID_SAVE_NAME: 400, RESERVED_SAVE_NAME: 400, INCOMPATIBLE_SAVE: 422,
  NO_GAME: 409, SAVE_EXISTS: 409, SAVE_NOT_FOUND: 404,
};

export async function createServer({ onQuit = () => process.exit(0) } = {}) {
  const nations = await loadNations();
  const map = await loadMap();

  /** Une seule partie à la fois (le multijoueur, §15, relève d'une phase ultérieure). */
  let state = null;
  const sockets = new Set();

  const send = (ws, type, payload) => ws.readyState === 1 && ws.send(JSON.stringify({ type, payload }));
  const broadcast = (type, payload) => { for (const ws of sockets) send(ws, type, payload); };
  const fullView = () => (state ? viewFor(state, state.settings.nationId, map) : null);

  const clock = new Clock({
    getState: () => state,
    onTick: async (s) => {
      broadcast('state/delta', { date: formatDate(s.date) });
      if (s.daysSinceAutosave >= AUTOSAVE_INTERVAL_DAYS) {
        s.daysSinceAutosave = 0;
        try { await autosave(s); } catch (e) { broadcast('error', { code: 'AUTOSAVE_FAILED', messageKey: 'error.AUTOSAVE_FAILED' }); console.error(e); }
      }
    },
  });

  const setState = (next) => {
    clock.stop();
    state = next;
    broadcast('state/full', fullView());
  };

  const setSpeed = (level) => {
    clock.setSpeed(level);
    broadcast('state/delta', { speed: state.speed });
  };

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const wrap = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      if (!e.code || !(e.code in HTTP_STATUS)) console.error(e);
      res.status(HTTP_STATUS[e.code] ?? 500).json({ error: { code: e.code ?? 'INTERNAL', messageKey: `error.${e.code ?? 'INTERNAL'}` } });
    }
  };

  app.get('/api/meta', wrap(async () => ({
    nations: nations.filter((n) => n.isPlayable).map(({ id, name, blurb, difficulty, colors }) => ({ id, name, blurb, difficulty, colors })),
    map: map.available ? { available: true } : { available: false, reason: map.reason },
    gameInProgress: Boolean(state),
  })));

  app.get('/api/settings', wrap(() => readSettings()));
  app.put('/api/settings', wrap((req) => writeSettings(req.body)));

  app.post('/api/game/new', wrap((req) => {
    const { nationId, historicalMode } = req.body ?? {};
    setState(createGame({ nationId, historicalMode }, { nations, map }));
    return fullView();
  }));

  app.get('/api/game/state', wrap(() => {
    if (!state) throw Object.assign(new Error('Aucune partie'), { code: 'NO_GAME' });
    return fullView();
  }));

  app.post('/api/game/speed', wrap((req) => {
    setSpeed(req.body?.level);
    return { speed: state.speed };
  }));

  app.get('/api/saves', wrap(() => listSaves()));
  app.post('/api/saves', wrap((req) => {
    if (!state) throw Object.assign(new Error('Aucune partie'), { code: 'NO_GAME' });
    return createSave(req.body?.name, state, { overwrite: req.body?.overwrite === true });
  }));
  app.post('/api/saves/:id/load', wrap(async (req) => {
    setState(await loadSave(req.params.id));
    return fullView();
  }));
  app.delete('/api/saves/:id', wrap(async (req) => { await deleteSave(req.params.id); return { ok: true }; }));

  app.post('/api/quit', (req, res) => {
    res.json({ ok: true });
    setTimeout(() => { clock.stop(); onQuit(); }, 100);
  });

  // Fichiers de carte (masque + fond optionnel) — cahier des charges §3.
  app.get('/map/mask.png', (req, res) => (map.available ? res.sendFile(map.maskPath) : res.status(404).end()));
  app.get('/map/background', (req, res) => (map.available && map.backgroundPath ? res.sendFile(map.backgroundPath) : res.status(404).end()));

  app.use(express.static(path.join(ROOT_DIR, 'client')));
  app.use('/shared', express.static(path.join(ROOT_DIR, 'shared')));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Messages client -> serveur du catalogue FEATURES_SPEC.md §18 couverts en Phase 1.
  const wsHandlers = {
    'game/speed': ({ level }) => setSpeed(level),
    'save/create': async ({ name, overwrite }, ws) => {
      if (!state) throw Object.assign(new Error('Aucune partie'), { code: 'NO_GAME' });
      send(ws, 'save/created', await createSave(name, state, { overwrite: overwrite === true }));
    },
    'save/load': async ({ saveId }) => setState(await loadSave(saveId)),
  };

  wss.on('connection', (ws) => {
    sockets.add(ws);
    if (state) send(ws, 'state/full', fullView());
    ws.on('close', () => sockets.delete(ws));
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return send(ws, 'error', { code: 'BAD_MESSAGE', messageKey: 'error.BAD_MESSAGE' }); }
      const handler = wsHandlers[msg?.type];
      if (!handler) return send(ws, 'error', { code: 'UNKNOWN_MESSAGE', messageKey: 'error.UNKNOWN_MESSAGE' });
      try {
        await handler(msg.payload ?? {}, ws);
      } catch (e) {
        send(ws, 'error', { code: e.code ?? 'INTERNAL', messageKey: `error.${e.code ?? 'INTERNAL'}` });
      }
    });
  });

  return { server, close: () => { clock.stop(); wss.close(); server.close(); } };
}
