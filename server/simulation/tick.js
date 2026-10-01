// Tick quotidien de simulation. MECHANICS_SPEC.md §1 : les nations IA sont traitées par
// sous-ensembles, sans bloquer la boucle d'évènements. On traite d'abord la nation du joueur,
// puis on rend la main entre chaque nation IA (setImmediate).
import { economyDay } from './economy.js';
import { researchDay } from './research.js';
import { militaryDay } from './military.js';
import { focusDay } from './focus.js';
import { recordCaptures, diplomacyDay } from './diplomacy.js';
import { eventsDay, fireEvent } from './events.js';
import { applyEffects } from './effects.js';
import { politicsDay } from './politics.js';
import { titansDay, onProvincesCaptured, resolveInheritance } from './titans.js';
import { intelDay } from './intel.js';
import { nationModifiers, refreshCategoryBonus } from './modifiers.js';
import { addJournal } from '../state/journal.js';
import { aiDay } from './ai.js';

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
  const politics = data.politics ?? null;
  // Héritages de Titans (§7.5) : modale pour un joueur humain, choix 0 pour l'IA.
  const inheritances = [];
  const queueInheritance = (p) => inheritances.push(p);
  for (const [i, nationId] of order.entries()) {
    if (i > 0) await yieldToLoop();
    dailyNet[nationId] = economyDay(state, nationId, economyRules, politics);
    completedTechs[nationId] = researchDay(state, nationId);
    // [EXTENSION] effets des technologies terminées
    for (const techId of completedTechs[nationId]) {
      applyEffects(state, nationId, (data.technologies ?? []).find((t) => t.id === techId)?.effects ?? [], ctx);
    }
    focusDay(state, nationId, data.focuses ?? [], ctx);
    politicsDay(state, nationId, politics, ctx);
  }
  titansDay(state, queueInheritance);
  const modsCache = new Map();
  const getMods = (id) => {
    if (!modsCache.has(id)) modsCache.set(id, nationModifiers(state, id, politics));
    return modsCache.get(id);
  };
  // [EXTENSION] IA des nations non jouées par un humain
  for (const n of state.nations) {
    if (!(state.humanNations ?? [player]).includes(n.id)) aiDay(state, n.id, data, getMods);
  }
  // Combat et attrition : résolus une fois pour toutes les nations (les deux camps d'un combat
  // doivent être traités ensemble).
  await yieldToLoop();
  const military = map?.available ? militaryDay(state, map, militaryRules, getMods) : { combats: [], destroyed: [], captured: [] };
  recordCaptures(state, military.captured);
  onProvincesCaptured(state, military.captured, politics, queueInheritance, map);
  intelDay(state);
  diplomacyDay(state, data.diplomacyRules);
  const firedEvents = eventsDay(state, ctx);
  for (const p of inheritances) {
    if ((state.humanNations ?? [player]).includes(p.nationId)) {
      state.inheritanceSeq = (state.inheritanceSeq ?? 0) + 1;
      state.pendingInheritances.push({ id: state.inheritanceSeq, ...p });
      addJournal(state, { visibleTo: [p.nationId], category: 'titan', textKey: 'journal.titanInheritance', vars: { titanId: p.titanId } });
      firedEvents.push(`TITAN_INHERITANCE:${state.inheritanceSeq}`);
    } else {
      resolveInheritance(state, p, 0);
    }
  }
  refreshCategoryBonus(state, politics);
  return { dailyNet, completedTechs, military, firedEvents };
}
