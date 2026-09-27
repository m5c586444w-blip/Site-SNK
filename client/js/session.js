// Connexion temps réel unique + identité de session (FEATURES_SPEC.md §15, §17).
// Le jeton est conservé localement pour se reconnecter à la même nation après une coupure.
import { connectSocket } from './ws.js';

const TOKEN_KEY = 'snk.sessionToken';
const NICK_KEY = 'snk.nickname';

function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* stockage indisponible */ } }
function load(k) { try { return localStorage.getItem(k); } catch { return null; } }

const listeners = new Set();
const statusListeners = new Set();
let socket = null;

export const session = {
  token: load(TOKEN_KEY),
  nickname: load(NICK_KEY),
  me: null,              // { id, isHost, nationId }
  info: null,            // /api/session/info
  list: { players: [], phase: 'lobby', historicalMode: true },
  status: 'connecting',
};

export function onMessage(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onStatus(fn) { statusListeners.add(fn); fn(session.status); return () => statusListeners.delete(fn); }

export function setNickname(n) {
  session.nickname = n;
  store(NICK_KEY, n);
}

export function connect() {
  if (socket) return socket;
  socket = connectSocket({
    onStatus: (s) => {
      session.status = s;
      // À chaque (re)connexion, on se réidentifie avec le même jeton (§15.3).
      if (s === 'connected') socket.send('session/join', { nickname: session.nickname ?? 'Joueur', sessionToken: session.token });
      for (const fn of statusListeners) fn(s);
    },
    onMessage: (type, payload) => {
      if (type === 'session/joined') {
        session.me = payload;
        session.token = payload.token;
        store(TOKEN_KEY, payload.token);
      }
      if (type === 'session/playerList') session.list = payload;
      for (const fn of listeners) fn(type, payload);
    },
  });
  return socket;
}

export function send(type, payload) { connect().send(type, payload); }
export function reconnect() { connect().reconnect(); }
