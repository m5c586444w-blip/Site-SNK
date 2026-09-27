// Tick quotidien de simulation. MECHANICS_SPEC.md §1 : les nations IA sont traitées par
// sous-ensembles, sans bloquer la boucle d'évènements. On traite d'abord la nation du joueur,
// puis on rend la main entre chaque nation IA (setImmediate).
import { economyDay } from './economy.js';
import { researchDay } from './research.js';
import { militaryDay } from './military.js';

const yieldToLoop = () => new Promise((r) => setImmediate(r));

/** @returns {Promise<{ dailyNet: Record<string, any>, completedTechs: Record<string, string[]>, military: any }>} */
export async function runDay(state, { economyRules, militaryRules, map }) {
  const player = state.settings.nationId;
  const order = [player, ...state.nations.map((n) => n.id).filter((id) => id !== player)];
  const dailyNet = {};
  const completedTechs = {};
  for (const [i, nationId] of order.entries()) {
    if (i > 0) await yieldToLoop();
    dailyNet[nationId] = economyDay(state, nationId, economyRules);
    completedTechs[nationId] = researchDay(state, nationId);
  }
  // Combat et attrition : résolus une fois pour toutes les nations (les deux camps d'un combat
  // doivent être traités ensemble).
  await yieldToLoop();
  const military = map?.available ? militaryDay(state, map, militaryRules) : { combats: [], destroyed: [], captured: [] };
  return { dailyNet, completedTechs, military };
}
