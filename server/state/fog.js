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
