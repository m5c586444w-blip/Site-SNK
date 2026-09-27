// Journal d'évènements — FEATURES_SPEC.md §14.3. Chaque entrée est visible par une liste de
// nations (ou par toutes). Catégories : JOURNAL_CATEGORIES.
import { formatDate } from '../../shared/calendar.js';

export function addJournal(state, { visibleTo = '*', category, textKey = null, vars = {}, text = null }) {
  state.journal ??= [];
  state.journalSeq = (state.journalSeq ?? 0) + 1;
  const entry = { id: state.journalSeq, date: formatDate(state.date), category, visibleTo, textKey, vars, text };
  state.journal.push(entry);
  return entry;
}

export function journalFor(state, viewerId) {
  return (state.journal ?? []).filter((e) => e.visibleTo === '*' || e.visibleTo.includes(viewerId));
}
