// Menu principal (§0.2), réglages (§0.3), sélection nation + mode (§0.4), écran de chargement (§16).
import { api } from '../api.js';
import { t, loc, setLanguage } from '../i18n.js';
import { h, clear, confirmModal, modal, toast, errorText, flagPlaceholder } from '../ui.js';

export function mainMenu(root, nav) {
  clear(root).append(h('div.screen.menu-screen', {},
    h('div.menu-panel.panel', {},
      h('h1.menu-title', {}, t('app.title')),
      h('p.menu-subtitle', {}, t('app.subtitle')),
      h('nav.menu-buttons', {},
        h('button.btn.btn-primary', { onClick: () => nav('select') }, t('menu.newGame')),
        h('button.btn', { onClick: () => nav('load') }, t('menu.loadGame')),
        h('button.btn', { onClick: () => nav('settings') }, t('menu.settings')),
        h('button.btn', {
          onClick: async () => {
            if (!(await confirmModal(t('menu.quit'), t('menu.quitConfirm'), { danger: true }))) return;
            await api.quit().catch(() => {});
            clear(root).append(h('div.screen.menu-screen', {}, h('div.menu-panel.panel', {}, h('p', {}, t('menu.quitDone')))));
          },
        }, t('menu.quit')))),
  ));
}

export async function settingsScreen(root, nav, applySettings) {
  const s = await api.getSettings();
  const volume = h('input', { type: 'range', min: 0, max: 100, value: s.masterVolume, id: 'set-volume' });
  const volOut = h('output', {}, String(s.masterVolume));
  volume.addEventListener('input', () => { volOut.textContent = volume.value; });
  const scale = h('select', { id: 'set-scale' }, ...['small', 'medium', 'large'].map((v) =>
    h('option', { value: v, selected: v === s.uiScale }, t(`settings.uiScale.${v}`))));
  const lang = h('div.segmented', { role: 'radiogroup' }, ...['FR', 'EN'].map((v) =>
    h('label', {}, h('input', { type: 'radio', name: 'lang', value: v, checked: v === s.language }), v)));

  clear(root).append(h('div.screen.menu-screen', {},
    h('div.menu-panel.panel.settings-panel', {},
      h('h1.screen-title', {}, t('settings.title')),
      h('div.form-row', {}, h('label', { for: 'set-volume' }, t('settings.volume')), h('div.inline', {}, volume, volOut)),
      h('div.form-row', {}, h('label', { for: 'set-scale' }, t('settings.uiScale')), scale),
      h('div.form-row', {}, h('span.label', {}, t('settings.language')), lang),
      h('div.modal-actions', {},
        h('button.btn', { onClick: () => nav('menu') }, t('common.back')),
        h('button.btn.btn-primary', {
          onClick: async () => {
            try {
              const next = await api.putSettings({
                masterVolume: Number(volume.value),
                uiScale: scale.value,
                language: lang.querySelector('input:checked').value,
              });
              applySettings(next);
              toast(t('settings.saved'));
              nav('settings');
            } catch (e) { toast(errorText(e), 'error'); }
          },
        }, t('common.save')))),
  ));
}

export async function nationSelect(root, nav) {
  const meta = await api.meta();
  let selected = null;
  let historicalMode = true; // défaut : Mode historique (FEATURES_SPEC.md §0.4)
  const error = h('p.inline-error', { role: 'alert' });

  const cards = meta.nations.map((n) => {
    const card = h('button.nation-card.panel', {
      'data-nation': n.id,
      style: { '--faction': n.colors.primary, '--faction-2': n.colors.secondary },
      onClick: () => {
        selected = n.id;
        for (const c of cards) c.classList.toggle('selected', c === card);
        error.textContent = '';
        startBtn.disabled = false;
      },
    },
    h('div.nation-card-head', {}, flagPlaceholder(n, 'lg'), h('h2', {}, loc(n.name))),
    h('p.nation-blurb', {}, loc(n.blurb)),
    h('span.tag', {}, t(`select.difficulty.${n.difficulty}`)));
    return card;
  });

  const explain = h('p.mode-explain');
  const modeSwitch = h('div.segmented.mode-switch', { role: 'radiogroup', 'aria-label': t('select.mode') },
    ...[[true, 'select.mode.historical'], [false, 'select.mode.free']].map(([val, key]) =>
      h('label', {}, h('input', {
        type: 'radio', name: 'historicalMode', value: String(val), checked: val === historicalMode,
        onChange: () => { historicalMode = val; renderExplain(); },
      }), t(key))));
  const renderExplain = () => {
    explain.textContent = t(historicalMode ? 'select.mode.historical.explain' : 'select.mode.free.explain');
  };
  renderExplain();

  const startBtn = h('button.btn.btn-primary', {
    disabled: true,
    onClick: async () => {
      if (!selected) { error.textContent = t('select.pick'); return; }
      try {
        await api.newGame(selected, historicalMode);
        nav('game');
      } catch (e) { error.textContent = errorText(e); }
    },
  }, t('select.start'));

  clear(root).append(h('div.screen.select-screen', {},
    h('h1.screen-title', {}, t('select.title')),
    h('div.nation-cards', {}, ...cards),
    h('section.mode-panel.panel', {},
      h('h2', {}, t('select.mode')),
      modeSwitch,
      explain,
      h('p.mode-shared', {}, t('select.mode.shared'))),
    error,
    h('div.modal-actions', {},
      h('button.btn', { onClick: () => nav('menu') }, t('common.back')),
      startBtn),
  ));
}

/** Liste des sauvegardes (§16). Utilisée par le menu principal et en jeu. */
export async function saveList({ onLoaded, nationNames = {} }) {
  const saves = await api.listSaves();
  const tbody = h('tbody');
  const render = (list) => {
    clear(tbody);
    if (!list.length) tbody.append(h('tr', {}, h('td', { colspan: 6 }, t('load.empty'))));
    for (const s of list) {
      tbody.append(h('tr', {},
        h('td', {}, s.name, s.isAutosave ? h('span.tag.tag-small', {}, t('load.autosave')) : null, s.corrupt ? h('span.tag.tag-small.tag-danger', {}, t('load.corrupt')) : null),
        h('td', {}, nationNames[s.nationId] ?? s.nationId ?? '—'),
        h('td', {}, s.currentDate ?? '—'),
        h('td', {}, s.historicalMode == null ? '—' : t(s.historicalMode ? 'game.mode.historical' : 'game.mode.free')),
        h('td', {}, s.savedAtIso ? new Date(s.savedAtIso).toLocaleString() : '—'),
        h('td.row-actions', {},
          h('button.btn.btn-small.btn-primary', {
            onClick: async () => {
              try { await api.loadSave(s.id); onLoaded(); } catch (e) { toast(errorText(e), 'error'); }
            },
          }, t('load.load')),
          h('button.btn.btn-small.btn-danger', {
            onClick: async () => {
              if (!(await confirmModal(t('load.delete'), t('load.deleteConfirm', { name: s.name }), { danger: true }))) return;
              try { await api.deleteSave(s.id); render(await api.listSaves()); } catch (e) { toast(errorText(e), 'error'); }
            },
          }, t('load.delete')))));
    }
  };
  render(saves);
  return h('table.save-table', {},
    h('thead', {}, h('tr', {}, ...['name', 'nation', 'date', 'mode', 'saved'].map((c) => h('th', {}, t(`load.col.${c}`))), h('th'))),
    tbody);
}

export async function loadScreen(root, nav) {
  const meta = await api.meta();
  const nationNames = Object.fromEntries(meta.nations.map((n) => [n.id, loc(n.name)]));
  clear(root).append(h('div.screen.menu-screen', {},
    h('div.menu-panel.panel.wide', {},
      h('h1.screen-title', {}, t('load.title')),
      await saveList({ onLoaded: () => nav('game'), nationNames }),
      h('div.modal-actions', {}, h('button.btn', { onClick: () => nav('menu') }, t('common.back'))))));
}

export { modal, setLanguage };
