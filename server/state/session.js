// Session multijoueur — FEATURES_SPEC.md §15. Chaque navigateur rejoint la session avec un pseudo
// et reçoit un jeton (réutilisable pour se reconnecter, §15.3). L'hôte est le premier joueur
// connecté depuis la machine qui fait tourner le serveur (adresse de bouclage).
import { randomBytes } from 'node:crypto';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export class Session {
  constructor() {
    /** @type {Map<string, {token, id, nickname, nationId, ready, isHost, connected, sockets: Set}>} */
    this.players = new Map();
    this.phase = 'lobby'; // lobby | confirm | game
    this.historicalMode = true; // défaut : Mode historique (FEATURES §0.4)
  }

  join({ nickname, token, isLocal }) {
    const name = String(nickname ?? '').trim().slice(0, 24) || 'Joueur';
    let p = token ? this.players.get(token) : null;
    if (!p) {
      const hasHost = [...this.players.values()].some((x) => x.isHost);
      p = {
        token: randomBytes(12).toString('hex'),
        id: randomBytes(4).toString('hex'),
        nickname: name,
        nationId: null,
        ready: false,
        isHost: Boolean(isLocal) && !hasHost,
        connected: true,
        sockets: new Set(),
      };
      this.players.set(p.token, p);
    } else {
      p.nickname = name || p.nickname;
      p.connected = true;
    }
    return p;
  }

  byToken(token) {
    return token ? this.players.get(token) ?? null : null;
  }

  host() {
    return [...this.players.values()].find((p) => p.isHost) ?? null;
  }

  requireHost(player) {
    if (!player?.isHost) fail('NOT_HOST');
  }

  /** L'hôte attribue une nation à un joueur (FEATURES §15.1), avant le début de la partie. */
  assign(host, playerId, nationId, playableIds) {
    this.requireHost(host);
    if (this.phase === 'game') fail('GAME_STARTED');
    const target = [...this.players.values()].find((p) => p.id === playerId) ?? fail('INVALID_PLAYER');
    if (nationId !== null && !playableIds.includes(nationId)) fail('INVALID_NATION');
    if (nationId && [...this.players.values()].some((p) => p !== target && p.nationId === nationId)) fail('NATION_TAKEN');
    target.nationId = nationId;
  }

  publicList() {
    return {
      phase: this.phase,
      historicalMode: this.historicalMode,
      players: [...this.players.values()].map(({ id, nickname, nationId, ready, isHost, connected }) => ({ id, nickname, nationId, ready, isHost, connected })),
    };
  }

  /** Nations tenues par des humains connectés. */
  humanNations() {
    return [...this.players.values()].filter((p) => p.connected && p.nationId).map((p) => p.nationId);
  }
}
