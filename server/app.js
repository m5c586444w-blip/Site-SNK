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
import { Session } from './state/session.js';
import { resolveEvent as resolvePending } from './simulation/events.js';
import os from 'node:os';

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
  NOT_HOST: 403, GAME_STARTED: 409, INVALID_PLAYER: 400, NATION_TAKEN: 409,
};

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function lanAddress() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return null;
}

export async function createServer({ onQuit = () => process.exit(0) } = {}) {
  const data = await loadGameData();
  const { nations, map, technologies, economyRules, militaryRules, focuses, focusBranches, events, politics } = data;
  const viewOpts = { technologies, economyRules, focuses, focusBranches, events, politics };
  const playableIds = nations.filter((n) => n.isPlayable).map((n) => n.id);

  let state = null;
  const session = new Session();
  /** @type {Map<WebSocket, {player: any}>} */
  const sockets = new Map();

  const send = (ws, type, payload) => ws.readyState === 1 && ws.send(JSON.stringify({ type, payload }));
  const requireMap = () => { if (!map.available) throw Object.assign(new Error('carte'), { code: 'NO_MAP' }); };
  const noGame = () => Object.assign(new Error('Aucune partie'), { code: 'NO_GAME' });

  // Nation vue par un client : celle de son joueur ; sans jeton (solo, tests) : celle de l'hôte.
  const viewerOf = (player) => {
    if (!player) return state?.settings.nationId;
    return player.nationId ?? (player.isHost ? state?.settings.nationId : null);
  };
  const fullView = (nationId) => (state ? { ...viewFor(state, nationId, map, viewOpts), session: session.publicList() } : null);
  /** Diff d'un joueur : sa nation et ses écrans. Jamais l'état complet (§18). */
  const delta = (nationId) => ({
    nation: state.nations.find((n) => n.id === nationId),
    economy: economyView(state, nationId, economyRules),
    military: militaryView(state, nationId, map),
    ...politicalView(state, nationId, viewOpts),
  });
  // Un invité sans nation (spectateur de la salle d'attente) ne reçoit aucune vue de partie.
  const eachClient = (fn) => {
    for (const [ws, c] of sockets) {
      if (!c.player) continue;
      const n = viewerOf(c.player);
      if (n) fn(ws, n, c.player);
    }
  };
  const broadcastFull = () => eachClient((ws, n) => send(ws, 'state/full', fullView(n)));
  const broadcastDelta = (extra = {}) => eachClient((ws, n) => send(ws, 'state/delta', { ...extra, ...delta(n) }));
  const broadcastSession = () => { for (const ws of sockets.keys()) send(ws, 'session/playerList', session.publicList()); };
  const toastFor = (nationId, payload) => eachClient((ws, n) => { if (n === nationId) send(ws, 'notification/toast', payload); });

  const clock = new Clock({
    getState: () => state,
    onTick: async (s) => {
      const visibilityBefore = JSON.stringify(s.visibility);
      const { dailyNet, completedTechs, military, firedEvents } = await runDay(s, data);
      s.lastDailyNet = dailyNet;
      // Modale d'évènement bloquante (FEATURES §14.2) : la partie se met en pause.
      if ((s.pendingEvents.length || s.pendingInheritances.length) && s.speed !== 0) { s.speed = 0; clock.stop(); }
      // Changement de contrôle, de brouillard ou évènement : la carte change, vue complète.
      if (military.captured.length || firedEvents.length || JSON.stringify(s.visibility) !== visibilityBefore) broadcastFull();
      else broadcastDelta({ date: formatDate(s.date), speed: s.speed });
      for (const me of s.humanNations ?? []) {
        for (const c of military.captured.filter((x) => x.from === me || x.to === me)) {
          toastFor(me, { id: `cap_${c.provinceId}_${formatDate(s.date)}`, category: 'military', textKey: c.to === me ? 'toast.provinceTaken' : 'toast.provinceLost', vars: { provinceId: c.provinceId } });
        }
        for (const d of military.destroyed.filter((x) => x.nationId === me)) {
          toastFor(me, { id: `dest_${d.id}`, category: 'military', textKey: 'toast.divisionDestroyed', vars: { provinceId: d.provinceId } });
        }
        for (const techId of completedTechs[me] ?? []) toastFor(me, { id: `tech_${techId}`, category: 'research', textKey: 'toast.researchDone', vars: { techId } });
      }
      if (s.daysSinceAutosave >= AUTOSAVE_INTERVAL_DAYS) {
        s.daysSinceAutosave = 0;
        try { await autosave(s); } catch (e) { for (const ws of sockets.keys()) send(ws, 'error', { code: 'AUTOSAVE_FAILED', messageKey: 'error.AUTOSAVE_FAILED' }); console.error(e); }
      }
    },
  });

  const setState = (next) => {
    clock.stop();
    state = next;
    session.phase = 'game';
    broadcastFull();
    broadcastSession();
  };

  /** Seul l'hôte règle la vitesse (choix documenté, PHASE5_GAPS). */
  const setSpeed = (level, player) => {
    if (player && !player.isHost) throw Object.assign(new Error('hôte'), { code: 'NOT_HOST' });
    if ((state?.pendingEvents?.length || state?.pendingInheritances?.length) && level !== 0) throw Object.assign(new Error('évènement'), { code: 'EVENT_PENDING' });
    clock.setSpeed(level);
    eachClient((ws) => send(ws, 'state/delta', { speed: state.speed }));
  };

  /** Déconnexion (§15.3) : la nation repasse à l'IA ; ses évènements en attente prennent le 1er choix. */
  const onDisconnect = (player) => {
    if (!player || player.sockets.size) return;
    player.connected = false;
    if (state && player.nationId && player.nationId !== state.settings.nationId) {
      state.humanNations = state.humanNations.filter((n) => n !== player.nationId);
      const ctx = effectContext(state, data);
      for (const id of state.pendingEvents.filter((e) => events.find((x) => x.id === e)?.nationId === player.nationId)) resolvePending(state, player.nationId, id, 0, ctx);
      for (const p of state.pendingInheritances.filter((x) => x.nationId === player.nationId)) resolvePending(state, player.nationId, `TITAN_INHERITANCE:${p.id}`, 0, ctx);
    }
    broadcastSession();
  };

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const playerOf = (req) => session.byToken(req.get('x-session-token'));
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

  app.get('/api/session/info', wrap((req) => {
    const port = req.socket.localPort;
    const lan = lanAddress();
    return {
      isLocal: LOOPBACK.has(req.socket.remoteAddress),
      lanUrl: lan ? `http://${lan}:${port}` : null,
      localUrl: `http://localhost:${port}`,
      ...session.publicList(),
    };
  }));

  app.get('/api/settings', wrap(() => readSettings()));
  app.put('/api/settings', wrap((req) => writeSettings(req.body)));

  /** Création de partie (§0.4). En multijoueur, réservée à l'hôte ; les nations attribuées aux
   * autres joueurs deviennent humaines (humanNations). */
  app.post('/api/game/new', wrap((req) => {
    const player = playerOf(req);
    if (player && !player.isHost) throw Object.assign(new Error('hôte'), { code: 'NOT_HOST' });
    const { nationId, historicalMode } = req.body ?? {};
    const others = [...session.players.values()].filter((p) => p !== player && p.connected && p.nationId);
    if (others.some((p) => p.nationId === nationId)) throw Object.assign(new Error('prise'), { code: 'NATION_TAKEN' });
    const humanNations = [nationId, ...others.map((p) => p.nationId)];
    const next = createGame({ nationId, historicalMode, humanNations }, data);
    if (player) player.nationId = nationId;
    session.historicalMode = historicalMode;
    setState(next);
    return fullView(nationId);
  }));

  app.get('/api/game/state', wrap((req) => {
    if (!state) throw noGame();
    return fullView(viewerOf(playerOf(req)));
  }));

  app.post('/api/game/speed', wrap((req) => {
    if (!state) throw noGame();
    setSpeed(req.body?.level, playerOf(req));
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

  function runNationAction(type, payload, player) {
    if (!state) throw noGame();
    const action = nationActions[type];
    if (!action) throw Object.assign(new Error(type), { code: 'UNKNOWN_ACTION' });
    // Chaque joueur n'agit que pour sa propre nation.
    if (payload?.nationId !== viewerOf(player)) throw Object.assign(new Error('nation'), { code: 'NOT_YOUR_NATION' });
    const visibilityBefore = JSON.stringify(state.visibility);
    const result = action(payload.nationId, payload ?? {});
    // Une action peut lever le brouillard ou déclencher un évènement : vue complète pour tous.
    if (JSON.stringify(state.visibility) !== visibilityBefore || type === 'event/resolve' || type === 'diplomacy/action') {
      broadcastFull();
      return { result: result ?? null, full: fullView(payload.nationId) };
    }
    broadcastDelta();
    return { result: result ?? null, ...delta(payload.nationId) };
  }

  app.post('/api/nation/:nationId/:system/:action', wrap((req) =>
    runNationAction(`${req.params.system}/${req.params.action}`, { ...(req.body ?? {}), nationId: req.params.nationId }, playerOf(req))));

  const requireHostReq = (req) => {
    const p = playerOf(req);
    if (p && !p.isHost) throw Object.assign(new Error('hôte'), { code: 'NOT_HOST' });
  };
  app.get('/api/saves', wrap(() => listSaves()));
  app.post('/api/saves', wrap((req) => {
    requireHostReq(req);
    if (!state) throw noGame();
    return createSave(req.body?.name, state, { overwrite: req.body?.overwrite === true });
  }));
  app.post('/api/saves/:id/load', wrap(async (req) => {
    requireHostReq(req);
    const next = await loadSave(req.params.id);
    // Multijoueur : l'hôte reprend la nation de la sauvegarde, les autres gardent leur attribution.
    const host = playerOf(req) ?? session.host();
    if (host) host.nationId = next.settings.nationId;
    const others = [...session.players.values()].filter((p) => p !== host && p.connected && p.nationId && p.nationId !== next.settings.nationId);
    next.humanNations = [next.settings.nationId, ...others.map((p) => p.nationId)];
    setState(next);
    return fullView(next.settings.nationId);
  }));
  app.delete('/api/saves/:id', wrap(async (req) => { requireHostReq(req); await deleteSave(req.params.id); return { ok: true }; }));

  app.post('/api/quit', (req, res) => {
    // Fermer le serveur n'est possible que depuis la machine hôte.
    if (!LOOPBACK.has(req.socket.remoteAddress)) { res.status(403).json({ error: { code: 'NOT_HOST', messageKey: 'error.NOT_HOST' } }); return; }
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

  const wsHandlers = {
    // §18 session/join { nickname, sessionToken? }
    'session/join': ({ nickname, sessionToken }, ws, client, req) => {
      const player = session.join({ nickname, token: sessionToken, isLocal: LOOPBACK.has(req.socket.remoteAddress) });
      if (client.player && client.player !== player) client.player.sockets.delete(ws);
      client.player = player;
      player.sockets.add(ws);
      // Reconnexion : la nation redevient humaine (§15.3).
      if (state && player.nationId && !state.humanNations.includes(player.nationId)) state.humanNations.push(player.nationId);
      send(ws, 'session/joined', { token: player.token, id: player.id, isHost: player.isHost, nationId: player.nationId });
      broadcastSession();
      if (state && session.phase === 'game' && viewerOf(player)) send(ws, 'state/full', fullView(viewerOf(player)));
    },
    'session/assign': ({ playerId, nationId }, ws, client) => { session.assign(client.player, playerId, nationId ?? null, playableIds); broadcastSession(); },
    'session/ready': ({ ready }, ws, client) => { if (client.player) { client.player.ready = Boolean(ready); broadcastSession(); } },
    'session/setMode': ({ historicalMode }, ws, client) => {
      session.requireHost(client.player);
      if (typeof historicalMode !== 'boolean') throw Object.assign(new Error('mode'), { code: 'INVALID_HISTORICAL_MODE' });
      session.historicalMode = historicalMode;
      broadcastSession();
    },
    // §15.1 : « Start Game » de l'hôte verrouille les attributions et passe tout le monde à §0.4.
    'session/start': (payload, ws, client) => { session.requireHost(client.player); session.phase = 'confirm'; broadcastSession(); },
    'game/speed': ({ level }, ws, client) => { if (!state) throw noGame(); setSpeed(level, client.player); },
    'save/create': async ({ name, overwrite }, ws, client) => {
      if (client.player && !client.player.isHost) throw Object.assign(new Error('hôte'), { code: 'NOT_HOST' });
      if (!state) throw noGame();
      send(ws, 'save/created', await createSave(name, state, { overwrite: overwrite === true }));
    },
    'save/load': async ({ saveId }, ws, client) => {
      if (client.player && !client.player.isHost) throw Object.assign(new Error('hôte'), { code: 'NOT_HOST' });
      setState(await loadSave(saveId));
    },
  };
  for (const type of Object.keys(nationActions)) wsHandlers[type] = (payload, ws, client) => { runNationAction(type, payload, client.player); };

  wss.on('connection', (ws, req) => {
    // Aucune donnée de partie avant l'identification (session/join) : pas de fuite de la vue de l'hôte.
    const client = { player: null };
    sockets.set(ws, client);
    ws.on('close', () => {
      sockets.delete(ws);
      if (client.player) { client.player.sockets.delete(ws); onDisconnect(client.player); }
    });
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return send(ws, 'error', { code: 'BAD_MESSAGE', messageKey: 'error.BAD_MESSAGE' }); }
      const handler = wsHandlers[msg?.type];
      if (!handler) return send(ws, 'error', { code: 'UNKNOWN_MESSAGE', messageKey: 'error.UNKNOWN_MESSAGE' });
      try {
        await handler(msg.payload ?? {}, ws, client, req);
      } catch (e) {
        send(ws, 'error', { code: e.code ?? 'INTERNAL', messageKey: `error.${e.code ?? 'INTERNAL'}` });
      }
    });
  });

  return {
    server,
    session,
    close: () => { clock.stop(); for (const ws of wss.clients) ws.terminate(); wss.close(); server.close(); },
  };
}
