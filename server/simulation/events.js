// Évènements — MECHANICS_SPEC.md §5.3 ; FEATURES_SPEC.md §14.2 ; HISTORICAL_EVENT_CHAIN_845_854.md.
// Conditions évaluées une fois par jour. Pour chaque évènement historique, la condition
// réellement évaluée est :
//   GameSettings.historicalMode == true AND (<condition de la table>) AND NOT <focus d'évitement fait>
// En Mode libre, aucun évènement de la table ne peut donc se déclencher : c'est le seul verrou
// (pas d'interrupteur par évènement, conformément à §5.3).
import { parseCondition, evaluate, gateHistorical } from '../../shared/conditions.js';
import { formatDate } from '../../shared/calendar.js';
import { addJournal } from '../state/journal.js';
import { applyEffects } from './effects.js';
import { resolveInheritance } from './titans.js';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

/** Compile les conditions au chargement : une erreur de syntaxe fait échouer le démarrage. */
export function compileEvents(eventData) {
  return (eventData.events ?? []).map((ev) => {
    let cond = ev.triggerCondition;
    if (ev.delayFocus) {
      // DELAY_OCEAN_DISCOVERY : repousse la fenêtre au lieu d'annuler (HISTORICAL_EVENT_CHAIN §1.5).
      const done = `nation('${ev.delayFocus.nationId}').completedFocusIds includes '${ev.delayFocus.focusId}'`;
      cond = `(NOT ${done} AND (${cond})) OR (${done} AND (${ev.delayFocus.delayedCondition}))`;
    }
    if (ev.historical) cond = gateHistorical(cond);
    if (ev.avertFocus) cond = `(${cond}) AND NOT nation('${ev.avertFocus.nationId}').completedFocusIds includes '${ev.avertFocus.focusId}'`;
    return { ...ev, compiledCondition: cond, tree: parseCondition(cond) };
  });
}

function conditionContext(state, nationId) {
  return {
    date: state.date,
    settings: state.settings,
    nations: state.nations,
    nation: state.nations.find((n) => n.id === nationId),
    events: state.eventLog,
  };
}

export function eventIsDue(state, ev) {
  if (state.eventLog[ev.id]?.fired && !ev.repeatable) return false;
  return evaluate(ev.tree, conditionContext(state, ev.nationId));
}

/**
 * Déclenche un évènement. Pour le joueur, il rejoint les évènements en attente (modale bloquante).
 * Pour une nation IA, le premier choix est appliqué ([CHOIX] aucune règle d'IA dans les specs).
 */
export function fireEvent(state, ev, ctx) {
  if (state.eventLog[ev.id]?.fired && !ev.repeatable) return false;
  state.eventLog[ev.id] = { ...(state.eventLog[ev.id] ?? {}), fired: true, firedDate: formatDate(state.date) };
  addJournal(state, { visibleTo: [ev.nationId], category: ev.category ?? 'politics', text: ev.title, textKey: 'journal.event' });
  if ((state.humanNations ?? [state.settings.nationId]).includes(ev.nationId)) {
    state.pendingEvents.push(ev.id);
  } else {
    applyEffects(state, ev.nationId, ev.choices[0]?.effects, ctx);
  }
  return true;
}

/** event/resolve { nationId, eventId, choiceIndex } */
export function resolveEvent(state, nationId, eventId, choiceIndex, ctx) {
  if (String(eventId).startsWith('TITAN_INHERITANCE:')) {
    const id = Number(eventId.split(':')[1]);
    const p = (state.pendingInheritances ?? []).find((x) => x.id === id) ?? fail('EVENT_NOT_PENDING');
    if (p.nationId !== nationId) fail('NOT_YOUR_NATION');
    if (![0, 1].includes(choiceIndex)) fail('INVALID_CHOICE');
    state.pendingInheritances = state.pendingInheritances.filter((x) => x !== p);
    resolveInheritance(state, p, choiceIndex);
    return { eventId, choiceIndex };
  }
  if (!state.pendingEvents.includes(eventId)) fail('EVENT_NOT_PENDING');
  const ev = ctx.events.find((e) => e.id === eventId) ?? fail('EVENT_NOT_PENDING');
  if (ev.nationId !== nationId) fail('NOT_YOUR_NATION');
  const choice = ev.choices[choiceIndex] ?? fail('INVALID_CHOICE');
  state.pendingEvents = state.pendingEvents.filter((x) => x !== eventId);
  applyEffects(state, nationId, choice.effects, ctx);
  return { eventId, choiceIndex };
}

/** Évaluation quotidienne. Retourne les ids déclenchés. */
export function eventsDay(state, ctx) {
  const fired = [];
  for (const ev of ctx.events) {
    if (eventIsDue(state, ev) && fireEvent(state, ev, ctx)) fired.push(ev.id);
  }
  return fired;
}
