// Calendrier de jeu. TICK_UNIT = 1 jour (MECHANICS_SPEC.md §1), format "DD/MM/an-YYY".
//
// [HYPOTHÈSE À VALIDER] Les documents ne donnent pas la longueur des mois. On utilise
// 12 mois aux longueurs usuelles, sans année bissextile (365 jours/an).
export const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function formatDate({ day, month, year }) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/an-${year}`;
}

export function parseDate(str) {
  const m = /^(\d{2})\/(\d{2})\/an-(\d+)$/.exec(str);
  if (!m) throw new Error(`Date invalide : ${str}`);
  const date = { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > MONTH_LENGTHS[date.month - 1]) {
    throw new Error(`Date invalide : ${str}`);
  }
  return date;
}

export function nextDay({ day, month, year }) {
  if (day < MONTH_LENGTHS[month - 1]) return { day: day + 1, month, year };
  if (month < 12) return { day: 1, month: month + 1, year };
  return { day: 1, month: 1, year: year + 1 };
}

export function compareDates(a, b) {
  return (a.year - b.year) || (a.month - b.month) || (a.day - b.day);
}
