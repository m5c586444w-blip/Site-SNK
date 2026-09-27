// Journal — FEATURES_SPEC.md §14.3 : liste chronologique filtrable par catégorie et par dates.
import { t, loc } from '../i18n.js';
import { h, clear } from '../ui.js';
import { JOURNAL_CATEGORIES } from '/shared/constants.js';
import { dateNum } from '/shared/conditions.js';

const filters = { category: '', from: '', to: '' };

export function entryText(e, view) {
  if (e.text) return loc(e.text);
  const vars = { ...e.vars };
  const nationName = (id) => loc(view.nations.find((n) => n.id === id)?.name) ?? id;
  for (const k of ['a', 'b', 'winner', 'loser']) if (vars[k]) vars[k] = nationName(vars[k]);
  // Jamais d'identifiant technique à l'écran (FEATURES §6) : types d'effets traduits.
  if (vars.list) vars.list = vars.list.split(', ').map((x) => t(`skip.${x}`)).join(', ');
  if (vars.focusId) vars.focus = loc(view.focus?.tree.find((f) => f.id === vars.focusId)?.name) ?? vars.focusId;
  return t(e.textKey, vars);
}

export function renderJournal(host, ctx) {
  const view = ctx.getView();
  const cat = h('select', { 'aria-label': t('journal.category') }, h('option', { value: '' }, t('journal.all')),
    ...JOURNAL_CATEGORIES.map((c) => h('option', { value: c, selected: c === filters.category }, t(`journal.cat.${c}`))));
  const from = h('input.text-input.date-input', { value: filters.from, placeholder: 'JJ/MM/an-AAA', 'aria-label': t('journal.from') });
  const to = h('input.text-input.date-input', { value: filters.to, placeholder: 'JJ/MM/an-AAA', 'aria-label': t('journal.to') });
  const apply = () => { filters.category = cat.value; filters.from = from.value; filters.to = to.value; ctx.rerender(); };
  cat.addEventListener('change', apply);
  from.addEventListener('change', apply);
  to.addEventListener('change', apply);
  const valid = (s) => /^\d{2}\/\d{2}\/an-\d+$/.test(s);
  const entries = (view.journal ?? []).filter((e) => (!filters.category || e.category === filters.category)
    && (!valid(filters.from) || dateNum(e.date) >= dateNum(filters.from))
    && (!valid(filters.to) || dateNum(e.date) <= dateNum(filters.to)));
  clear(host).append(
    h('div.inline.journal-filters', {}, cat, h('span', {}, t('journal.from')), from, h('span', {}, t('journal.to')), to),
    entries.length
      ? h('ul.log-list', {}, ...entries.slice().reverse().map((e) => h('li', {},
        h('span.muted', {}, `${e.date} · `), h('span.tag.tag-small', {}, t(`journal.cat.${e.category}`)), ' ', entryText(e, view))))
      : h('p.muted', {}, t('journal.empty')));
}
