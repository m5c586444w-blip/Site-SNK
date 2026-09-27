// Canal temps réel. Reconnexion automatique avec backoff exponentiel, 5 essais au plus, puis
// bouton de reconnexion manuelle (FEATURES_SPEC.md §17).
const MAX_RETRIES = 5;

export function connectSocket({ onMessage, onStatus }) {
  let ws = null;
  let retries = 0;
  let closedByUser = false;
  let timer = null;

  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retries = 0; onStatus('connected'); };
    ws.onmessage = (ev) => {
      try { const m = JSON.parse(ev.data); onMessage(m.type, m.payload); } catch { /* message illisible ignoré */ }
    };
    ws.onclose = () => {
      if (closedByUser) return;
      if (retries >= MAX_RETRIES) { onStatus('failed'); return; }
      const delay = 500 * 2 ** retries;
      retries += 1;
      onStatus('reconnecting');
      timer = setTimeout(open, delay);
    };
  };
  open();

  return {
    send(type, payload) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload }));
    },
    reconnect() { retries = 0; clearTimeout(timer); open(); },
    close() { closedByUser = true; clearTimeout(timer); ws?.close(); },
  };
}
