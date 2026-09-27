// Écran du renseignement — FEATURES_SPEC.md §11.
import { t, loc } from '../i18n.js';
import { h, clear } from '../ui.js';
import { INTEL_OPERATIONS } from '/shared/constants.js';

const UNKNOWN = '__unknown__';

export function renderIntel(host, ctx) {
  const view = ctx.getView();
  const intel = view.intel;
  const me = view.nations.find((n) => n.id === view.viewerId);
  const nationName = (id) => (id === UNKNOWN ? t('intel.unknown') : loc(view.nations.find((n) => n.id === id)?.name) ?? id);
  const freeAgents = intel.agents.filter((a) => a.busyDays <= 0);
  const agents = h('ul.log-list', {}, ...intel.agents.map((a, i) => h('li', {}, `${t('intel.agent')} ${i + 1} — `, a.busyDays > 0 ? t('intel.agentBusy', { n: a.busyDays }) : t('intel.agentFree'))));

  const cards = INTEL_OPERATIONS.map((op) => {
    const cfg = intel.operations[op];
    const targets = intel.targets.filter((x) => op === 'reconnaissance' || x !== UNKNOWN);
    const sel = h('select', { 'aria-label': t('intel.target') }, ...targets.map((x) => h('option', { value: x }, nationName(x))));
    const reason = !freeAgents.length ? t('intel.noAgent')
      : !targets.length ? t('dipl.block.NATION_UNKNOWN')
        : me.politicalCapital == null || me.politicalCapital < cfg.politicalCapitalCost ? t('dipl.block.INSUFFICIENT_POLITICAL_CAPITAL') : null;
    return h('div.law-block.panel', {},
      h('h4', {}, t(`intel.op.${op}`)),
      h('p.small.muted', {}, t('intel.cost', { pc: cfg.politicalCapitalCost, cd: cfg.cooldownDays, p: Math.round(cfg.successChance * 100) })),
      h('div.inline', {}, sel, h('button.btn.btn-small', {
        disabled: Boolean(reason),
        title: reason,
        onClick: () => ctx.act('intel/operation', { operationType: op, targetNationId: sel.value, agentId: freeAgents[0].id }),
      }, t('intel.launch'))));
  });
  clear(host).append(
    h('p.small.muted', {}, t('intel.extensionNote')),
    h('section', {}, h('h3', {}, t('intel.agent')), agents),
    h('section', {}, h('h3', {}, t('intel.ops')), h('div.law-grid', {}, ...cards)),
    h('section', {}, h('h3', {}, t('intel.log')), intel.log.length
      ? h('ul.log-list', {}, ...intel.log.slice().reverse().map((x) => h('li', {}, `${x.date} · ${t(`intel.op.${x.operationType}`)} → ${nationName(x.targetNationId)} : `,
        h(`span.tag.tag-small${x.success ? '' : '.tag-danger'}`, {}, t(x.success ? 'intel.success' : 'intel.failure')))))
      : h('p.muted', {}, t('intel.noLog'))));
}
