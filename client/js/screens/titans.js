// Écran des Neuf Titans — FEATURES_SPEC.md §7 ; bonus MECHANICS_SPEC.md §7.3 ; traits LORE §3.3.
import { t, loc } from '../i18n.js';
import { h, clear, modal } from '../ui.js';

export function bonusLines(bonus) {
  return Object.entries(bonus ?? {}).filter(([k]) => k !== 'researchBonusCategory').map(([k, v]) =>
    t(`titans.bonus.${k}`, { v, cat: bonus.researchBonusCategory ? t(`research.category.${bonus.researchBonusCategory}`) : '' }));
}

export function renderTitans(host, ctx) {
  const view = ctx.getView();
  const nationName = (id) => (id === '???' ? '???' : id ? loc(view.nations.find((n) => n.id === id)?.name) ?? id : t('titans.unclaimed'));
  const provinceName = (id) => {
    if (id === '???') return '???';
    if (!id) return '—';
    const p = view.provinces.find((x) => x.id === id);
    return p?.visibility === 'known' ? loc(p.name) : '???';
  };
  const rows = view.titans.map((ti) => h('tr', {},
    h('td', {}, h('strong', {}, t(`titan.${ti.id}`)), ti.holderRole ? h('div.small.muted', {}, loc(ti.holderRole)) : null),
    h('td', {}, nationName(ti.holderNationId)),
    h('td', {}, provinceName(ti.provinceId)),
    h('td', {}, ti.status === '???' ? '???' : h(`span.tag.tag-small.titan-${ti.status}`, {}, t(`titans.status.${ti.status}`)),
      ti.yearsRemaining != null ? h('div.small.muted', {}, t('titans.years', { n: ti.yearsRemaining })) : null),
    h('td', {}, h('button.btn.btn-small', {
      onClick: () => modal({
        title: t('titans.effectTitle', { titan: t(`titan.${ti.id}`) }),
        body: h('div', {},
          h('p', {}, h('strong', {}, `${t('titans.lore')} : `), t(`titans.trait.${ti.id}`)),
          h('ul', {}, ...bonusLines(ti.bonus).map((l) => h('li', {}, l)))),
        actions: [{ label: t('common.close'), value: null, primary: true }],
      }),
    }, t('titans.viewEffect')))));
  clear(host).append(h('table.data-table', {},
    h('thead', {}, h('tr', {}, ...['slot', 'holder', 'location', 'status', 'action'].map((c) => h('th', {}, t(`titans.col.${c}`))))),
    h('tbody', {}, ...rows)));
}
