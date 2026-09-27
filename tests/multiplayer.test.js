import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

let tmp;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'snk-mp-'));
  process.env.SNK_SAVES_DIR = path.join(tmp, 'saves');
  process.env.SNK_SETTINGS_FILE = path.join(tmp, 'settings.json');
  delete process.env.SNK_MAP_DIR;
  delete process.env.SNK_DATA_OVERLAY;
});
after(async () => { await rm(tmp, { recursive: true, force: true }); });

function client(url) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  return {
    ws,
    open: () => new Promise((r) => ws.on('open', r)),
    send: (type, payload) => ws.send(JSON.stringify({ type, payload })),
    next: (pred, ms = 3000) => {
      const found = inbox.find(pred);
      if (found) { inbox.splice(inbox.indexOf(found), 1); return Promise.resolve(found); }
      return new Promise((resolve, reject) => {
        waiters.push({ pred, resolve });
        setTimeout(() => reject(new Error('timeout')), ms);
      });
    },
    clear: () => { inbox.length = 0; },
  };
}

test('§15 : hôte + invité, attribution, vues séparées, droits, déconnexion → IA', async () => {
  const { createServer } = await import('../server/app.js');
  const { server, session, close } = await createServer({ onQuit: () => {} });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const host = client(`ws://127.0.0.1:${port}/ws`);
    await host.open();
    host.send('session/join', { nickname: 'Hôte' });
    const hj = (await host.next((m) => m.type === 'session/joined')).payload;
    assert.equal(hj.isHost, true);

    const guest = client(`ws://127.0.0.1:${port}/ws`);
    await guest.open();
    guest.send('session/join', { nickname: 'Invité' });
    const gj = (await guest.next((m) => m.type === 'session/joined')).payload;
    assert.equal(gj.isHost, false);

    // L'invité ne peut ni attribuer ni lancer
    guest.send('session/start', {});
    assert.equal((await guest.next((m) => m.type === 'error')).payload.code, 'NOT_HOST');

    host.send('session/assign', { playerId: gj.id, nationId: 'marley' });
    await host.next((m) => m.type === 'session/playerList' && m.payload.players.some((p) => p.nationId === 'marley'));
    host.send('session/start', {});
    await guest.next((m) => m.type === 'session/playerList' && m.payload.phase === 'confirm');

    // Nation déjà prise
    let r = await fetch(`${base}/api/game/new`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': hj.token }, body: JSON.stringify({ nationId: 'marley', historicalMode: true }) });
    assert.equal((await r.json()).error.code, 'NATION_TAKEN');
    r = await fetch(`${base}/api/game/new`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': gj.token }, body: JSON.stringify({ nationId: 'paradis', historicalMode: true }) });
    assert.equal((await r.json()).error.code, 'NOT_HOST');
    guest.clear();
    r = await fetch(`${base}/api/game/new`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': hj.token }, body: JSON.stringify({ nationId: 'paradis', historicalMode: true }) });
    assert.equal(r.status, 200);

    // Chacun reçoit SA vue : l'invité (Marley) voit le monde, sans brouillard
    const gv = (await guest.next((m) => m.type === 'state/full')).payload;
    assert.equal(gv.viewerId, 'marley');
    assert.equal(gv.fogOfWarEnabled, false);
    const hv = (await (await fetch(`${base}/api/game/state`, { headers: { 'x-session-token': hj.token } })).json());
    assert.equal(hv.viewerId, 'paradis');
    assert.equal(hv.fogOfWarEnabled, true);

    // L'invité n'agit que pour sa nation et ne règle pas la vitesse
    r = await fetch(`${base}/api/nation/paradis/focus/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': gj.token }, body: '{"focusId":"PARADIS_WALL_WATCH"}' });
    assert.equal((await r.json()).error.code, 'NOT_YOUR_NATION');
    r = await fetch(`${base}/api/nation/marley/focus/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': gj.token }, body: '{"focusId":"MARLEY_COLONIAL_LEVIES"}' });
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/game/speed`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': gj.token }, body: '{"level":1}' });
    assert.equal((await r.json()).error.code, 'NOT_HOST');

    // Déconnexion : Marley repasse à l'IA ; reconnexion avec le même jeton : redevient humaine
    guest.ws.close();
    await host.next((m) => m.type === 'session/playerList' && m.payload.players.some((p) => p.nationId === 'marley' && !p.connected));
    const state = session; // eslint-disable-line no-unused-vars
    const again = client(`ws://127.0.0.1:${port}/ws`);
    await again.open();
    again.send('session/join', { nickname: 'Invité', sessionToken: gj.token });
    const back = (await again.next((m) => m.type === 'session/joined')).payload;
    assert.equal(back.nationId, 'marley');
    assert.equal((await again.next((m) => m.type === 'state/full')).payload.viewerId, 'marley');
    host.ws.close(); again.ws.close();
  } finally {
    close();
  }
});
