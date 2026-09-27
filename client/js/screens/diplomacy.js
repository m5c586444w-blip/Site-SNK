// Écran diplomatique — FEATURES_SPEC.md §9 ; MECHANICS_SPEC.md §8.
import { t, loc } from '../i18n.js';
import { h, clear, confirmModal } from '../ui.js';

const ACTIONS = ['propose_alliance', 'propose_nonaggression', 'guarantee_independence', 'embargo', 'justify_wargoal', 'declare_war'];
let historyFilter = '';

export function renderDiplomacy(host, ctx) {
  const view = ctx.getView();
  const d = view.diplomacy;
  const me = view.viewerId;
  const nationName = (id) => loc(view.nations.find((n) => n.id === id)?.name) ?? id;

  const relationBar = (v) => h('div.relation-bar', { title: `${v} / ±200` },
    h('div.relation-fill', { style: { left: v < 0 ? `${50 + v / 4}%` : '50%', width: `${Math.abs(v) / 4}%`, background: v < 0 ? 'var(--danger)' : 'var(--ok)' } }),
    h('span.bar-text', {}, v));

  const rows = d.nations.map((n) => {
    const wg = d.wargoals.find((w) => w.targetId === n.id);
    return h('div.dipl-nation.panel', {},
      h('div.dipl-head', {}, h('strong', {}, nationName(n.id)), relationBar(n.relation)),
      wg ? h('p.small', {}, wg.daysRemaining > 0 ? t('dipl.wargoal', { nation: nationName(n.id), n: wg.daysRemaining }) : t('dipl.wargoalReady', { nation: nationName(n.id) })) : null,
      h('div.order-row', {}, ...ACTIONS.map((a) => {
        const blocker = n.blockers[a];
        const cost = d.costs[a];
        const costText = cost ? (cost.minRelation == null ? t('dipl.costNoMin', { pc: cost.politicalCapitalCost }) : t('dipl.cost', { pc: cost.politicalCapitalCost, min: cost.minRelation })) : '';
        // Bouton désactivé + raison en infobulle (FEATURES §9, §17) : jamais de refus après clic.
        return h(`button.btn.btn-small${a === 'declare_war' ? '.btn-danger' : ''}`, {
          disabled: Boolean(blocker),
          title: [costText, blocker ? t(`dipl.block.${blocker}`) : null].filter(Boolean).join(' — '),
          onClick: async () => {
            if (a === 'declare_war' && !(await confirmModal(t('dipl.action.declare_war'), t('dipl.declareConfirm', { nation: nationName(n.id) }), { danger: true }))) return;
            await ctx.act('diplomacy/action', { targetNationId: n.id, action: a });
          },
        }, t(`dipl.action.${a}`));
      })));
  });

  const wars = d.wars.map((w) => h('li', {}, `${nationName(w.attacker)} — ${nationName(w.defender)} · `,
    t('dipl.warscore', { a: nationName(w.attacker), sa: w.warscore[w.attacker] ?? 0, sb: w.warscore[w.defender] ?? 0, b: nationName(w.defender) })));
  const agreements = d.agreements.map((g) => h('li', {}, `${t(`dipl.agreement.${g.type}`)} : ${nationName(g.a)} → ${nationName(g.b)} (${g.date})`));

  const partners = [...new Set(d.log.flatMap((x) => [x.actor, x.target]).filter((x) => x !== me))];
  const filter = h('select', { 'aria-label': t('dipl.filter') }, h('option', { value: '' }, t('dipl.all')),
    ...partners.map((p) => h('option', { value: p, selected: p === historyFilter }, nationName(p))));
  filter.addEventListener('change', () => { historyFilter = filter.value; ctx.rerender(); });
  const log = d.log.filter((x) => !historyFilter || x.actor === historyFilter || x.target === historyFilter)
    .map((x) => h('li', {}, `${x.date ?? '—'} · ${nationName(x.actor)} → ${nationName(x.target)} : ${t(`dipl.action.${x.action}`)}`));

  clear(host).append(
    h('div.counters', {}, h('div.counter-box', {}, h('span', {}, t('dipl.pc')), d.politicalCapital == null
      ? h('span.na', { title: t('common.naTooltip') }, t('common.na')) : h('strong', {}, d.politicalCapital))),
    h('section', {}, h('h3', {}, t('dipl.nations')), rows.length ? h('div.dipl-list', {}, ...rows) : h('p.muted', {}, t('dipl.noNations'))),
    h('section', {}, h('h3', {}, t('dipl.wars')), wars.length ? h('ul', {}, ...wars) : h('p.muted', {}, t('dipl.noWars'))),
    h('section', {}, h('h3', {}, t('dipl.agreements')), agreements.length ? h('ul', {}, ...agreements) : h('p.muted', {}, '—')),
    h('section', {}, h('h3', {}, t('dipl.history')), filter, log.length ? h('ul.log-list', {}, ...log.reverse()) : h('p.muted', {}, '—')));
}
