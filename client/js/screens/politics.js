// Écran politique — FEATURES_SPEC.md §10 ; MECHANICS_SPEC.md §9, §9.3.
import { t, loc } from '../i18n.js';
import { h, clear, confirmModal } from '../ui.js';
import { LAW_CATEGORIES } from '/shared/constants.js';

export function modifierText(mods) {
  return Object.entries(mods ?? {}).map(([k, v]) => t(`mod.${k}`, { v: v > 0 && k !== 'manpowerPerDay' ? `+${v}` : v })).join(' · ');
}

export function renderPolitics(host, ctx, { openPendingEvent }) {
  const view = ctx.getView();
  const pol = view.politics;
  const sections = LAW_CATEGORIES.map((cat) => {
    const cd = pol.cooldowns[cat] ?? 0;
    const defs = pol.lawDefs[cat] ?? {};
    return h('div.law-block.panel', {},
      h('h4', {}, t(`pol.cat.${cat}`), cd > 0 ? h('span.tag.tag-small', {}, t('pol.cooldown', { n: cd })) : null),
      ...Object.entries(defs).map(([id, def]) => {
        const active = pol.laws[cat] === id;
        return h(`div.law-row${active ? '.active' : ''}`, {},
          h('div', {}, h('strong', {}, loc(def.name)), active ? h('span.tag.tag-small', {}, t('pol.active')) : null,
            h('div.small.muted', {}, modifierText(def.modifiers) || '—')),
          active ? null : h('button.btn.btn-small', {
            disabled: cd > 0,
            title: cd > 0 ? t('pol.cooldown', { n: cd }) : null,
            onClick: async () => {
              if (await confirmModal(t('pol.change'), t('pol.lawChangeConfirm', { law: loc(def.name) }))) {
                await ctx.act('law/change', { category: cat, newValue: id });
              }
            },
          }, t('pol.change')));
      }));
  });

  let eldian = null;
  if (view.viewerId === 'marley' && pol.eldianStatusPolicy) {
    const cd = pol.cooldowns.eldianStatusPolicy ?? 0;
    eldian = h('div.law-block.panel', {},
      h('h4', {}, t('pol.eldian'), cd > 0 ? h('span.tag.tag-small', {}, t('pol.cooldown', { n: cd })) : null),
      h('div.segmented', { role: 'radiogroup' }, ...['strict', 'moderate', 'relaxed'].map((p) => {
        const m = pol.eldianModifiers[p];
        return h('label', { title: `${t('pol.eldian')} : ${m.marleyanPopStabilityBonus} / ${m.eldianPopUnrestChancePerDay * 100} % / ×${m.warriorProgramDefectionMultiplier}` },
          h('input', {
            type: 'radio', name: 'eldian', value: p, checked: pol.eldianStatusPolicy === p, disabled: cd > 0,
            onChange: async (e) => {
              // Confirmation avec les chiffres de §9.3 (FEATURES §10 : pas de texte inventé)
              const text = t('pol.eldianConfirm', { policy: t(`pol.eldian.${p}`), stab: m.marleyanPopStabilityBonus >= 0 ? `+${m.marleyanPopStabilityBonus}` : m.marleyanPopStabilityBonus, unrest: m.eldianPopUnrestChancePerDay * 100, defect: m.warriorProgramDefectionMultiplier });
              if (await confirmModal(t('pol.eldian'), text)) await ctx.act('law/eldianPolicy', { policy: p });
              else { e.target.checked = false; ctx.rerender(); }
            },
          }), t(`pol.eldian.${p}`));
      })));
  }

  const pending = view.pendingEvents ?? [];
  clear(host).append(
    h('p.small.muted', {}, t('pol.extensionNote')),
    h('section', {}, h('h3', {}, t('pol.laws')), h('div.law-grid', {}, ...sections)),
    eldian ? h('section', {}, eldian) : null,
    h('section', {}, h('h3', {}, t('pol.pending')), pending.length
      ? h('ul.log-list', {}, ...pending.map((ev) => h('li', {}, ev.kind === 'titan_inheritance' ? t('inherit.title', { titan: t(`titan.${ev.titanId}`) }) : loc(ev.title), ' ',
        h('button.btn.btn-small', { onClick: () => openPendingEvent(ev) }, t('pol.resolve')))))
      : h('p.muted', {}, t('pol.noPending'))));
}
