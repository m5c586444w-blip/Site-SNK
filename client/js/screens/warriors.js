// Programme des Guerriers (Marley uniquement) — FEATURES_SPEC.md §12 ; MECHANICS_SPEC.md §7.4.
import { t } from '../i18n.js';
import { h, clear } from '../ui.js';

export function renderWarriors(host, ctx) {
  const view = ctx.getView();
  const wp = view.warriorProgram;
  if (!wp) { clear(host).append(h('p.muted', {}, t('error.MARLEY_ONLY'))); return; }
  const risk = (wp.defectionChancePerDay * 100).toFixed(3);
  clear(host).append(
    // LORE §3.4 : ne pas présenter le programme comme un simple recrutement
    h('p.event-text', {}, t('war.note')),
    h('div.inline', {}, h('strong', {}, t('war.pool', { n: wp.candidates.length, max: wp.poolMax })),
      h('button.btn.btn-small', {
        disabled: wp.candidates.length >= wp.poolMax,
        title: wp.candidates.length >= wp.poolMax ? t('error.POOL_FULL') : null,
        onClick: () => ctx.act('warrior/recruit', {}),
      }, t('war.recruit'))),
    h('ul.slot-list', {}, ...wp.candidates.map((c, i) => h('li.slot', {},
      h('span', {}, `${i + 1}.`),
      c.ready ? h('strong', {}, t('war.ready'))
        : h('div.bar', {}, h('div.bar-fill', { style: { width: `${Math.round((c.daysTrained / wp.trainingDays) * 100)}%` } }),
          h('span.bar-text', {}, t('war.training', { d: c.daysTrained, t: wp.trainingDays }))),
      h('span.small', { title: t('war.risk', { p: risk }) }, c.ready ? '—' : t('war.risk', { p: risk }))))));
}
