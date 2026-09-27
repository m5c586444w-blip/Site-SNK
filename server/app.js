// Serveur local : API REST + WebSocket + fichiers statiques du client.
// Toute action client est revalidée ici (FEATURES_SPEC.md §18).
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import path from 'node:path';
import { ROOT_DIR, loadGameData } from './data/loadData.js';
import { createGame, viewFor, economyView, militaryView, politicalView } from './state/gameState.js';
import { Clock } from './simulation/clock.js';
import { runDay, effectContext } from './simulation/tick.js';
import { startFocus } from './simulation/focus.js';
import { diplomaticAction } from './simulation/diplomacy.js';
import { resolveEvent } from './simulation/events.js';
import { changeLaw, changeEldianPolicy, recruitCandidate } from './simulation/politics.js';
import { runOperation } from './simulation/intel.js';
import { nationModifiers } from './simulation/modifiers.js';
import { createLine, assignFactories, deleteLine, queueNewFactory, queueConversion } from './simulation/economy.js';
import { assignResearch, cancelResearch } from './simulation/research.js';
import { saveTemplate, deleteTemplate, createDivision, orderDivision, setFront } from './simulation/military.js';
import { listSaves, createSave, loadSave, deleteSave, autosave } from './state/saves.js';
import { readSettings, writeSettings } from './state/settings.js';
import { AUTOSAVE_INTERVAL_DAYS } from '../shared/constants.js';
import { formatDate } from '../shared/calendar.js';

const HTTP_STATUS = {
  INVALID_NATION: 400, INVALID_HISTORICAL_MODE: 400, INVALID_SPEED: 400, INVALID_SETTINGS: 400,
  INVALID_SAVE_NAME: 400, RESERVED_SAVE_NAME: 400, INCOMPATIBLE_SAVE: 422,
  NO_GAME: 409, SAVE_EXISTS: 409, SAVE_NOT_FOUND: 404,
  NOT_YOUR_NATION: 403, UNKNOWN_ACTION: 404,
  INVALID_EQUIPMENT: 400, EQUIPMENT_LOCKED: 409, INVALID_FACTORIES: 400, FACTORY_NOT_MILITARY: 409, FACTORY_BUSY: 409,
  INVALID_LINE: 404, INVALID_FACTORY_TYPE: 400, INVALID_STATE: 400, FACTORY_COST_MISSING: 409,
  NO_CIVILIAN_FACTORY: 409, CONVERSION_COST_MISSING: 409,
  RESEARCH_SLOTS_UNKNOWN: 409, INVALID_SLOT: 400, SLOT_BUSY: 409, INVALID_TECH: 404, CATEGORY_LOCKED: 409,
  TECH_COMPLETED: 409, TECH_IN_PROGRESS: 409, PREREQUISITES_MISSING: 409,
  INVALID_TEMPLATE_NAME: 400, EMPTY_TEMPLATE: 400, INVALID_BATTALION: 400, TEMPLATE_TOO_WIDE: 400,
  INVALID_TEMPLATE: 404, TEMPLATE_IN_USE: 409, INVALID_PROVINCE: 400, MANPOWER_UNKNOWN: 409,
  INSUFFICIENT_MANPOWER: 409, INSUFFICIENT_EQUIPMENT: 409, INVALID_DIVISION: 404, NO_FRONT: 409,
  INVALID_ORDER: 400, INVALID_TARGET: 400, NOT_AT_WAR: 409, MOVEMENT_RULES_MISSING: 409, NO_RETREAT_PATH: 409,
  NO_MAP: 409,
  INVALID_FOCUS: 404, FOCUS_SLOT_BUSY: 409, FOCUS_COMPLETED: 409, FOCUS_IN_PROGRESS: 409, MUTUALLY_EXCLUSIVE: 409,
  TITAN_POWER_REQUIRED: 409, DATE_REQUIRED: 409,
  INVALID_TARGET_NATION: 400, NATION_UNKNOWN: 409, ALREADY_AT_WAR: 409, TREATY_FORBIDS_WAR: 409, WARGOAL_EXISTS: 409,
  NO_WARGOAL: 409, WARGOAL_NOT_READY: 409, INVALID_DIPLOMATIC_ACTION: 400, RELATION_TOO_LOW: 409,
  POLITICAL_CAPITAL_UNKNOWN: 409, INSUFFICIENT_POLITICAL_CAPITAL: 409, AGREEMENT_EXISTS: 409,
  EVENT_NOT_PENDING: 404, INVALID_CHOICE: 400, EVENT_PENDING: 409,
  INVALID_LAW: 400, LAW_COOLDOWN: 409, LAW_ALREADY_ACTIVE: 409, MARLEY_ONLY: 403, POOL_FULL: 409,
  INVALID_OPERATION: 400, INVALID_AGENT: 400, AGENT_BUSY: 409,
};

export async function createServer({ onQuit = () => process.exit(0) } = {}) {
  const data = await loadGameData();
  const { nations, map, technologies, economyRules, militaryRules, focuses, focusBranches, events, politics } = data;
  const viewOpts = { technologies, economyRules, focuses, focusBranches, events, politics };

  /** Une seule partie à la fois (le multijoueur, §15, relève d'une phase ultérieure). */
  let state = null;
  const sockets = new Set();

  const send = (ws, type, payload) => ws.readyState === 1 && ws.send(JSON.stringify({ type, payload }));
  const broadcast = (type, payload) => { for (const ws of sockets) send(ws, type, payload); };
  const fullView = () => (state ? viewFor(state, state.settings.nationId, map, viewOpts) : null);
  const requireMap = () => { if (!map.available) throw Object.assign(new Error('carte'), { code: 'NO_MAP' }); };
  const player = () => state.nations.find((n) => n.id === state.settings.nationId);
  /** Diff joueur : sa nation (stocks, recherche) et son économie. Jamais l'état complet (§18). */
  const playerDelta = () => ({
    nation: player(),
    economy: economyView(state, state.settings.nationId, economyRules),
    military: militaryView(state, state.settings.nationId, map),
    ...politicalView(state, state.settings.nationId, viewOpts),
  });

  const clock = new Clock({
    getState: () => state,
    onTick: async (s) => {
      const visibilityBefore = JSON.stringify(s.visibility);
      const { dailyNet, completedTechs, military, firedEvents } = await runDay(s, data);
      s.lastDailyNet = dailyNet;
      // Modale d'évènement bloquante (FEATURES §14.2) : la partie se met en pause.
      if ((s.pendingEvents.length || s.pendingInheritances.length) && s.speed !== 0) { s.speed = 0; clock.stop(); }
      // Changement de contrôle, de brouillard ou évènement : la carte change, vue complète.
      if (military.captured.length || firedEvents.length || JSON.stringify(s.visibility) !== visibilityBefore) broadcast('state/full', fullView());
      else broadcast('state/delta', { date: formatDate(s.date), ...playerDelta() });
      const me = s.settings.nationId;
      for (const c of military.captured.filter((x) => x.from === me || x.to === me)) {
        broadcast('notification/toast', { id: `cap_${c.provinceId}_${formatDate(s.date)}`, category: 'military', textKey: c.to === me ? 'toast.provinceTaken' : 'toast.provinceLost', vars: { provinceId: c.provinceId } });
      }
      for (const d of military.destroyed.filter((x) => x.nationId === me)) {
        broadcast('notification/toast', { id: `dest_${d.id}`, category: 'military', textKey: 'toast.divisionDestroyed', vars: { provinceId: d.provinceId } });
      }
      for (const techId of completedTechs[s.settings.nationId] ?? []) {
        broadcast('notification/toast', { id: `tech_${techId}`, category: 'research', textKey: 'toast.researchDone', vars: { techId } });
      }
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
    if ((state?.pendingEvents?.length || state?.pendingInheritances?.length) && level !== 0) throw Object.assign(new Error('évènement'), { code: 'EVENT_PENDING' });
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
      res.status(HTTP_STATUS[e.code] ?? 500).json({ error: { code: e.code ?? 'INTERNAL', messageKey: `error.${e.code ?? 'INTERNAL'}`, details: e.details } });
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
    setState(createGame({ nationId, historicalMode }, data));
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

  // Actions de nation (FEATURES §18). Même table pour REST et WebSocket, validation serveur.
  const nationActions = {
    'production/newLine': (n, p) => createLine(state, n, p.equipmentType),
    'production/assign': (n, p) => assignFactories(state, n, p.lineId, p.factoryIds),
    'production/deleteLine': (n, p) => deleteLine(state, n, p.lineId),
    'production/newFactory': (n, p) => queueNewFactory(state, n, p.stateId, p.type, economyRules),
    'production/convertFactory': (n, p) => queueConversion(state, n, p.stateId, economyRules),
    'research/assign': (n, p) => assignResearch(state, n, p.techId, p.slotIndex, technologies),
    'research/cancel': (n, p) => cancelResearch(state, n, p.slotIndex),
    'template/save': (n, p) => saveTemplate(state, n, p.template, militaryRules),
    'template/delete': (n, p) => deleteTemplate(state, n, p.templateId),
    'division/create': (n, p) => { requireMap(); return createDivision(state, n, p.templateId, p.provinceId); },
    'division/order': (n, p) => { requireMap(); return orderDivision(state, map, n, p.divisionId, p.order, p.targetProvinceId, militaryRules, (id) => nationModifiers(state, id, politics)); },
    'division/setFront': (n, p) => { requireMap(); return setFront(state, map, n, p.divisionId); },
    'focus/start': (n, p) => startFocus(state, n, p.focusId, focuses, politics),
    'law/change': (n, p) => changeLaw(state, n, p.category, p.newValue, politics, effectContext(state, data)),
    'law/eldianPolicy': (n, p) => changeEldianPolicy(state, n, p.policy),
    'warrior/recruit': (n) => recruitCandidate(state, n),
    'intel/operation': (n, p) => { requireMap(); return runOperation(state, map, n, p.operationType, p.targetNationId, p.agentId, politics); },
    'diplomacy/action': (n, p) => diplomaticAction(state, n, p.targetNationId, p.action),
    'event/resolve': (n, p) => resolveEvent(state, n, p.eventId, p.choiceIndex, effectContext(state, data)),
  };

  function runNationAction(type, payload) {
    if (!state) throw Object.assign(new Error('Aucune partie'), { code: 'NO_GAME' });
    const action = nationActions[type];
    if (!action) throw Object.assign(new Error(type), { code: 'UNKNOWN_ACTION' });
    // Le joueur n'agit que pour sa propre nation.
    if (payload?.nationId !== state.settings.nationId) throw Object.assign(new Error('nation'), { code: 'NOT_YOUR_NATION' });
    const visibilityBefore = JSON.stringify(state.visibility);
    const result = action(payload.nationId, payload ?? {});
    // Une action peut lever le brouillard ou déclencher un évènement : la vue complète est alors renvoyée.
    if (JSON.stringify(state.visibility) !== visibilityBefore || type === 'event/resolve') {
      const full = fullView();
      broadcast('state/full', full);
      return { result: result ?? null, full };
    }
    const delta = playerDelta();
    broadcast('state/delta', delta);
    return { result: result ?? null, ...delta };
  }

  app.post('/api/nation/:nationId/:system/:action', wrap((req) =>
    runNationAction(`${req.params.system}/${req.params.action}`, { ...(req.body ?? {}), nationId: req.params.nationId })));

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
  for (const type of Object.keys(nationActions)) wsHandlers[type] = (payload) => { runNationAction(type, payload); };

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
