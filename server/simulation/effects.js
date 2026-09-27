// Application des effets de focus et d'évènements. Types FocusEffect de MECHANICS_SPEC.md §2,
// plus quelques effets [EXTENSION] propres aux évènements historiques (voir docs/PHASE4_GAPS.md).
import { RESOURCE_TYPES, STABILITY_RANGE, WAR_SUPPORT_RANGE, TITAN_POWER_IDS, RESEARCH_CATEGORIES } from '../../shared/constants.js';
import { reveal } from '../state/fog.js';
import { addJournal } from '../state/journal.js';
import { changeRelation, startWar } from './diplomacy.js';
import { provinceController } from './military.js';

const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));
const nationOf = (state, id) => state.nations.find((n) => n.id === id);

/**
 * @param ctx { map, events, eventValues, fireEvent(eventId, { force }) }
 * @returns {string[]} effets non appliqués faute de donnée (pour le journal)
 */
export function applyEffects(state, nationId, effects, ctx) {
  const skipped = [];
  const nation = nationOf(state, nationId);
  for (const e of effects ?? []) {
    switch (e.type) {
      case 'resourceBonus':
        if (RESOURCE_TYPES.includes(e.resource)) nation.resourceStockpile[e.resource] = Math.max(0, nation.resourceStockpile[e.resource] + e.amount);
        break;
      case 'modifyStability':
        // Stabilité de départ absente des specs : sans valeur de base, l'effet ne peut s'appliquer.
        if (nation.stability == null) skipped.push('modifyStability'); else nation.stability = clamp(nation.stability + e.delta, STABILITY_RANGE);
        break;
      case 'modifyWarSupport':
        if (nation.warSupport == null) skipped.push('modifyWarSupport'); else nation.warSupport = clamp(nation.warSupport + e.delta, WAR_SUPPORT_RANGE);
        break;
      case 'unlockEquipment':
        nation.lockedEquipment = (nation.lockedEquipment ?? []).filter((x) => x !== e.equipmentId);
        break;
      case 'unlockTech':
        // Un nom de catégorie ouvre la catégorie (§4 : navy/aviation fermées pour Paradis) ;
        // sinon la technologie est ajoutée aux technologies acquises.
        if (RESEARCH_CATEGORIES.includes(e.techId)) nation.lockedResearchCategories = (nation.lockedResearchCategories ?? []).filter((c) => c !== e.techId);
        else if (!nation.completedTechIds.includes(e.techId)) nation.completedTechIds.push(e.techId);
        break;
      case 'triggerEvent':
        ctx.fireEvent(e.eventId, { force: true });
        break;
      case 'diplomaticAction':
        if (e.action === 'establish_contact') {
          // REVEAL_TRIGGERS : diplomatic_contact_established
          reveal(state, ctx.map, nationId, e.targetNationId, 'known');
          state.diplomacyLog.push({ date: null, actor: nationId, target: e.targetNationId, action: 'establish_contact' });
        } else if (e.action === 'improve_relations') {
          changeRelation(state, nationId, e.targetNationId, e.amount ?? 0);
        }
        break;
      case 'grantTitanPower':
        if (!TITAN_POWER_IDS.includes(e.titanId)) { skipped.push('grantTitanPower'); break; }
        for (const n of state.nations) if (n.titanPowersHeld) n.titanPowersHeld = n.titanPowersHeld.filter((x) => x !== e.titanId);
        nation.titanPowersHeld = [...(nation.titanPowersHeld ?? []), e.titanId];
        break;

      // ---------- [EXTENSION] effets d'évènements ----------
      case 'reveal':
        reveal(state, ctx.map, e.viewerId ?? nationId, e.nationId, e.level);
        break;
      case 'setNationFlag': {
        const target = nationOf(state, e.nationId ?? nationId);
        target.flags = { ...(target.flags ?? {}), [e.flag]: true };
        break;
      }
      case 'startWar':
        startWar(state, e.nations[0], e.nations[1], {
          historicalEventId: e.historicalWarEventId ?? null,
          softEndDate: ctx.events.find((x) => x.id === e.historicalWarEventId)?.softEndDate ?? null,
          softEndWinner: ctx.events.find((x) => x.id === e.historicalWarEventId)?.softEndWinner ?? null,
        });
        break;
      case 'transferTitanPowers': {
        // HISTORICAL_EVENT_CHAIN §1.3 : « two of Marley's Titan-holding infiltrators » sans préciser
        // lesquels ; la liste des Titans de Marley en 844 manque aussi (PHASE1_GAPS B5).
        const from = nationOf(state, e.from);
        const ids = e.titanIds ?? null;
        if (!ids || !from?.titanPowersHeld) { skipped.push('transferTitanPowers'); break; }
        const to = nationOf(state, e.to);
        for (const id of ids) {
          if (!from.titanPowersHeld.includes(id)) continue;
          from.titanPowersHeld = from.titanPowersHeld.filter((x) => x !== id);
          to.titanPowersHeld = [...(to.titanPowersHeld ?? []), id];
        }
        break;
      }
      case 'abandonWallRing': {
        // Perte du territoire du Mur extérieur : provinces des états marqués `wallRing` sur la carte.
        const states = state.states.filter((s) => s.ownerId === e.nationId && s.wallRing === e.ring);
        if (!states.length) { skipped.push('abandonWallRing'); break; }
        for (const st of states) {
          for (const pid of st.provinceIds) { state.provinceControl[pid] = null; state.dynamicHazards[pid] = true; }
          st.controllerId = null;
          st.factories = [];
        }
        for (const line of state.productionLines) {
          const alive = new Set(state.states.flatMap((s) => s.factories.map((f) => f.id)));
          line.assignedFactoryIds = line.assignedFactoryIds.filter((id) => alive.has(id));
        }
        break;
      }
      case 'devastateMainland': {
        // Grondement : effets uniquement (cahier §5.7). États continentaux : usines détruites,
        // infrastructure ramenée à 0. La population n'est pas modélisée (PHASE4_GAPS).
        const spared = e.sparedNationId;
        const homeLandmass = ctx.map.homeLandmass?.[spared];
        const landmassOf = new Map((ctx.map.provinces ?? []).map((p) => [p.id, p.landmass]));
        for (const st of state.states) {
          if (st.ownerId === spared) continue;
          if (st.provinceIds.some((pid) => landmassOf.get(pid) === homeLandmass)) continue;
          st.factories = [];
          if (st.infrastructureLevel != null) st.infrastructureLevel = 0;
        }
        const alive = new Set(state.states.flatMap((s) => s.factories.map((f) => f.id)));
        for (const line of state.productionLines) line.assignedFactoryIds = line.assignedFactoryIds.filter((id) => alive.has(id));
        break;
      }
      case 'globalShock': {
        const v = ctx.eventValues ?? {};
        for (const n of state.nations) {
          if (n.id === e.nationId) continue;
          if (n.stability != null && v.globalShockStability != null) n.stability = clamp(n.stability + v.globalShockStability, STABILITY_RANGE);
          if (v.globalShockRelations != null) changeRelation(state, n.id, e.nationId, v.globalShockRelations);
        }
        break;
      }
      default:
        skipped.push(e.type);
    }
  }
  if (skipped.length) {
    addJournal(state, { visibleTo: [nationId], category: 'politics', textKey: 'journal.effectsSkipped', vars: { list: [...new Set(skipped)].join(', ') } });
  }
  return skipped;
}

export { provinceController };
