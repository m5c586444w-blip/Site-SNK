// Écran des focus nationaux — FEATURES_SPEC.md §6 ; MECHANICS_SPEC.md §5.
import { t, loc } from '../i18n.js';
import { h, clear } from '../ui.js';
import { effectText } from './effectText.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COL_W = 190;
const ROW_H = 96;

export function renderFocus(host, ctx) {
  const view = ctx.getView();
  const f = view.focus;
  const byId = new Map(f.tree.map((x) => [x.id, x]));
  const name = (id) => loc(byId.get(id)?.name) ?? id;

  const status = (node) => (f.completedFocusIds.includes(node.id) ? 'completed'
    : f.activeFocusId === node.id ? 'in_progress'
      : node.blockers.length || f.activeFocusId ? 'locked' : 'available');

  const reasonText = (node) => {
    if (f.activeFocusId && !node.blockers.length) return t('focus.block.FOCUS_SLOT_BUSY');
    return node.blockers.filter((b) => !['FOCUS_COMPLETED', 'FOCUS_IN_PROGRESS'].includes(b.code)).map((b) => t(`focus.block.${b.code}`, {
      list: (b.focusIds ?? []).map(name).join(', '), titan: b.titanId ? t(`titan.${b.titanId}`) : '', date: b.date ?? '',
    })).join('\n');
  };

  const maxX = Math.max(0, ...f.tree.map((x) => x.x));
  const maxY = Math.max(0, ...f.tree.map((x) => x.y));
  const canvas = h('div.focus-canvas', { style: { width: `${(maxX + 1) * COL_W}px`, height: `${(maxY + 1) * ROW_H}px` } });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', (maxX + 1) * COL_W);
  svg.setAttribute('height', (maxY + 1) * ROW_H);
  svg.classList.add('tech-links');
  canvas.append(svg);
  for (const node of f.tree) {
    for (const pre of node.prerequisiteFocusIds) {
      const p = byId.get(pre);
      if (!p) continue;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', p.x * COL_W + COL_W / 2); line.setAttribute('y1', p.y * ROW_H + 70);
      line.setAttribute('x2', node.x * COL_W + COL_W / 2); line.setAttribute('y2', node.y * ROW_H + 8);
      svg.append(line);
    }
  }
  for (const node of f.tree) {
    const st = status(node);
    const tip = [
      loc(node.description),
      '',
      `${t('focus.effects')} :`,
      ...node.effects.map((e) => `• ${effectText(e, view)}`),
      node.avertsEventId ? `• ${t('focus.avertsEvent', { event: node.avertsEventId })}` : null,
      node.delaysEventId ? `• ${t('focus.delaysEvent', { event: node.delaysEventId })}` : null,
      ...(node.reveal ?? []).map((r) => `• ${effectText({ type: 'reveal', ...r }, view)}`),
      st === 'locked' ? `\n${reasonText(node)}` : null,
    ].filter((x) => x != null).join('\n');
    const progress = st === 'in_progress' ? 1 - f.focusDaysRemaining / node.costDays : st === 'completed' ? 1 : 0;
    canvas.append(h(`button.focus-node.${st}`, {
      style: { left: `${node.x * COL_W + 10}px`, top: `${node.y * ROW_H + 8}px`, width: `${COL_W - 20}px` },
      title: tip,
      disabled: st !== 'available',
      'aria-label': `${loc(node.name)} — ${t(`focus.status.${st}`)}`,
      onClick: () => ctx.act('focus/start', { focusId: node.id }),
    },
    h('span.focus-name', {}, loc(node.name)),
    h('span.focus-days', {}, st === 'in_progress' ? t('focus.daysLeft', { n: f.focusDaysRemaining }) : t('focus.days', { n: node.costDays })),
    h('div.focus-progress', {}, h('div', { style: { width: `${Math.round(progress * 100)}%` } }))));
  }
  const branchLegend = h('div.focus-branches', {}, ...Object.values(f.branches).map((b) => h('span.tag', {}, loc(b))));
  clear(host).append(
    h('p.muted.small', {}, t('focus.extensionNote')),
    h('p', {}, f.activeFocusId ? t('focus.current', { name: name(f.activeFocusId) }) : t('focus.none')),
    branchLegend,
    h('div.focus-scroll', {}, canvas));
}
