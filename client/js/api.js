// Appels REST au serveur local. Une erreur serveur est levée avec son code (§17 : pas d'échec silencieux).
export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'INTERNAL', res.status);
  return data;
}

export const api = {
  meta: () => request('GET', '/api/meta'),
  getSettings: () => request('GET', '/api/settings'),
  putSettings: (s) => request('PUT', '/api/settings', s),
  newGame: (nationId, historicalMode) => request('POST', '/api/game/new', { nationId, historicalMode }),
  state: () => request('GET', '/api/game/state'),
  speed: (level) => request('POST', '/api/game/speed', { level }),
  listSaves: () => request('GET', '/api/saves'),
  createSave: (name, overwrite = false) => request('POST', '/api/saves', { name, overwrite }),
  loadSave: (id) => request('POST', `/api/saves/${encodeURIComponent(id)}/load`),
  deleteSave: (id) => request('DELETE', `/api/saves/${encodeURIComponent(id)}`),
  quit: () => request('POST', '/api/quit'),
};
