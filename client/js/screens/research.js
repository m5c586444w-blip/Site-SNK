// Écran de recherche — FEATURES_SPEC.md §5 ; formules MECHANICS_SPEC.md §4.
import { t, loc } from '../i18n.js';
import { h, clear, confirmModal, toast } from '../ui.js';
import { RESEARCH_CATEGORIES } from '/shared/constants.js';
import { researchDays, researchSlotCount } from '/shared/research.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Profondeur d'une techno dans son arbre (0 = sans prérequis), pour la disposition en rangées. */
function depthOf(tech, byId, seen = new Set()) {
  if (seen.has(tech.id)) return 0;
  seen.add(tech.id);
  const pre = (tech.prerequisiteTechIds ?? []).map((id) => byId.get(id)).filter(Boolean);
  return pre.length ? 1 + Math.max(...pre.map((p) => depthOf(p, byId, seen))) : 0;
}

export function renderResearch(host, ctx) {
  const view = ctx.getView();
  const nation = view.nations.find((n) => n.id === view.viewerId);
  const techs = view.technologies ?? [];
  const byId = new Map(techs.map((x) => [x.id, x]));
  const slots = researchSlotCount(nation);
  const active = nation.activeResearch ?? [];
  const techName = (id) => loc(byId.get(id)?.name) ?? id;

  // ---- Slots et recherches en cours
  const slotList = slots == null
    ? h('p.inline-error', {}, t('research.slotsUnknown'))
    : h('ul.slot-list', {}, ...Array.from({ length: slots }, (_, i) => {
      const r = active.find((x) => x.slotIndex === i);
      if (!r) return h('li.slot.free', {}, h('span.muted', {}, `${i + 1}. ${t('research.free')}`));
      const done = 1 - r.daysRemaining / r.totalDays;
      return h('li.slot', {},
        h('span', {}, `${i + 1}. ${techName(r.techId)}`),
        h('div.bar', {}, h('div.bar-fill', { style: { width: `${Math.round(done * 100)}%` } }),
          h('span.bar-text', {}, t('research.daysLeft', { n: Math.ceil(r.daysRemaining) }))),
        h('button.btn.btn-small.btn-danger', {
          onClick: async () => {
            if (await confirmModal(t('research.cancel'), t('research.cancelConfirm', { name: techName(r.techId) }), { danger: true })) {
              await ctx.act('research/cancel', { slotIndex: i });
            }
          },
        }, t('research.cancel')));
    }));

  // ---- Grille par catégorie
  let grid;
  if (!techs.length) {
    grid = h('p.inline-error', {}, t('research.emptyCatalog'));
  } else {
    grid = h('div.tech-grid');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('tech-links');
    grid.append(svg);
    const nodes = new Map();
    for (const cat of RESEARCH_CATEGORIES) {
      const locked = nation.lockedResearchCategories?.includes(cat);
      const col = h(`div.tech-col${locked ? '.locked' : ''}`, { title: locked ? t('research.categoryLocked') : null },
        h('h4', {}, `${locked ? '🔒 ' : ''}${t(`research.category.${cat}`)}`));
      const inCat = techs.filter((x) => x.category === cat).sort((a, b) => depthOf(a, byId) - depthOf(b, byId));
      for (const tech of inCat) {
        const completed = nation.completedTechIds?.includes(tech.id);
        const running = active.some((r) => r.techId === tech.id);
        const missing = (tech.prerequisiteTechIds ?? []).filter((id) => !nation.completedTechIds?.includes(id));
        const status = completed ? 'completed' : running ? 'in_progress' : locked || missing.length ? 'blocked' : 'available';
        const days = Math.ceil(researchDays(tech, nation));
        const title = status === 'blocked'
          ? (locked ? t('research.categoryLocked') : t('research.missing', { list: missing.map(techName).join(', ') }))
          : status === 'available' ? null : t(`research.status.${status}`);
        const node = h(`button.tech-node.${status}`, {
          disabled: status !== 'available',
          title,
          style: { marginTop: `${depthOf(tech, byId) === 0 ? 0 : 0.6}rem` },
          onClick: async () => {
            const free = Array.from({ length: slots ?? 0 }, (_, i) => i).find((i) => !active.some((r) => r.slotIndex === i));
            if (free === undefined) { toast(slots == null ? t('research.slotsUnknown') : t('research.noFreeSlot'), 'error'); return; }
            await ctx.act('research/assign', { techId: tech.id, slotIndex: free });
          },
        }, h('span.tech-name', {}, loc(tech.name)), h('span.tech-days', {}, t('research.days', { n: days })));
        nodes.set(tech.id, node);
        col.append(node);
      }
      grid.append(col);
    }
    // Lignes de prérequis, tracées après la mise en page.
    requestAnimationFrame(() => {
      const gr = grid.getBoundingClientRect();
      svg.setAttribute('width', grid.scrollWidth);
      svg.setAttribute('height', grid.scrollHeight);
      for (const tech of techs) {
        for (const pre of tech.prerequisiteTechIds ?? []) {
          const a = nodes.get(pre)?.getBoundingClientRect();
          const b = nodes.get(tech.id)?.getBoundingClientRect();
          if (!a || !b) continue;
          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', a.left + a.width / 2 - gr.left);
          line.setAttribute('y1', a.bottom - gr.top);
          line.setAttribute('x2', b.left + b.width / 2 - gr.left);
          line.setAttribute('y2', b.top - gr.top);
          svg.append(line);
        }
      }
    });
  }

  clear(host).append(
    h('section', {},
      h('h3', {}, slots == null ? t('research.active') : t('research.slots', { n: slots })),
      slotList),
    h('section', {}, grid),
  );
}
