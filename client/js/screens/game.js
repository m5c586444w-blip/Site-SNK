// Écran de jeu : barre supérieure (§1), carte (§2), fiche pays (§3), sauvegarde/chargement (§16).
import { api } from '../api.js';
import { connectSocket } from '../ws.js';
import { t, loc } from '../i18n.js';
import { h, clear, modal, toast, errorText, flagPlaceholder, naValue } from '../ui.js';
import { MapRenderer } from '../map/mapRenderer.js';
import { saveList } from './menus.js';
import { renderProduction } from './production.js';
import { renderResearch } from './research.js';
import { SPEED_LEVELS, STABILITY_UNREST_THRESHOLD, MAP_MODES, RESOURCE_TYPES } from '/shared/constants.js';

// Phase du cahier des charges (§12) où chaque écran/mode sera livré. null = phase non attribuée.
const SCREEN_PHASE = {
  production: 2, research: 2, divisions: 3, focus: 4, diplomacy: 4,
  titans: 5, politics: 5, warriors: 5, intelligence: null, journal: null,
};
const MAP_MODE_PHASE = { political: 1, fog_of_war: 1, resources: 2, supply: 2, front_combat: 3 };
const CURRENT_PHASE = 2;
/** Écrans livrés : nom -> rendu (host, ctx). */
const SCREENS = { production: renderProduction, research: renderResearch };
const fmt = (x) => (Math.round(x * 10) / 10).toLocaleString();

export async function gameScreen(root, nav) {
  let view = await api.state();
  let lastSpeed = 1;
  let renderer = null;

  const nationsById = () => new Map(view.nations.map((n) => [n.id, n]));
  const me = () => nationsById().get(view.viewerId);
  const nationName = (id) => (id ? loc(nationsById().get(id)?.name) ?? id : '—');

  // ---------- Barre supérieure ----------
  const dateBtn = h('button.topbar-date', { title: t('topbar.calendar') });
  const calendarPop = h('div.popover.hidden', {}, h('p', {}, t('topbar.calendarStart')), h('p.popover-date'));
  dateBtn.addEventListener('click', () => {
    calendarPop.querySelector('.popover-date').textContent = view.date;
    calendarPop.classList.toggle('hidden');
  });
  const speedBtns = SPEED_LEVELS.map((s) => h('button.speed-btn', {
    'data-level': s.id,
    title: s.id === 0 ? `${t('speed.pause')} (Espace)` : `${s.label} (${s.id})`,
    onClick: () => setSpeed(s.id),
  }, s.id === 0 ? '❚❚' : '▶'.repeat(s.id)));
  const nationBtn = h('button.topbar-nation', { onClick: () => openCountry() });
  const modeBadge = h('span.tag.mode-badge');
  const menuBtn = h('button.btn.btn-small', { onClick: () => openGameMenu() }, t('game.menu'));
  const connBanner = h('div.conn-banner.hidden', { role: 'status' });
  // Pastilles de ressources + effectifs (FEATURES §1)
  const resourcePips = RESOURCE_TYPES.map((r) => h('span.pip', { 'data-resource': r }));
  const manpowerPip = h('span.pip', { title: t('topbar.manpower') });

  const topbar = h('header.topbar', {},
    nationBtn,
    modeBadge,
    h('div.topbar-resources', {}, ...resourcePips, manpowerPip),
    h('div.topbar-spacer'),
    h('div.topbar-clock', {}, dateBtn, calendarPop),
    h('div.speed-control', { role: 'group' }, ...speedBtns),
    menuBtn);

  function renderTopbar() {
    const n = me();
    clear(nationBtn).append(flagPlaceholder(n, 'sm'), h('span', {}, loc(n?.name)));
    dateBtn.textContent = view.date;
    modeBadge.textContent = t(view.settings.historicalMode ? 'game.mode.historical' : 'game.mode.free');
    for (const b of speedBtns) b.classList.toggle('active', Number(b.dataset.level) === view.speed);
    const net = view.economy?.dailyNet;
    for (const pip of resourcePips) {
      const r = pip.dataset.resource;
      const total = n?.resourceStockpile?.[r];
      clear(pip).append(h('span.pip-label', {}, t(`resource.${r}`)), h('strong', {}, total == null ? '—' : fmt(total)));
      pip.title = net
        ? `${t(`resource.${r}`)} — ${t('topbar.dailyNet', { p: fmt(net.produced[r]), c: fmt(net.consumed[r]) })}`
        : `${t(`resource.${r}`)} — ${t('topbar.dailyNetNone')}`;
    }
    // Aucune valeur d'effectifs dans les specs : N/D
    clear(manpowerPip).append(h('span.pip-label', {}, t('topbar.manpower')), n?.manpower == null ? naValue() : h('strong', {}, n.manpower));
  }

  async function setSpeed(level) {
    try {
      const r = await api.speed(level);
      view.speed = r.speed;
      if (level > 0) lastSpeed = level;
      renderTopbar();
    } catch (e) { toast(errorText(e), 'error'); }
  }

  // ---------- Carte ----------
  const mapHost = h('div.map-host');
  const tooltip = h('div.map-tooltip.hidden');
  const provincePanel = h('aside.side-panel.panel.hidden');
  const modeBar = h('div.map-modes', { role: 'toolbar' });
  let mapMode = 'political';

  function renderModeBar() {
    clear(modeBar);
    for (const m of MAP_MODES) {
      if (m === 'fog_of_war' && !view.fogOfWarEnabled) continue; // visible pour Paradis uniquement (§2)
      const phase = MAP_MODE_PHASE[m];
      const enabled = phase <= CURRENT_PHASE && view.map.available;
      modeBar.append(h(`button.map-mode-btn${m === mapMode ? '.active' : ''}`, {
        disabled: !enabled,
        title: phase > CURRENT_PHASE ? t('common.phaseLater', { n: phase }) : t(`map.mode.${m}`),
        onClick: () => { mapMode = m; renderer?.setMode(m); renderModeBar(); },
      }, t(`map.mode.${m}`)));
    }
  }

  const fmtDeposits = (r) => (r ? ['steel', 'fuel', 'rareMaterials'].map((k) => `${t(`resource.${k}`)} ${r[k] ?? '?'}`).join(' · ') : null);

  function tooltipContent(p) {
    if (p.visibility === 'hidden') return [h('strong', {}, t('map.unknownTerritory'))];
    if (p.visibility === 'partially_known') return [h('strong', {}, t('map.approxTerritory'))];
    const row = (k, v) => h('div.kv', {}, h('span', {}, t(k)), v == null ? naValue() : h('span', {}, v));
    return [
      h('strong', {}, p.name ?? p.id),
      row('province.owner', nationName(p.ownerId)),
      row('province.controller', nationName(p.controllerId)),
      row('province.infrastructure', p.infrastructureLevel),
      row('province.resources', fmtDeposits(p.resourceDeposits)),
      p.formerPureTitanTerritory ? h('div.hazard-note', {}, t('province.pureTitan')) : null,
    ];
  }

  function onHover(p, x, y) {
    if (!p) { tooltip.classList.add('hidden'); return; }
    clear(tooltip).append(...tooltipContent(p).filter(Boolean));
    const r = mapHost.getBoundingClientRect();
    tooltip.style.left = `${x - r.left + 14}px`;
    tooltip.style.top = `${y - r.top + 14}px`;
    tooltip.classList.remove('hidden');
  }

  function onSelect(p) {
    if (!p) { provincePanel.classList.add('hidden'); return; }
    const row = (k, v) => h('div.kv', {}, h('span', {}, t(k)), v == null ? naValue() : h('span', {}, v));
    clear(provincePanel).append(
      h('button.panel-close', { onClick: () => provincePanel.classList.add('hidden'), 'aria-label': t('common.close') }, '×'),
      ...(p.visibility !== 'known'
        ? [h('h3', {}, t(p.visibility === 'hidden' ? 'map.unknownTerritory' : 'map.approxTerritory'))]
        : [
          h('h3', {}, p.name ?? p.id),
          p.stateName ? h('p.muted', {}, p.stateName) : null,
          row('province.owner', nationName(p.ownerId)),
          row('province.garrison', '—'),
          p.isWallState ? row('province.fortification', p.fortificationLevel == null ? null : `${p.fortificationLevel}/10`) : null,
          p.formerPureTitanTerritory ? h('div.hazard-note', {}, t('province.pureTitan')) : null,
          h('button.btn.btn-small', { disabled: true, title: t('common.phaseLater', { n: 2 }) }, t('province.manage')),
        ]).filter(Boolean));
    provincePanel.classList.remove('hidden');
  }

  const mapMissing = h('div.map-missing.panel', {},
    h('h2', {}, t('map.missing.title')),
    h('p', {}, t('map.missing.body')),
    h('img', { src: '/assets/map/reference_map.jpg', alt: '' }));

  // ---------- Fiche pays (§3) ----------
  const countryPanel = h('aside.country-panel.panel.hidden');

  function gauge(labelKey, value) {
    if (value == null) return h('div.gauge-row', {}, h('span', {}, t(labelKey)), naValue());
    const level = value < STABILITY_UNREST_THRESHOLD ? 'low' : 'ok';
    return h('div.gauge-row', {}, h('span', {}, t(labelKey)),
      h(`div.gauge.gauge-${level}`, { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': value },
        h('div.gauge-fill', { style: { width: `${value}%` } }), h('span.gauge-text', {}, Math.round(value))));
  }

  function openCountry() {
    const n = me();
    const titans = n.titanPowersHeld;
    clear(countryPanel).append(
      h('button.panel-close', { onClick: () => countryPanel.classList.add('hidden'), 'aria-label': t('common.close') }, '×'),
      h('div.country-head', {}, flagPlaceholder(n, 'lg'), h('div', {},
        h('h2', {}, loc(n.name)),
        h('div.kv', {}, h('span', {}, t('country.government')), n.governmentLabel ? h('span', {}, loc(n.governmentLabel)) : naValue()),
        h('div.kv', {}, h('span', {}, t('country.mode')), h('span', {}, t(view.settings.historicalMode ? 'game.mode.historical' : 'game.mode.free'))))),
      gauge('country.stability', n.stability),
      gauge('country.warSupport', n.warSupport),
      h('div.kv', {}, h('span', {}, t('country.politicalCapital')), n.politicalCapital == null ? naValue() : h('span.counter', {}, n.politicalCapital)),
      h('h3', {}, t('country.titans')),
      titans == null ? naValue()
        : titans.length === 0 ? h('p.muted', {}, t('country.titans.none'))
          : h('ul.titan-list', {}, ...titans.map((id) => h('li', {},
            h('span', {}, t(`titan.${id}`)),
            h('button.link-btn', { disabled: true, title: t('common.phaseLater', { n: SCREEN_PHASE.titans }) }, t('screen.titans'))))),
      h('h3', {}, t('country.nav')),
      h('div.quick-nav', {}, ...Object.entries(SCREEN_PHASE)
        .filter(([k]) => k !== 'warriors' || n.id === 'marley') // FEATURES_SPEC.md §12 : Marley uniquement
        .map(([k, phase]) => h('button.btn.btn-small', {
          disabled: !SCREENS[k],
          title: SCREENS[k] ? null : phase ? t('common.phaseLater', { n: phase }) : t('common.naTooltip'),
          onClick: () => openScreen(k),
        }, t(`screen.${k}`)))));
    countryPanel.classList.remove('hidden');
  }

  // ---------- Écrans (production, recherche…) : panneau par-dessus la carte ----------
  const screenPanel = h('section.screen-overlay.panel.hidden');
  let currentScreen = null;

  const ctx = {
    getView: () => view,
    act: async (type, payload) => {
      try {
        const delta = await api.nationAction(view.viewerId, type, payload);
        applyDelta(delta);
      } catch (e) { toast(errorText(e), 'error'); }
    },
  };

  function openScreen(name) {
    currentScreen = name;
    countryPanel.classList.add('hidden');
    renderScreen();
    screenPanel.classList.remove('hidden');
  }

  function renderScreen() {
    if (!currentScreen) return;
    const scroll = screenPanel.querySelector('.screen-body')?.scrollTop ?? 0;
    const body = h('div.screen-body');
    clear(screenPanel).append(
      h('header.screen-header', {},
        h('h2', {}, t(`screen.${currentScreen}`)),
        h('div.screen-tabs', {}, ...Object.keys(SCREENS).map((k) => h(`button.btn.btn-small${k === currentScreen ? '.btn-primary' : ''}`, { onClick: () => openScreen(k) }, t(`screen.${k}`)))),
        h('button.panel-close', { onClick: closeScreen, 'aria-label': t('common.close') }, '×')),
      body);
    SCREENS[currentScreen](body, ctx);
    body.scrollTop = scroll;
  }

  function closeScreen() {
    currentScreen = null;
    screenPanel.classList.add('hidden');
  }

  function applyDelta(payload) {
    if (payload.nation) view.nations = view.nations.map((n) => (n.id === payload.nation.id ? payload.nation : n));
    if (payload.economy) view.economy = payload.economy;
    if ('date' in payload) view.date = payload.date;
    if ('speed' in payload) view.speed = payload.speed;
    renderTopbar();
    // Pas de re-rendu pendant qu'une modale de confirmation est ouverte.
    if (currentScreen && !document.querySelector('.modal-overlay')) renderScreen();
    if (!countryPanel.classList.contains('hidden')) openCountry();
  }

  // ---------- Menu en jeu : sauvegarde / chargement ----------
  async function saveDialog(defaultName) {
    const input = h('input.text-input', { value: defaultName, id: 'save-name', maxlength: 80 });
    const err = h('p.inline-error', { role: 'alert' });
    const body = h('div', {}, h('label', { for: 'save-name' }, t('save.name')), input, err);
    const doSave = async (overwrite) => {
      try {
        await api.createSave(input.value, overwrite);
        toast(t('save.done'));
        return true;
      } catch (e) {
        if (e.code === 'SAVE_EXISTS' && !overwrite) {
          const ok = await modal({ title: t('save.title'), body: h('p', {}, t('save.overwrite', { name: input.value })),
            actions: [{ label: t('common.cancel'), value: false }, { label: t('common.confirm'), value: true, danger: true }] });
          return ok ? doSave(true) : false;
        }
        err.textContent = errorText(e);
        return false;
      }
    };
    const choice = await modal({ title: t('save.title'), body, actions: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: true, primary: true }] });
    if (choice) {
      const ok = await doSave(false);
      if (!ok && err.textContent) toast(err.textContent, 'error');
    }
  }

  async function openGameMenu() {
    const choice = await modal({
      title: t('game.menu'),
      body: null,
      actions: [
        { label: t('game.saveGame'), value: 'save', primary: true },
        { label: t('game.loadGame'), value: 'load' },
        { label: t('game.mainMenu'), value: 'menu' },
        { label: t('common.close'), value: null },
      ],
    });
    if (choice === 'save') {
      const name = `${view.date.replace(/\//g, '-')}_${loc(me().name)}`;
      await saveDialog(name);
    } else if (choice === 'load') {
      const names = Object.fromEntries(view.nations.map((n) => [n.id, loc(n.name)]));
      const table = await saveList({ nationNames: names, onLoaded: () => { document.querySelector('.modal-overlay .modal-actions .btn')?.click(); } });
      await modal({ title: t('load.title'), body: table, actions: [{ label: t('common.close'), value: null }] });
    } else if (choice === 'menu') {
      if (view.speed !== 0) await setSpeed(0);
      teardown();
      nav('menu');
    }
  }

  // ---------- Assemblage ----------
  clear(root).append(h('div.screen.game-screen', {},
    topbar,
    connBanner,
    h('main.map-area', {}, modeBar, mapHost, tooltip, provincePanel, countryPanel, screenPanel)));

  async function applyView(next, { full }) {
    view = next;
    renderTopbar();
    renderModeBar();
    if (!view.map.available) {
      if (!mapHost.contains(mapMissing)) clear(mapHost).append(mapMissing);
    } else if (full) {
      if (!renderer) {
        clear(mapHost);
        renderer = new MapRenderer(mapHost, { onHover, onSelect });
        await renderer.load({ maskUrl: '/map/mask.png', backgroundUrl: view.map.hasBackground ? '/map/background' : null });
      }
      if (!view.fogOfWarEnabled && mapMode === 'fog_of_war') mapMode = 'political';
      renderer.mode = mapMode;
      renderer.setData(view);
      provincePanel.classList.add('hidden');
    }
    if (full) {
      if (!countryPanel.classList.contains('hidden')) openCountry();
      if (currentScreen) renderScreen();
    }
  }

  await applyView(view, { full: true });

  const socket = connectSocket({
    onMessage: (type, payload) => {
      if (type === 'state/full' && payload) applyView(payload, { full: true });
      else if (type === 'state/delta') applyDelta(payload);
      else if (type === 'error') toast(t(payload.messageKey), 'error');
      else if (type === 'notification/toast') {
        const vars = { ...(payload.vars ?? {}) };
        if (vars.techId) vars.name = loc(view.technologies?.find((x) => x.id === vars.techId)?.name) ?? vars.techId;
        toast(t(payload.textKey, vars));
      }
    },
    onStatus: (s) => {
      connBanner.classList.toggle('hidden', s === 'connected');
      clear(connBanner);
      if (s === 'reconnecting') connBanner.append(t('ws.reconnecting'));
      if (s === 'failed') connBanner.append(t('ws.failed'), ' ', h('button.btn.btn-small', { onClick: () => socket.reconnect() }, t('ws.reconnect')));
    },
  });

  // Raccourcis : Espace = pause/reprise, 1..4 = vitesse (MECHANICS_SPEC.md §1)
  const onKey = (e) => {
    if (e.target.closest('input, select, textarea') || document.querySelector('.modal-overlay')) return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(view.speed === 0 ? lastSpeed : 0); }
    else if (['1', '2', '3', '4'].includes(e.key)) setSpeed(Number(e.key));
    else if (e.key.startsWith('Arrow') && renderer && document.activeElement !== renderer.canvas) {
      renderer.canvas.focus();
      renderer.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
    }
  };
  document.addEventListener('keydown', onKey);

  function teardown() {
    document.removeEventListener('keydown', onKey);
    socket.close();
    renderer?.destroy();
  }
}
