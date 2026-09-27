// Point d'entrée client : routeur minimal entre écrans.
import { api } from './api.js';
import { setLanguage } from './i18n.js';
import { mainMenu, settingsScreen, nationSelect, loadScreen } from './screens/menus.js';
import { gameScreen } from './screens/game.js';
import { toast, errorText } from './ui.js';

const root = document.getElementById('app');

function applySettings(s) {
  setLanguage(s.language);
  document.documentElement.dataset.uiScale = s.uiScale;
}

async function nav(screen) {
  try {
    if (screen === 'menu') mainMenu(root, nav);
    else if (screen === 'settings') await settingsScreen(root, nav, applySettings);
    else if (screen === 'select') await nationSelect(root, nav);
    else if (screen === 'load') await loadScreen(root, nav);
    else if (screen === 'game') await gameScreen(root, nav);
  } catch (e) {
    console.error(e);
    toast(errorText(e), 'error');
  }
}

applySettings(await api.getSettings().catch(() => ({ language: 'FR', uiScale: 'medium' })));
nav('menu');
