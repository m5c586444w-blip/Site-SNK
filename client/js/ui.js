// Petits utilitaires DOM + modales + toasts partagés par les écrans.
import { t, loc } from './i18n.js';

/** h('div.class#id', {attrs}, ...children) */
export function h(tag, attrs = {}, ...children) {
  const [, name = 'div', rest = ''] = /^([a-z0-9]+)?(.*)$/i.exec(tag);
  const el = document.createElement(name);
  for (const part of rest.match(/[.#][^.#]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Valeur absente des spécifications : « N/D » + infobulle, jamais une valeur inventée. */
export function naValue() {
  return h('span.na', { title: t('common.naTooltip') }, t('common.na'));
}

export function modal({ title, body, actions }) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const overlay = h('div.modal-overlay', { onClick: (e) => { if (e.target === overlay) close(null); } },
      h('div.modal.panel', { role: 'dialog', 'aria-modal': 'true' },
        h('h2.modal-title', {}, title),
        h('div.modal-body', {}, body ?? ''),
        h('div.modal-actions', {}, ...actions.map((a) => h(`button.btn${a.primary ? '.btn-primary' : ''}${a.danger ? '.btn-danger' : ''}`,
          { onClick: () => close(a.value) }, a.label)))));
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    overlay.querySelector('.btn-primary, .btn')?.focus();
  });
}

export const confirmModal = (title, text, { danger = false } = {}) => modal({
  title,
  body: h('p', {}, text),
  actions: [
    { label: t('common.cancel'), value: false },
    { label: t('common.confirm'), value: true, primary: !danger, danger },
  ],
});

// Toasts : haut-droite, 6 s sauf survol, 3 au plus (FEATURES_SPEC.md §14.1). Le débordement
// « +N » renverra vers le journal quand celui-ci existera (phase ultérieure).
const TOAST_MS = 6000;
const TOAST_MAX = 3;
let toastRoot = null;
let overflow = 0;

export function toast(text, kind = 'info') {
  if (!toastRoot) { toastRoot = h('div.toasts', { 'aria-live': 'polite' }); document.body.append(toastRoot); }
  const items = toastRoot.querySelectorAll('.toast:not(.toast-more)');
  if (items.length >= TOAST_MAX) {
    overflow += 1;
    let more = toastRoot.querySelector('.toast-more');
    if (!more) { more = h('div.toast.toast-more'); toastRoot.append(more); }
    more.textContent = `+${overflow}`;
    return;
  }
  const el = h(`div.toast.toast-${kind}`, {}, text);
  let timer;
  const arm = () => { timer = setTimeout(() => { el.remove(); if (!toastRoot.querySelector('.toast:not(.toast-more)')) { overflow = 0; toastRoot.querySelector('.toast-more')?.remove(); } }, TOAST_MS); };
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', arm);
  toastRoot.prepend(el);
  arm();
}

export function errorText(e) {
  return t(`error.${e?.code ?? 'INTERNAL'}`);
}

/** Blason provisoire (FEATURES_SPEC.md §0.4 « flag placeholder ») : couleurs de faction, initiale. */
export function flagPlaceholder(nation, size = 'md') {
  const primary = nation?.colors?.primary ?? '#666';
  const secondary = nation?.colors?.secondary ?? '#ddd';
  const letter = (loc(nation?.name) ?? nation?.id ?? '?').normalize('NFD')[0].toUpperCase();
  return h(`span.flag.flag-${size}`, {
    style: { background: `linear-gradient(135deg, ${primary} 0 62%, ${secondary} 62% 100%)`, color: secondary },
    'aria-hidden': 'true',
  }, letter);
}
