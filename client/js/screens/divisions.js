// Écran Divisions / ordre de bataille — FEATURES_SPEC.md §8 ; formules MECHANICS_SPEC.md §6.2.
import { t, loc } from '../i18n.js';
import { h, clear, modal, confirmModal, toast, naValue } from '../ui.js';
import { BATTALION_TYPES, MAX_TEMPLATE_WIDTH } from '/shared/constants.js';
import { computeTemplateStats } from '/shared/military.js';

const BATTALION_GLYPH = { infantry: 'INF', artillery: 'ART', light_armor: 'BL', medium_armor: 'BM' };
const BATTALION_KEYS = Object.keys(BATTALION_TYPES);

// Brouillon de l'éditeur, conservé entre deux rendus (l'écran est redessiné à chaque jour de jeu).
let draft = null;
export let dragging = false;

function battalionChip(type, extra = {}) {
  const b = BATTALION_TYPES[type];
  return h('span.batt-chip', { title: `${t(`battalion.${type}`)} — ${t('stat.attack')} ${b.attack}, ${t('stat.defense')} ${b.defense}, ${t('stat.width')} ${b.width}`, ...extra },
    h('span.equip-icon', {}, BATTALION_GLYPH[type]), h('span', {}, t(`battalion.${type}`)));
}

export function provinceName(view, id) {
  const p = view.provinces.find((x) => x.id === id);
  if (!p || p.visibility !== 'known') return t('map.menu.unknownTarget');
  return p.name ?? id;
}

/** Provinces voisines attaquables (en guerre) ; les provinces inconnues sont proposées comme telles. */
export function advanceTargets(view, provinceId) {
  const me = view.viewerId;
  const wars = view.military.wars ?? [];
  const atWar = (x) => x && wars.some(([a, b]) => (a === me && b === x) || (b === me && a === x));
  return (view.military.adjacency?.[provinceId] ?? [])
    .map((id) => view.provinces.find((p) => p.id === id))
    .filter((p) => p && (p.visibility !== 'known' ? wars.some(([a, b]) => a === me || b === me) : atWar(p.controllerId)));
}

/** Menu d'ordres commun à l'OOB et au clic droit sur la carte (FEATURES §2, §8). */
export function orderButtons(view, ctx, divisionIds, provinceId) {
  const act = (payload) => Promise.all(divisionIds.map((divisionId) => ctx.act('division/order', { divisionId, ...payload })));
  const targets = advanceTargets(view, provinceId);
  const advance = h('select.order-select', { 'aria-label': t('oob.order.advance') },
    h('option', { value: '' }, `${t('oob.order.advance')}…`),
    ...targets.map((p) => h('option', { value: p.id }, p.visibility === 'known' ? p.name : t('map.menu.unknownTarget'))));
  advance.disabled = targets.length === 0;
  advance.title = targets.length === 0 ? t('map.menu.noTarget') : '';
  advance.addEventListener('change', () => { if (advance.value) act({ order: 'advance', targetProvinceId: advance.value }); });
  return [
    h('button.btn.btn-small', { onClick: () => Promise.all(divisionIds.map((divisionId) => ctx.act('division/setFront', { divisionId }))) }, t('oob.setFront')),
    advance,
    h('button.btn.btn-small', { onClick: () => act({ order: 'hold' }) }, t('oob.order.hold')),
    h('button.btn.btn-small', { onClick: () => act({ order: 'retreat' }) }, t('oob.order.retreat')),
  ];
}

function meter(value) {
  return h('div.bar.bar-mini', {}, h('div.bar-fill', { style: { width: `${Math.max(0, Math.min(100, value))}%` } }), h('span.bar-text', {}, Math.round(value)));
}

export function renderDivisions(host, ctx) {
  const view = ctx.getView();
  const me = view.viewerId;
  const nation = view.nations.find((n) => n.id === me);
  const mil = view.military;
  const templates = mil.templates;
  const myDivisions = mil.divisions.filter((d) => d.nationId === me);
  const tplById = new Map(templates.map((x) => [x.id, x]));
  const nationName = (id) => loc(view.nations.find((n) => n.id === id)?.name) ?? id;

  // ---------------- Arbre : fronts → divisions → bataillons
  const groups = new Map();
  for (const d of myDivisions) {
    const key = d.frontId ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  const frontLabel = (frontId) => {
    if (!frontId) return t('oob.reserve');
    const enemy = frontId.replace(/^front:/, '').split('|').find((x) => x !== me) ?? '?';
    return t('oob.front', { enemy: nationName(enemy) });
  };
  const tree = h('div.oob-tree', {},
    h('p.muted.small', {}, t('oob.armiesNote')),
    myDivisions.length === 0 ? h('p.muted', {}, t('oob.noDivisions')) : null,
    ...[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([frontId, divs]) => h('details.oob-group', { open: true },
      h('summary', {}, `${frontLabel(frontId)} — ${divs.length}`),
      ...divs.map((d) => {
        const tpl = tplById.get(d.templateId);
        const orderText = d.movement ? t('oob.moving', { n: d.movement.daysRemaining })
          : d.order ? `${t(`oob.order.${d.order}`)}${d.targetProvinceId ? ` ${t('oob.target', { province: provinceName(view, d.targetProvinceId) })}` : ''}`
            : t('oob.order.none');
        return h('details.oob-division', {},
          h('summary', {},
            h('strong', {}, tpl?.name ?? d.templateId),
            h('span.muted', {}, ` — ${provinceName(view, d.locationProvinceId)}`),
            h('span.oob-meters', {}, h('span.small', {}, t('oob.org')), meter(d.organization), h('span.small', {}, t('oob.str')), meter(d.strength)),
            h('span.tag.tag-small', {}, orderText)),
          h('ul.oob-battalions', {}, ...(tpl?.battalions ?? []).map((b) => h('li', {}, battalionChip(b.battalionType), ` ×${b.count}`))),
          h('div.order-row', {}, ...orderButtons(view, ctx, [d.id], d.locationProvinceId)));
      }))));

  // ---------------- Éditeur de modèles
  if (!draft || (draft.id && !tplById.has(draft.id))) draft = { id: null, name: '', counts: {} };
  const battalionsOf = (counts) => BATTALION_KEYS.filter((k) => counts[k] > 0).map((k) => ({ battalionType: k, count: counts[k] }));
  const stats = computeTemplateStats(battalionsOf(draft.counts));
  const tooWide = stats.width > MAX_TEMPLATE_WIDTH;
  const rerender = () => (ctx.rerender ? ctx.rerender() : renderDivisions(host, ctx));
  const add = (type) => {
    const next = { ...draft.counts, [type]: (draft.counts[type] ?? 0) + 1 };
    if (computeTemplateStats(battalionsOf(next)).width > MAX_TEMPLATE_WIDTH) { toast(t('tpl.tooWide', { max: MAX_TEMPLATE_WIDTH }), 'error'); return; }
    draft.counts = next;
    rerender();
  };

  const select = h('select', { id: 'tpl-select', 'aria-label': t('tpl.select') },
    h('option', { value: '' }, t('tpl.new')),
    ...templates.map((x) => h('option', { value: x.id, selected: x.id === draft.id }, x.name)));
  select.addEventListener('change', () => {
    const tpl = tplById.get(select.value);
    draft = tpl ? { id: tpl.id, name: tpl.name, counts: Object.fromEntries(tpl.battalions.map((b) => [b.battalionType, b.count])) } : { id: null, name: '', counts: {} };
    rerender();
  });
  const nameInput = h('input.text-input', { value: draft.name, maxlength: 60, placeholder: t('tpl.name'), 'aria-label': t('tpl.name') });
  nameInput.addEventListener('input', () => { draft.name = nameInput.value; });

  const palette = h('div.batt-palette', {}, ...BATTALION_KEYS.map((type) => battalionChip(type, {
    draggable: 'true',
    role: 'button',
    tabindex: 0,
    onDragstart: (e) => { dragging = true; e.dataTransfer.setData('text/plain', type); },
    onDragend: () => { dragging = false; },
    onClick: () => add(type),
    onKeydown: (e) => { if (e.key === 'Enter') add(type); },
  })));
  const slots = [];
  for (const type of BATTALION_KEYS) {
    for (let i = 0; i < (draft.counts[type] ?? 0); i++) {
      slots.push(battalionChip(type, { role: 'button', tabindex: 0, onClick: () => { draft.counts = { ...draft.counts, [type]: draft.counts[type] - 1 }; rerender(); } }));
    }
  }
  const dropZone = h(`div.batt-drop${tooWide ? '.too-wide' : ''}`, {
    onDragover: (e) => { e.preventDefault(); },
    onDrop: (e) => { e.preventDefault(); dragging = false; const type = e.dataTransfer.getData('text/plain'); if (BATTALION_TYPES[type]) add(type); },
  }, ...(slots.length ? slots : [h('span.muted', {}, t('tpl.drop'))]));

  const eqText = Object.entries(stats.equipmentCost).map(([eq, n]) => `${t(`equipment.${eq}`)} ${n}`).join(' · ') || '—';
  const statRow = (k, v) => h('div.kv', {}, h('span', {}, t(k)), v);
  const statsPanel = h('div.tpl-stats', {},
    statRow('stat.attack', h('strong', {}, stats.attack)),
    statRow('stat.defense', h('strong', {}, stats.defense)),
    statRow('stat.width', h(`strong${tooWide ? '.danger' : ''}`, {}, t('tpl.width', { w: stats.width, max: MAX_TEMPLATE_WIDTH }))),
    statRow('stat.speed', stats.speed == null ? h('span.na', { title: t('stat.speedMissing') }, t('common.na')) : h('strong', {}, stats.speed)),
    statRow('stat.manpower', h('strong', {}, stats.manpowerCost.toLocaleString())),
    statRow('stat.equipment', h('span', {}, eqText)));

  const current = draft.id ? tplById.get(draft.id) : null;
  const editor = h('div.tpl-editor', {},
    h('div.inline', {}, select, nameInput),
    h('p.small.muted', {}, t('tpl.palette')),
    palette,
    dropZone,
    statsPanel,
    h('div.modal-actions', {},
      current ? h('button.btn.btn-danger', {
        onClick: async () => {
          if (!(await confirmModal(t('tpl.delete'), t('tpl.deleteConfirm', { name: current.name }), { danger: true }))) return;
          await ctx.act('template/delete', { templateId: current.id });
          draft = null;
          rerender();
        },
      }, t('tpl.delete')) : null,
      current ? h('button.btn', { onClick: () => raiseDivision(view, ctx, current, nation) }, t('div.create')) : null,
      h('button.btn.btn-primary', {
        disabled: tooWide,
        onClick: async () => {
          const res = await ctx.act('template/save', { template: { id: draft.id ?? undefined, name: draft.name, battalions: battalionsOf(draft.counts) } });
          if (res?.result?.id) { draft.id = res.result.id; toast(t('tpl.saved')); rerender(); }
        },
      }, t('tpl.save'))));

  clear(host).append(h('div.oob-layout', {},
    h('section.oob-left', {}, h('h3', {}, t('oob.tree')), tree),
    h('section.oob-right', {}, h('h3', {}, t('tpl.editor')), editor)));
}

/** Former une division : aperçu des coûts, blocage avec message si stock insuffisant (FEATURES §8, §17). */
async function raiseDivision(view, ctx, template, nation) {
  const provinces = view.provinces.filter((p) => p.visibility === 'known' && p.controllerId === view.viewerId);
  const stats = template.computedStats;
  const problems = [];
  if (nation.manpower == null) problems.push(t('div.manpowerUnknown'));
  else if (nation.manpower < stats.manpowerCost) problems.push(t('div.insufficient', { what: t('stat.manpower'), need: stats.manpowerCost, have: nation.manpower }));
  for (const [eq, n] of Object.entries(stats.equipmentCost)) {
    const have = Math.floor(nation.equipmentStockpile?.[eq] ?? 0);
    if (have < n) problems.push(t('div.insufficient', { what: t(`equipment.${eq}`), need: n, have }));
  }
  if (!provinces.length) problems.push(t('div.noProvince'));
  const sel = h('select', { id: 'div-province' }, ...provinces.map((p) => h('option', { value: p.id }, p.name)));
  const body = h('div.form-stack', {},
    h('label', { for: 'div-province' }, t('div.province')), sel,
    h('span.label', {}, t('div.cost')),
    h('ul.cost-list', {},
      h('li', {}, `${t('stat.manpower')} : ${stats.manpowerCost.toLocaleString()} — `, nation.manpower == null ? naValue() : t('div.have', { n: nation.manpower.toLocaleString() })),
      ...Object.entries(stats.equipmentCost).map(([eq, n]) => h('li', {}, `${t(`equipment.${eq}`)} : ${n} — ${t('div.have', { n: Math.floor(nation.equipmentStockpile?.[eq] ?? 0) })}`))),
    ...problems.map((p) => h('p.inline-error', { role: 'alert' }, p)));
  const ok = await modal({
    title: t('div.createTitle', { name: template.name }),
    body,
    actions: [{ label: t('common.cancel'), value: false }, ...(problems.length ? [] : [{ label: t('common.confirm'), value: true, primary: true }])],
  });
  if (ok) await ctx.act('division/create', { templateId: template.id, provinceId: sel.value });
}
