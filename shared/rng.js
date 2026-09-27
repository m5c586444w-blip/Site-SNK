// PRNG déterministe (mulberry32) initialisé par rngSeed (MECHANICS §11 : « stored for
// deterministic replay/debugging »). L'état courant est conservé dans state.rngState.
export function seedFromHex(hex) {
  let h = 2166136261;
  for (const c of String(hex)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Renvoie [valeur dans [0,1), nouvel état]. */
export function nextRandom(stateInt) {
  let t = (stateInt + 0x6D2B79F5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
