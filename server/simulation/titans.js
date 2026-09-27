// Neuf Titans — MECHANICS_SPEC.md §7 ; FEATURES_SPEC.md §7 ; LORE_BIBLE.md §3.
// Registre : state.titans[slot] = { holderNationId, provinceId, yearsRemaining, status, holderRole }.
// nation.titanPowersHeld reste synchronisé (utilisé par les conditions d'évènements, §5.3).
import { TITAN_POWER_IDS, SHIFTER_ACTIVE_LIFESPAN_YEARS } from '../../shared/constants.js';
import { addJournal } from '../state/journal.js';

const DAYS_PER_YEAR = 365;

export function initTitans(nations, politics) {
  const reg = {};
  const start = politics?.titans?.start ?? {};
  for (const id of TITAN_POWER_IDS) {
    const holder = nations.find((n) => (n.titanPowersHeld ?? []).includes(id));
    reg[id] = {
      holderNationId: holder?.id ?? null,
      provinceId: start[id]?.provinceId ?? null,
      daysRemaining: Math.round((start[id]?.yearsRemaining ?? SHIFTER_ACTIVE_LIFESPAN_YEARS) * DAYS_PER_YEAR),
      holderRole: start[id]?.holderRole ?? null,
      status: holder ? 'secure' : 'lost',
    };
  }
  return reg;
}

export function syncTitanLists(state) {
  for (const n of state.nations) n.titanPowersHeld = TITAN_POWER_IDS.filter((id) => state.titans[id]?.holderNationId === n.id);
}

/** Change le porteur d'un pouvoir (héritage, transfert scripté). Nouveau cycle de 13 ans (§7.1). */
export function setTitanHolder(state, titanId, nationId, { provinceId = null, resetLifespan = true } = {}) {
  const t = state.titans[titanId];
  t.holderNationId = nationId;
  t.status = nationId ? 'secure' : 'lost';
  if (provinceId !== null) t.provinceId = provinceId;
  if (!nationId) t.provinceId = null;
  if (resetLifespan && nationId) t.daysRemaining = SHIFTER_ACTIVE_LIFESPAN_YEARS * DAYS_PER_YEAR;
  syncTitanLists(state);
}

function capitalProvince(state, nationId) {
  return state.states.find((s) => s.ownerId === nationId && s.controllerId === nationId)?.provinceIds[0] ?? null;
}

/**
 * §7.5 on_shifter_death. [EXTENSION] Les porteurs ne sont pas des divisions : un porteur « meurt
 * tué par l'ennemi » quand la province où il se trouve est prise par une nation en guerre avec la
 * sienne. Si cette nation peut hériter (Eldiens : LORE §3.2), l'évènement TITAN_INHERITANCE lui est
 * proposé ; sinon le pouvoir est perdu.
 */
export function onProvincesCaptured(state, captured, politics, queueInheritance) {
  const canInherit = politics?.titans?.canInheritNations ?? [];
  for (const c of captured) {
    for (const [id, t] of Object.entries(state.titans)) {
      if (t.provinceId !== c.provinceId || t.holderNationId !== c.from) continue;
      if (canInherit.includes(c.to)) queueInheritance({ titanId: id, nationId: c.to, cause: 'killed', provinceId: c.provinceId });
      else {
        setTitanHolder(state, id, null);
        addJournal(state, { visibleTo: [c.from, c.to], category: 'titan', textKey: 'journal.titanLost', vars: { titanId: id } });
      }
    }
  }
}

/** Journée : cycle de vie (§7.1) et statut (en sécurité / en danger / perdu, FEATURES §7). */
export function titansDay(state, queueInheritance) {
  const atWar = (n) => (state.wars ?? []).some(([a, b]) => a === n || b === n);
  for (const [id, t] of Object.entries(state.titans ?? {})) {
    if (!t.holderNationId) { t.status = 'lost'; continue; }
    t.daysRemaining -= 1;
    t.status = atWar(t.holderNationId) ? 'at-risk' : 'secure';
    if (t.daysRemaining <= 0) {
      // [EXTENSION] Fin du cycle de 13 ans : le pouvoir doit passer à un successeur de la même nation.
      queueInheritance({ titanId: id, nationId: t.holderNationId, cause: 'lifespan', provinceId: t.provinceId });
      t.daysRemaining = 0;
    }
  }
}

/**
 * Évènement TITAN_INHERITANCE (§7.5) avec choix pour la nation héritière. Choix 0 : transmettre le
 * pouvoir (Marley doit disposer d'un candidat formé du programme des Guerriers, §7.4) ; choix 1 :
 * le laisser se perdre.
 */
export function resolveInheritance(state, pending, choiceIndex) {
  const { titanId, nationId, provinceId } = pending;
  if (choiceIndex === 0) {
    if (nationId === 'marley') {
      const ready = state.warriorProgram?.candidates.find((c) => c.ready);
      if (!ready) {
        setTitanHolder(state, titanId, null);
        addJournal(state, { visibleTo: [nationId], category: 'titan', textKey: 'journal.titanNoCandidate', vars: { titanId } });
        return;
      }
      state.warriorProgram.candidates = state.warriorProgram.candidates.filter((c) => c !== ready);
    }
    setTitanHolder(state, titanId, nationId, { provinceId: provinceId ?? capitalProvince(state, nationId) });
    addJournal(state, { visibleTo: [nationId], category: 'titan', textKey: 'journal.titanInherited', vars: { titanId } });
  } else {
    setTitanHolder(state, titanId, null);
    addJournal(state, { visibleTo: [nationId], category: 'titan', textKey: 'journal.titanLost', vars: { titanId } });
  }
}
