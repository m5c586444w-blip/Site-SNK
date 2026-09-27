// Tick quotidien de simulation. MECHANICS_SPEC.md §1 : les nations IA sont traitées par
// sous-ensembles, sans bloquer la boucle d'évènements. On traite d'abord la nation du joueur,
// puis on rend la main entre chaque nation IA (setImmediate).
import { economyDay } from './economy.js';
import { researchDay } from './research.js';
import { militaryDay } from './military.js';
import { focusDay } from './focus.js';
import { recordCaptures, diplomacyDay } from './diplomacy.js';
import { eventsDay, fireEvent } from './events.js';

const yieldToLoop = () => new Promise((r) => setImmediate(r));

/** @returns {Promise<{ dailyNet: Record<string, any>, completedTechs: Record<string, string[]>, military: any }>} */
/** Contexte d'application des effets (focus, évènements). */
export function effectContext(state, data) {
  const ctx = {
    map: data.map,
    events: data.events ?? [],
    eventValues: data.eventValues ?? {},
    fireEvent: (eventId, opts) => {
      const ev = ctx.events.find((e) => e.id === eventId);
      return ev ? fireEvent(state, ev, ctx, opts) : false;
    },
  };
  return ctx;
}

export async function runDay(state, data) {
  const { economyRules, militaryRules, map } = data;
  const ctx = effectContext(state, data);
  const player = state.settings.nationId;
  const order = [player, ...state.nations.map((n) => n.id).filter((id) => id !== player)];
  const dailyNet = {};
  const completedTechs = {};
  for (const [i, nationId] of order.entries()) {
    if (i > 0) await yieldToLoop();
    dailyNet[nationId] = economyDay(state, nationId, economyRules);
    completedTechs[nationId] = researchDay(state, nationId);
    focusDay(state, nationId, data.focuses ?? [], ctx);
  }
  // Combat et attrition : résolus une fois pour toutes les nations (les deux camps d'un combat
  // doivent être traités ensemble).
  await yieldToLoop();
  const military = map?.available ? militaryDay(state, map, militaryRules) : { combats: [], destroyed: [], captured: [] };
  recordCaptures(state, military.captured);
  diplomacyDay(state, data.diplomacyRules);
  const firedEvents = eventsDay(state, ctx);
  return { dailyNet, completedTechs, military, firedEvents };
}
