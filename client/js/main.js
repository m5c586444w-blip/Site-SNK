// Point d'entrée client : routeur minimal entre écrans + session multijoueur (FEATURES §15).
import { api } from './api.js';
import { setLanguage } from './i18n.js';
import { mainMenu, settingsScreen, nationSelect, loadScreen } from './screens/menus.js';
import { hostLobby, joinScreen, waitingRoom, guestConfirm, leaveLobby } from './screens/lobby.js';
import { gameScreen } from './screens/game.js';
import { toast, errorText } from './ui.js';
import { session, connect, onMessage, setNickname } from './session.js';

const root = document.getElementById('app');
let current = null;

function applySettings(s) {
  setLanguage(s.language);
  document.documentElement.dataset.uiScale = s.uiScale;
}

async function nav(screen) {
  if (screen === current && screen === 'game') return;
  if (current === 'game' && screen !== 'game') window.dispatchEvent(new Event('snk:leave-game'));
  if (!['lobby', 'waiting', 'confirm'].includes(screen)) leaveLobby();
  current = screen;
  try {
    if (screen === 'menu') mainMenu(root, nav);
    else if (screen === 'settings') await settingsScreen(root, nav, applySettings);
    else if (screen === 'lobby') await hostLobby(root, nav);
    else if (screen === 'select') await nationSelect(root, nav);
    else if (screen === 'confirm') await guestConfirm(root, nav);
    else if (screen === 'join') joinScreen(root, nav);
    else if (screen === 'waiting') await waitingRoom(root, nav);
    else if (screen === 'load') await loadScreen(root, nav);
    else if (screen === 'game') await gameScreen(root, nav);
  } catch (e) {
    console.error(e);
    toast(errorText(e), 'error');
  }
}

applySettings(await api.getSettings().catch(() => ({ language: 'FR', uiScale: 'medium' })));
const info = await api.sessionInfo().catch(() => ({ isLocal: true }));
session.info = info;
if (info.isLocal && !session.nickname) setNickname('Hôte');
connect();

// Transitions pilotées par le serveur : §0.4 pour tous quand l'hôte lance, puis la partie.
onMessage((type, payload) => {
  if (type === 'session/playerList' && payload.phase === 'confirm' && !['select', 'confirm', 'game'].includes(current)) {
    nav(session.me?.isHost ? 'select' : 'confirm');
  }
  if (type === 'state/full' && payload && current !== 'game') nav('game');
});

nav(info.isLocal ? 'menu' : (session.token && info.phase !== 'lobby' ? 'waiting' : 'join'));
