/** supply_value(state) — MECHANICS_SPEC.md §3.4. null si l'infrastructure n'est pas renseignée. */
export function supplyValue(infrastructureLevel, frontlineDivisionsInState = 0) {
  if (infrastructureLevel == null) return null;
  return Math.min(1, Math.max(0, 0.5 + 0.1 * infrastructureLevel - 0.05 * frontlineDivisionsInState));
}
