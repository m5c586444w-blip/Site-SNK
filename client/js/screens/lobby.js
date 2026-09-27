// Écrans de session multijoueur — FEATURES_SPEC.md §15.1 (hôte) et §15.2 (rejoindre).
import { t, loc } from '../i18n.js';
import { h, clear, toast } from '../ui.js';
import { api } from '../api.js';
import { session, send, setNickname, onMessage } from '../session.js';

let off = null;
const cleanup = () => { off?.(); off = null; };

function playerRows(meta, { editable }) {
  return session.list.players.map((p) => {
    const nationCell = editable && !p.isHost
      ? h('select', {
        'aria-label': t('mp.nation'),
        onChange: (e) => send('session/assign', { playerId: p.id, nationId: e.target.value || null }),
      }, h('option', { value: '' }, '—'), ...meta.nations.map((n) => {
        const taken = session.list.players.some((o) => o.id !== p.id && o.nationId === n.id);
        return h('option', { value: n.id, selected: p.nationId === n.id, disabled: taken }, loc(n.name));
      }))
      : h('span', {}, p.nationId ? loc(meta.nations.find((n) => n.id === p.nationId)?.name) : (p.isHost ? t('mp.hostPicks') : '—'));
    return h('tr', {},
      h('td', {}, p.nickname, p.isHost ? h('span.tag.tag-small', {}, t('mp.host')) : null, p.id === session.me?.id ? h('span.tag.tag-small', {}, t('mp.you')) : null),
      h('td', {}, nationCell),
      h('td', {}, p.connected ? (p.ready || p.isHost ? t('mp.ready') : t('mp.notReady')) : t('mp.disconnected')));
  });
}

/** §15.1 : écran de session de l'hôte (adresse réseau, joueurs, attribution des nations). */
export async function hostLobby(root, nav) {
  cleanup();
  const meta = await api.meta();
  const info = await api.sessionInfo();
  const render = () => {
    const url = info.lanUrl ?? info.localUrl;
    clear(root).append(h('div.screen.menu-screen', {},
      h('div.menu-panel.panel.wide', {},
        h('h1.screen-title', {}, t('mp.sessionTitle')),
        h('p', {}, t('mp.shareUrl')),
        h('div.inline.lan-url', {}, h('code', {}, url),
          h('button.btn.btn-small', { onClick: async () => { try { await navigator.clipboard.writeText(url); toast(t('mp.copied')); } catch { toast(url); } } }, t('mp.copy'))),
        h('table.data-table', {},
          h('thead', {}, h('tr', {}, h('th', {}, t('mp.player')), h('th', {}, t('mp.nation')), h('th', {}, t('mp.state')))),
          h('tbody', {}, ...playerRows(meta, { editable: session.me?.isHost }))),
        h('p.small.muted', {}, t('mp.soloHint')),
        h('div.modal-actions', {},
          h('button.btn', { onClick: () => { cleanup(); nav('menu'); } }, t('common.back')),
          h('button.btn.btn-primary', { disabled: !session.me?.isHost, onClick: () => send('session/start', {}) }, t('select.start'))))));
  };
  off = onMessage((type) => { if (type === 'session/playerList' || type === 'session/joined') render(); });
  render();
}

/** §15.2 : rejoindre une partie depuis un autre ordinateur du réseau local. */
export function joinScreen(root, nav) {
  cleanup();
  const addr = h('input.text-input', { id: 'join-addr', value: new URLSearchParams(location.search).get('join') ?? location.host });
  const nick = h('input.text-input', { id: 'join-nick', value: session.nickname ?? '', maxlength: 24 });
  const err = h('p.inline-error', { role: 'alert' });
  clear(root).append(h('div.screen.menu-screen', {},
    h('div.menu-panel.panel.settings-panel', {},
      h('h1.screen-title', {}, t('mp.joinTitle')),
      h('div.form-row', {}, h('label', { for: 'join-addr' }, t('mp.address')), addr),
      h('div.form-row', {}, h('label', { for: 'join-nick' }, t('mp.nickname')), nick),
      err,
      h('div.modal-actions', {}, h('button.btn.btn-primary', {
        onClick: () => {
          if (!nick.value.trim()) { err.textContent = t('mp.nickRequired'); return; }
          // Une autre adresse : on ouvre le jeu servi par cette machine-là.
          if (addr.value.trim() && addr.value.trim() !== location.host) { location.href = `http://${addr.value.trim()}/`; return; }
          setNickname(nick.value.trim());
          send('session/join', { nickname: nick.value.trim(), sessionToken: session.token });
          nav('waiting');
        },
      }, t('mp.connect'))))));
}

/** §15.2 : salle d'attente (joueurs, prêt, mode en lecture seule, « Start » réservé à l'hôte). */
export async function waitingRoom(root, nav) {
  cleanup();
  const meta = await api.meta();
  const render = () => {
    const me = session.list.players.find((p) => p.id === session.me?.id);
    clear(root).append(h('div.screen.menu-screen', {},
      h('div.menu-panel.panel.wide', {},
        h('h1.screen-title', {}, t('mp.waitingTitle')),
        h('p', {}, h('strong', {}, `${t('select.mode')} : `), t(session.list.historicalMode ? 'select.mode.historical' : 'select.mode.free'), h('span.small.muted', {}, ` (${t('mp.hostSetsMode')})`)),
        h('table.data-table', {},
          h('thead', {}, h('tr', {}, h('th', {}, t('mp.player')), h('th', {}, t('mp.nation')), h('th', {}, t('mp.state')))),
          h('tbody', {}, ...playerRows(meta, { editable: false }))),
        h('div.modal-actions', {},
          h('label.inline', {}, h('input', { type: 'checkbox', checked: Boolean(me?.ready), onChange: (e) => send('session/ready', { ready: e.target.checked }) }), t('mp.readyToggle')),
          h('button.btn.btn-primary', { disabled: true, title: t('mp.hostOnly') }, t('select.start'))))));
  };
  off = onMessage((type) => { if (type === 'session/playerList' || type === 'session/joined') render(); });
  render();
}

/** §0.4 en multijoueur, côté invité : confirmation en lecture seule en attendant l'hôte. */
export async function guestConfirm(root) {
  cleanup();
  const meta = await api.meta();
  const render = () => {
    const me = session.list.players.find((p) => p.id === session.me?.id);
    const n = meta.nations.find((x) => x.id === me?.nationId);
    clear(root).append(h('div.screen.menu-screen', {},
      h('div.menu-panel.panel', {},
        h('h1.screen-title', {}, t('select.title')),
        h('p', {}, n ? h('strong', {}, loc(n.name)) : t('mp.spectator')),
        h('p', {}, `${t('select.mode')} : `, h('strong', {}, t(session.list.historicalMode ? 'select.mode.historical' : 'select.mode.free'))),
        h('p.small.muted', {}, t(session.list.historicalMode ? 'select.mode.historical.explain' : 'select.mode.free.explain')),
        h('p.muted', {}, t('mp.waitingHost')))));
  };
  off = onMessage((type) => { if (type === 'session/playerList') render(); });
  render();
}

export { cleanup as leaveLobby };
