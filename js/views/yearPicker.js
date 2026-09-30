import { el } from '../utils/dom.js';

// Keep the existing select/change path; only replace its native popup presentation.
export function yearPicker(select, label) {
  select.hidden = true;
  select.tabIndex = -1;
  const controller = new AbortController();
  const root = el('details', { class: 'stats-year-picker' });
  const selected = [...select.options].find(option => option.value === select.value);
  const summary = el('summary', { class: 'stats-year-trigger', 'aria-label': label, 'aria-haspopup': 'menu' }, [
    el('span', {}, selected?.textContent || ''), el('span', { class: 'year-chevron', 'aria-hidden': 'true' }),
  ]);
  const menu = el('div', { class: 'stats-year-menu', role: 'menu', 'aria-label': label });
  let motion, closing = false, disposed = false, selecting = false;
  const animate = async opening => {
    const current = motion ? getComputedStyle(menu) : null;
    const from = current ? { transform: current.transform, opacity: current.opacity } :
      { transform: opening ? 'translateY(-8px)' : 'translateY(0)', opacity: opening ? 0 : 1 };
    motion?.cancel();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return !disposed;
    const animation = menu.animate([from, {
      transform: opening ? 'translateY(0)' : 'translateY(-8px)', opacity: opening ? 1 : 0,
    }], { duration: 220, easing: 'cubic-bezier(.22,.68,.25,1)', fill: 'both' });
    motion = animation;
    try { await animation.finished; } catch { return false; }
    if (motion !== animation || disposed) return false;
    motion = null;
    animation.cancel();
    return true;
  };
  const open = () => {
    if (selecting || (root.open && !closing)) return;
    closing = false;
    root.open = true;
    summary.setAttribute('aria-expanded', 'true');
    void animate(true);
  };
  const close = async () => {
    if (!root.open) return !disposed;
    if (closing) return false;
    closing = true;
    if (!await animate(false)) return false;
    root.open = false;
    closing = false;
    summary.setAttribute('aria-expanded', 'false');
    return true;
  };
  summary.setAttribute('aria-expanded', 'false');
  summary.addEventListener('click', event => {
    event.preventDefault();
    if (selecting) return;
    if (root.open && !closing) void close(); else open();
  });
  for (const option of select.options) {
    menu.appendChild(el('button', {
      type: 'button', role: 'menuitemradio', 'aria-checked': String(option.value === select.value),
      onclick: async () => {
        if (selecting || closing) return;
        selecting = true;
        if (await close()) {
          select.value = option.value;
          select.dispatchEvent(new Event('change'));
        }
        selecting = false;
      },
    }, option.textContent));
  }
  root.append(summary, menu, select);
  const buttons = [...menu.children];
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); void close(); summary.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    open();
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) :
      (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  });
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget)) void close();
  });
  document.addEventListener('pointerdown', event => {
    if (!root.contains(event.target)) void close();
  }, { signal: controller.signal });
  return { root, dispose: () => { disposed = true; motion?.cancel(); controller.abort(); } };
}
