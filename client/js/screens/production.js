// Écran de production — FEATURES_SPEC.md §4 ; formules MECHANICS_SPEC.md §3 (via shared/economy.js).
import { api } from '../api.js';
import { t, loc } from '../i18n.js';
import { h, clear, modal, confirmModal, toast, errorText } from '../ui.js';
import { EQUIPMENT_TYPES, EFFICIENCY_LOSS_ON_REASSIGN, RESOURCE_TYPES } from '/shared/constants.js';
import { dailyOutput, efficiencyAfterReassign } from '/shared/economy.js';

const EQUIPMENT_GLYPH = {
  infantry_equipment: 'INF', artillery: 'ART', light_armor: 'BL', medium_armor: 'BM',
  fighter_aircraft: 'CHA', bomber_aircraft: 'BOM', naval_hull_light: 'CL', naval_hull_heavy: 'CO',
};

const pct = (x) => Math.round(x * 100);
const fmt = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString();

export function equipmentIcon(type) {
  return h('span.equip-icon', { title: t(`equipment.${type}`) }, EQUIPMENT_GLYPH[type] ?? '?');
}

export function lockedTooltip() {
  // Le nom du focus qui débloque n'existe pas encore (arbres de focus non écrits, cahier §7).
  return t('equipment.locked', { focus: t('equipment.lockedFocusUnknown') });
}

/**
 * @param {HTMLElement} host
 * @param {{ getView: () => any, act: (type: string, payload: any) => Promise<void> }} ctx
 */
export function renderProduction(host, ctx) {
  const view = ctx.getView();
  const nation = view.nations.find((n) => n.id === view.viewerId);
  const eco = view.economy;
  const allFactories = eco.states.flatMap((s) => s.factories);
  const freeMilitary = allFactories.filter((f) => f.type === 'military' && !f.assignedLineId);
  const civilianCount = allFactories.filter((f) => f.type === 'civilian').length;
  const militaryCount = allFactories.length - civilianCount;

  async function reassign(line, nextIds) {
    const from = pct(line.efficiency);
    const to = pct(efficiencyAfterReassign(line.efficiency));
    const ok = await confirmModal(t('prod.reassignTitle'), t('prod.reassignWarn', { loss: pct(EFFICIENCY_LOSS_ON_REASSIGN), from, to }));
    if (ok) await ctx.act('production/assign', { lineId: line.id, factoryIds: nextIds });
  }

  // ---- Lignes
  const lineRows = eco.productionLines.map((line) => {
    const out = dailyOutput(line);
    return h('tr', {},
      h('td', {}, equipmentIcon(line.equipmentType), ' ', t(`equipment.${line.equipmentType}`)),
      h('td.num', {},
        h('div.stepper', {},
          h('button.btn.btn-small', {
            disabled: line.assignedFactoryIds.length === 0,
            'aria-label': '−',
            onClick: () => reassign(line, line.assignedFactoryIds.slice(0, -1)),
          }, '−'),
          h('span.counter', {}, line.assignedFactoryIds.length),
          h('button.btn.btn-small', {
            disabled: freeMilitary.length === 0,
            title: freeMilitary.length === 0 ? t('prod.noFreeMilitary') : null,
            'aria-label': '+',
            onClick: () => reassign(line, [...line.assignedFactoryIds, freeMilitary[0].id]),
          }, '+'))),
      h('td', {}, h('div.bar', { role: 'meter', 'aria-valuenow': pct(line.efficiency), 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('div.bar-fill', { style: { width: `${pct(line.efficiency)}%` } }), h('span.bar-text', {}, `${pct(line.efficiency)} %`))),
      h('td.num', {}, fmt(out, 2)),
      h('td.num', {}, h('button.link-btn', {
        onClick: async () => { if (await confirmModal(t('prod.deleteLine'), t('prod.deleteLine') + ' ?', { danger: true })) await ctx.act('production/deleteLine', { lineId: line.id }); },
      }, '×')));
  });

  const newLineSelect = h('select', { 'aria-label': t('prod.newLine') }, ...EQUIPMENT_TYPES.map((e) => {
    const locked = nation.lockedEquipment?.includes(e);
    return h('option', { value: e, disabled: locked, title: locked ? lockedTooltip() : null }, `${t(`equipment.${e}`)}${locked ? ' 🔒' : ''}`);
  }));

  // ---- Construction
  async function buildDialog() {
    const stateSel = h('select', { id: 'build-state' }, ...eco.states.map((s) => h('option', { value: s.id }, loc(s.name))));
    const typeSel = h('div.segmented', { role: 'radiogroup' }, ...['civilian', 'military'].map((v, i) =>
      h('label', {}, h('input', { type: 'radio', name: 'ftype', value: v, checked: i === 0 }), t(`prod.${v}`))));
    const costLine = h('p.muted');
    const updateCost = () => {
      const type = typeSel.querySelector('input:checked').value;
      const cost = eco.rules.factoryBuildCost[type];
      costLine.textContent = cost == null ? t('prod.costMissing') : t('prod.cost', { n: cost });
      costLine.classList.toggle('inline-error', cost == null);
      return cost;
    };
    typeSel.addEventListener('change', updateCost);
    updateCost();
    const ok = await modal({
      title: t('prod.buildTitle'),
      body: h('div.form-stack', {}, h('label', { for: 'build-state' }, t('prod.state')), stateSel, h('span.label', {}, t('prod.type')), typeSel, costLine),
      actions: [{ label: t('common.cancel'), value: false }, { label: t('common.confirm'), value: true, primary: true }],
    });
    if (!ok) return;
    // Le serveur refuse aussi (FACTORY_COST_MISSING) : message explicite, jamais d'échec silencieux (§17).
    await ctx.act('production/newFactory', { stateId: stateSel.value, type: typeSel.querySelector('input:checked').value });
  }

  const conversionCost = eco.rules.factoryConversionCost;
  const stateRows = eco.states.map((s) => {
    const reason = s.civilian === 0 ? t('prod.noCivilian') : conversionCost == null ? t('prod.convertCostMissing') : null;
    return h('tr', {},
      h('td', {}, loc(s.name)),
      h('td.num', {}, s.civilian),
      h('td.num', {}, s.military),
      h('td.num', {}, h('button.btn.btn-small', {
        disabled: Boolean(reason),
        title: reason,
        onClick: async () => {
          if (await confirmModal(t('prod.convertTitle'), t('prod.convertConfirm', { state: loc(s.name), n: conversionCost }))) {
            await ctx.act('production/convertFactory', { stateId: s.id });
          }
        },
      }, t('prod.convert'))));
  });

  const queue = eco.constructionQueue.map((p) => {
    const st = eco.states.find((s) => s.id === p.stateId);
    return h('li', {},
      h('span', {}, `${t(`prod.kind.${p.kind}`)} — ${loc(st?.name) ?? p.stateId}`),
      h('div.bar', {}, h('div.bar-fill', { style: { width: `${Math.min(100, (p.progress / p.cost) * 100)}%` } }),
        h('span.bar-text', {}, `${fmt(p.progress, 0)} / ${p.cost}`)));
  });

  clear(host).append(
    h('section', {},
      h('h3', {}, t('prod.lines')),
      eco.productionLines.length
        ? h('table.data-table', {},
          h('thead', {}, h('tr', {}, h('th'), h('th.num', {}, t('prod.factories')), h('th', {}, t('prod.efficiency')), h('th.num', {}, t('prod.output')), h('th'))),
          h('tbody', {}, ...lineRows))
        : h('p.muted', {}, t('prod.noLines')),
      h('div.inline.add-line', {}, newLineSelect, h('button.btn.btn-small', {
        onClick: () => ctx.act('production/newLine', { equipmentType: newLineSelect.value }),
      }, t('prod.addLine')))),

    h('section', {},
      h('h3', {}, t('prod.factoryCounters')),
      h('div.counters', {},
        h('div.counter-box', { title: t('prod.civilianHint') }, h('span', {}, t('prod.civilian')), h('strong', {}, civilianCount)),
        h('div.counter-box', {}, h('span', {}, t('prod.military')), h('strong', {}, militaryCount)),
        h('div.counter-box', {}, h('span', {}, t('prod.militaryFree')), h('strong', {}, freeMilitary.length)),
        h('button.btn', { disabled: eco.states.length === 0, title: eco.states.length === 0 ? t('prod.noStates') : null, onClick: buildDialog }, t('prod.build'))),
      h('p.muted.small', {}, t('prod.civilianHint'))),

    h('section', {},
      h('h3', {}, t('prod.queue')),
      queue.length ? h('ul.queue-list', {}, ...queue) : h('p.muted', {}, t('prod.queueEmpty'))),

    h('section', {},
      h('h3', {}, t('prod.states')),
      eco.states.length
        ? h('table.data-table', {},
          h('thead', {}, h('tr', {}, h('th', {}, t('prod.state')), h('th.num', {}, t('prod.civilian')), h('th.num', {}, t('prod.military')), h('th'))),
          h('tbody', {}, ...stateRows))
        : h('p.muted', {}, t('prod.noStates'))),

    h('section', {},
      h('h3', {}, t('prod.stockpile')),
      h('div.stockpile-grid', {}, ...EQUIPMENT_TYPES.map((e) => {
        const locked = nation.lockedEquipment?.includes(e);
        return h(`div.stock-item${locked ? '.locked' : ''}`, { title: locked ? lockedTooltip() : t(`equipment.${e}`) },
          equipmentIcon(e),
          h('span.stock-name', {}, t(`equipment.${e}`)),
          h('strong', {}, locked ? '🔒' : fmt(nation.equipmentStockpile?.[e] ?? 0, 1)));
      }))),

    h('section', {},
      h('h3', {}, t('prod.resources')),
      h('div.counters', {}, ...RESOURCE_TYPES.map((r) => h('div.counter-box', {},
        h('span', {}, t(`resource.${r}`)), h('strong', {}, fmt(nation.resourceStockpile?.[r] ?? 0, 1))))),
      h('p.muted.small', {}, t('resource.consumptionNote'))),
  );
}

export { loc };
