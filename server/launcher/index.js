#!/usr/bin/env node
// Launcher — FEATURES_SPEC.md §0.1 : port 5173 (+1 si occupé, 20 tentatives max),
// affichage des URL locale et réseau, ouverture automatique du navigateur.
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from '../app.js';
import { DEFAULT_PORT, PORT_MAX_ATTEMPTS } from '../../shared/constants.js';

function lanAddress() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (e) => { server.off('listening', onListening); reject(e); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`(Ouverture automatique du navigateur impossible, ouvrez ${url} manuellement.)`));
    child.unref();
  } catch {
    console.log(`(Ouverture automatique du navigateur impossible, ouvrez ${url} manuellement.)`);
  }
}

const startPort = Number(process.env.PORT) || DEFAULT_PORT;
const { server } = await createServer();

let port = null;
for (let attempt = 0; attempt < PORT_MAX_ATTEMPTS; attempt++) {
  try {
    await listen(server, startPort + attempt);
    port = startPort + attempt;
    break;
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
  }
}
if (port === null) {
  console.error(`ERREUR : aucun port libre entre ${startPort} et ${startPort + PORT_MAX_ATTEMPTS - 1}. Libérez un port ou définissez PORT=<n>.`);
  process.exit(1);
}

const localUrl = `http://localhost:${port}`;
const lan = lanAddress();
console.log('Serveur prêt.');
console.log(`  Adresse locale  : ${localUrl}`);
console.log(`  Adresse réseau  : ${lan ? `http://${lan}:${port}` : '(aucune interface réseau détectée)'}`);
if (!process.argv.includes('--no-open')) openBrowser(localUrl);
