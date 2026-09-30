import { el, clear, icon } from '../utils/dom.js';
import { fmtDate } from '../utils/date.js';
import { uuid } from '../utils/id.js';
import { on } from '../core/eventbus.js';

// A settings-only subpage. Same-URL history preserves the underlying settings.
export class DeleteJourneys {
  constructor(app, host, onReturn) {
    this.app = app;
    this.token = uuid();
    this.onReturn = onReturn;
    this.motions = new Map();
    this.page = el('dialog', { class: 'delete-travel-page', 'aria-labelledby': `delete-title-${this.token}` });
    this.back = el('button', { type: 'button', class: 'icon-btn', 'aria-label': app.t('common.back'), onclick: () => this._back() }, [icon('back', 16)]);
    this.page.appendChild(el('div', { class: 'page-head page-head-row' }, [
      this.back, el('h2', { id: `delete-title-${this.token}`, class: 'delete-travel-title' }, app.t('settings.deleteTravel')),
      el('span', { style: { width: '38px' } }),
    ]));
    this.list = el('div', { class: 'view-scroll delete-travel-list' });
    this.page.appendChild(this.list);
    this.confirm = el('dialog', { class: 'delete-travel-confirm', 'aria-labelledby': `delete-confirm-${this.token}` });
    for (const dialog of [this.page, this.confirm]) {
      dialog.addEventListener('cancel', event => { event.preventDefault(); this._back(); });
    }
    const outside = event => {
      const r = this.confirm.getBoundingClientRect();
      return event.target === this.confirm && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom);
    };
    this.confirm.addEventListener('pointerdown', e => { this.outsidePress = outside(e); });
    this.confirm.addEventListener('click', e => { if (this.outsidePress && outside(e)) this._back(); this.outsidePress = false; });
    host.append(this.page, this.confirm);
    this.popstate = () => { void this._sync(); };
    window.addEventListener('popstate', this.popstate);
    this.unsubscribe = on('data:changed', () => { if (!this.busy) this._renderList(); });
  }

  _marker() { return history.state?.deleteTravel; }
  _push(step, id) {
    history.pushState({ ...history.state, deleteTravel: { token: this.token, step, id } }, '', location.href);
    void this._sync();
  }
  open(trigger) {
    this.trigger = trigger;
    this._renderList();
    this._push('list');
  }
  _back() {
    if (this.busy || this.navigating) return;
    this.navigating = true;
    history.back();
  }

  _renderList() {
    clear(this.list);
    const journeys = [...this.app.repo.state.journeys].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    if (!journeys.length) {
      this.list.appendChild(el('p', { class: 'delete-travel-empty' }, this.app.t('settings.noTravel')));
      return;
    }
    for (const journey of journeys) {
      const dates = [journey.startDate, journey.endDate].filter((date, i, all) => date && all.indexOf(date) === i)
        .map(date => fmtDate(date, this.app.i18n.getLang())).filter(Boolean).join(' – ');
      this.list.appendChild(el('button', {
        type: 'button', class: 'delete-travel-row', 'data-journey-id': journey.id,
        onclick: () => { if (!this.busy && this._marker()?.step === 'list') this._push('confirm', journey.id); },
      }, [el('span', { class: 'city-row-body' }, [
        el('span', { class: 'city-row-name' }, journey.title || this.app.t('settings.untitledTravel')),
        el('span', { class: 'city-row-meta' }, dates || this.app.t('city.dateUnknown')),
      ]), icon('trash', 17)]));
    }
  }

  _renderConfirm(id) {
    clear(this.confirm);
    this.confirmId = id;
    const journey = this.app.repo.state.journeys.find(j => j.id === id);
    this.confirm.append(
      el('h3', { id: `delete-confirm-${this.token}` }, this.app.t('settings.deleteTravel')),
      el('p', { class: 'delete-travel-name' }, journey?.title || this.app.t('settings.untitledTravel')),
      el('p', { id: `delete-warning-${this.token}`, class: 'delete-travel-warning' }, this.app.t('settings.deleteTravelConfirm')),
    );
    this.confirm.setAttribute('aria-describedby', `delete-warning-${this.token}`);
    this.error = el('p', { class: 'delete-travel-error', role: 'alert' });
    this.cancel = el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => this._back() }, this.app.t('common.cancel'));
    this.remove = el('button', { type: 'button', class: 'btn btn-danger', onclick: () => this._delete(id) }, this.app.t('common.delete'));
    this.confirm.append(this.error, el('div', { class: 'delete-travel-actions' }, [this.cancel, this.remove]));
  }

  async _sync() {
    this.navigating = false;
    if (this.destroyed || this.busy) return;
    const run = this.syncRun = (this.syncRun || 0) + 1;
    const marker = this._marker();
    const own = marker?.token === this.token;
    if (!own || marker.step !== 'confirm') await this._visible(this.confirm, false);
    if (this.destroyed || run !== this.syncRun) return;
    if (!own) {
      await this._visible(this.page, false);
      if (this.destroyed || run !== this.syncRun) return;
      this.onReturn();
      this.trigger?.isConnected && this.trigger.focus({ preventScroll: true });
      return;
    }
    await this._visible(this.page, true);
    if (this.destroyed || run !== this.syncRun) return;
    if (marker.step === 'confirm') {
      if (!this.app.repo.state.journeys.some(j => j.id === marker.id)) { this._back(); return; }
      if (this.confirmId !== marker.id || !this.confirm.open) this._renderConfirm(marker.id);
      await this._visible(this.confirm, true);
      if (run === this.syncRun && !this.destroyed) this.cancel.focus({ preventScroll: true });
    } else {
      const row = [...this.list.children].find(node => node.dataset.journeyId === this.confirmId);
      (row || this.back).focus({ preventScroll: true });
    }
  }

  _visible(dialog, visible) {
    const previous = this.motions.get(dialog);
    if (previous?.visible === visible) return previous.promise;
    if (!previous && dialog.open === visible) return Promise.resolve();
    const style = previous ? getComputedStyle(dialog) : null;
    const offset = dialog === this.page ? 'translateX(24px)' : 'translateY(20px)';
    const from = style ? { transform: style.transform, opacity: style.opacity } : { transform: visible ? offset : 'none', opacity: visible ? 0 : 1 };
    previous?.animation.cancel();
    if (visible && !dialog.open) dialog.showModal();
    dialog.inert = !visible;
    const animation = dialog.animate([from, { transform: visible ? 'none' : offset, opacity: visible ? 1 : 0 }], {
      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260,
      easing: 'cubic-bezier(.22,.68,.25,1)', fill: 'both',
    });
    const motion = { visible, animation };
    motion.promise = animation.finished.catch(() => {}).then(() => {
      if (this.motions.get(dialog) !== motion) return;
      if (!visible) dialog.close();
      animation.cancel();
      this.motions.delete(dialog);
    });
    this.motions.set(dialog, motion);
    return motion.promise;
  }

  async _delete(id) {
    if (this.busy || this.destroyed) return;
    let deleted = false;
    this.busy = true;
    this.confirm.setAttribute('aria-busy', 'true');
    this.cancel.disabled = this.remove.disabled = this.back.disabled = true;
    this.error.textContent = '';
    try {
      await this.app.repo.deleteJourney(id);
      deleted = true;
      if (this.destroyed) return;
      // Dismiss any map preview/playback still referring to the removed records.
      const map = this.app.router.tabs?.map;
      map?._stopReplay();
      map?._closeDetail();
      if (this.app.pendingNewJourney === id) this.app.pendingNewJourney = null;
      this.app.toast(this.app.t('toast.deleted'));
      this.busy = false;
      this._renderList();
      const marker = this._marker();
      if (marker?.token === this.token) history.go(marker.step === 'confirm' ? -2 : -1);
      else void this._sync();
    } catch (error) {
      if (!this.destroyed) this.error.textContent = this.app.t('settings.deleteTravelError');
    } finally {
      this.busy = false;
      this.confirm.removeAttribute('aria-busy');
      this.cancel.disabled = this.remove.disabled = this.back.disabled = false;
      if (!this.destroyed && (!deleted || this._marker()?.token !== this.token)) void this._sync();
    }
  }

  destroy() {
    this.destroyed = true;
    this.unsubscribe();
    window.removeEventListener('popstate', this.popstate);
    for (const { animation } of this.motions.values()) animation.cancel();
    this.motions.clear();
    for (const dialog of [this.confirm, this.page]) { dialog.close(); dialog.remove(); }
    if (this._marker()?.token === this.token) {
      const state = { ...history.state }; delete state.deleteTravel;
      history.replaceState(state, '', location.href);
    }
  }
}
