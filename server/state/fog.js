// Brouillard de guerre asymétrique — MECHANICS_SPEC.md §10, cahier des charges §5.6.
// DEFAULT_VISIBILITY = { Paradis: "hidden_beyond_home_island", others: "known" }

/**
 * Visibilité initiale, calculée uniquement pour les nations où fogOfWarEnabled = true.
 * Ce sont les seules à recevoir des données filtrées.
 * @returns {{ [nationId]: { provinces: {[provinceId]: string}, nations: {[nationId]: string} } }}
 */
export function initialVisibility(nations, map) {
  const result = {};
  for (const nation of nations) {
    if (!nation.fogOfWarEnabled) continue;
    const home = map.available ? map.homeLandmass?.[nation.id] : undefined;
    const provinces = {};
    for (const p of map.available ? map.provinces : []) {
      provinces[p.id] = home !== undefined && p.landmass === home ? 'known' : 'hidden';
    }
    const nationVis = {};
    for (const other of nations) nationVis[other.id] = other.id === nation.id ? 'known' : 'hidden';
    result[nation.id] = { provinces, nations: nationVis };
  }
  return result;
}

export function provinceVisibility(state, viewerId, provinceId) {
  const v = state.visibility[viewerId];
  if (!v) return 'known';
  return v.provinces[provinceId] ?? 'hidden';
}

export function nationVisibility(state, viewerId, nationId) {
  const v = state.visibility[viewerId];
  if (!v) return 'known';
  return v.nations[nationId] ?? 'hidden';
}

const RANK = { hidden: 0, partially_known: 1, known: 2 };

/**
 * Levée du brouillard (MECHANICS §10, REVEAL_TRIGGERS) pour une nation sous brouillard.
 * `nationId = '*'` : toutes les autres nations. Une révélation ne dégrade jamais un niveau acquis.
 * Les provinces suivent la nation propriétaire de leur état.
 */
export function reveal(state, map, viewerId, nationId, level) {
  const v = state.visibility[viewerId];
  if (!v) return false;
  const targets = nationId === '*' ? state.nations.map((n) => n.id).filter((id) => id !== viewerId) : [nationId];
  const ownerOfState = new Map(state.states.map((s) => [s.id, s.ownerId]));
  let changed = false;
  for (const target of targets) {
    if (RANK[level] > RANK[v.nations[target] ?? 'hidden']) { v.nations[target] = level; changed = true; }
    for (const p of map.available ? map.provinces : []) {
      if (ownerOfState.get(p.stateId) !== target) continue;
      if (RANK[level] > RANK[v.provinces[p.id] ?? 'hidden']) { v.provinces[p.id] = level; changed = true; }
    }
  }
  return changed;
}
