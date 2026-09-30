import { el, clear, icon } from '../utils/dom.js';
import { fmtDate, fmtNumber, parseDate } from '../utils/date.js';
import { cityIdentity, cityLabel, collectCityVisits, placePhotoIds, visitDate } from '../utils/cityVisits.js';
import { on } from '../core/eventbus.js';
import { uuid } from '../utils/id.js';

// A local, read-only drill-down. Native modal focus and a same-URL history stack
// leave the mounted statistics page (and its year/scroll position) untouched.
export class CityDetail {
  constructor(app, host, scroll) {
    this.app = app;
    this.host = host;
    this.scroll = scroll;
    this.token = uuid();
    this.urls = new Set();
    this.generation = 0;
    this.dialog = el('dialog', {
      class: 'city-detail-dialog', 'aria-labelledby': `city-title-${this.token}`,
      oncancel: event => { event.preventDefault(); this.back(); },
      onpointerdown: event => {
        this.backdropPointer = event.button === 0 && this._outside(event) ? event.pointerId : null;
        this.backdropReleased = false;
      },
      onpointerup: event => {
        this.backdropReleased = this.backdropPointer === event.pointerId && this._outside(event);
        this.backdropPointer = null;
      },
      onpointercancel: () => { this.backdropPointer = null; this.backdropReleased = false; },
      onclick: event => {
        if (this.backdropReleased && this._outside(event)) this.close();
        this.backdropReleased = false;
      },
    });
    host.appendChild(this.dialog);
    this._popstate = () => this._syncHistory();
    window.addEventListener('popstate', this._popstate);
    this._unsub = on('data:changed', () => {
      if (!this.dialog.open || this.closing || this.layerMotion) return;
      const top = this.content.scrollTop;
      this._render(this._marker());
      this.content.scrollTop = top;
    });
  }

  t(key, params) { return this.app.t(key, params); }
  get locale() { return this.app.i18n.getLang(); }
  _marker() { return history.state?.travelCityDetail; }

  open(key, trigger) {
    this.pendingBack = false;
    this.cityScrollTop = 0;
    this.origin = { top: this.scroll.scrollTop, trigger, key };
    const marker = { token: this.token, key };
    history.pushState({ ...history.state, travelCityDetail: marker }, '', location.href);
    this._render(marker);
    this._present();
    this.backButton.focus({ preventScroll: true });
  }

  back() {
    if (this.pendingBack || this.closing) return;
    if (this._marker()?.token !== this.token) return this._dismiss();
    this.pendingBack = true;
    history.back();
  }

  _syncHistory() {
    this.pendingBack = false;
    const marker = this._marker();
    if (marker?.token !== this.token) return this._dismiss();
    const nested = this.dialog.open && !this.closing && this.renderedMarker?.journeyId !== marker.journeyId;
    if (nested) return this._transitionLayer(marker);
    const entering = !this.dialog.open || !!this.closing || nested;
    this._render(marker);
    if (entering) this._present({ fresh: nested });
    this.backButton.focus({ preventScroll: true });
  }

  _openJourney(id) {
    if (this.pendingBack || this.closing || this._marker()?.journeyId) return;
    this.cityScrollTop = this.content.scrollTop;
    const marker = { ...this._marker(), journeyId: id };
    history.pushState({ ...history.state, travelCityDetail: marker }, '', location.href);
    this._transitionLayer(marker);
  }

  _transitionLayer(marker) {
    const returning = !marker.journeyId;
    const journeyId = this.renderedMarker?.journeyId;
    const height = getComputedStyle(this.dialog).height;
    this._cancelMotion();
    // Keep the glass shell/backdrop visible. Only its contents change layers.
    const outgoing = el('div', { class: 'city-detail-outgoing', 'aria-hidden': 'true' });
    outgoing.inert = true;
    for (const child of this.dialog.children) outgoing.appendChild(child.cloneNode(true));
    for (const node of outgoing.querySelectorAll('[id]')) node.removeAttribute('id');
    outgoing.style.height = `${this.dialog.clientHeight}px`;
    const oldScroll = this.content.scrollTop;
    // Keep outgoing photos alive until the visual snapshot is removed.
    const oldUrls = this.urls;
    this.urls = new Set();
    this._render(marker);
    const targetHeight = getComputedStyle(this.dialog).height;
    const incoming = [...this.dialog.children];
    this.dialog.appendChild(outgoing);
    outgoing.querySelector('.city-detail-content').scrollTop = oldScroll;
    this.dialog.classList.add('is-layer-transition');
    const cleanup = () => {
      outgoing.remove();
      for (const url of oldUrls) URL.revokeObjectURL(url);
      oldUrls.clear();
    };
    this.layerCleanup = cleanup;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    const timing = { duration, easing: 'cubic-bezier(.22,.68,.25,1)', fill: 'both' };
    this.animations = [
      this.dialog.animate([{ height }, { height: targetHeight }], timing),
      outgoing.animate([
        { transform: 'translateY(0)', opacity: 1 },
        { transform: `translateY(${returning ? 24 : -12}px)`, opacity: 0 },
      ], timing),
      ...incoming.map(node => node.animate([
        { transform: `translateY(${returning ? -12 : 24}px)`, opacity: 0 },
        { transform: 'translateY(0)', opacity: 1 },
      ], timing)),
    ];
    const heightMotion = this.animations[0];
    const started = performance.now();
    this.layerRetarget = () => {
      // Photos can load during the handoff. Measure their natural height without
      // removing the live shell's height animation or exposing a layout jump.
      const measure = this.content.cloneNode(true);
      measure.inert = true;
      measure.setAttribute('aria-hidden', 'true');
      for (const node of measure.querySelectorAll('[id]')) node.removeAttribute('id');
      Object.assign(measure.style, {
        position: 'absolute', visibility: 'hidden', height: 'auto', maxHeight: 'none',
        width: `${this.content.getBoundingClientRect().width}px`,
      });
      this.dialog.appendChild(measure);
      const natural = measure.getBoundingClientRect().height + incoming[0].getBoundingClientRect().height +
        this.dialog.offsetHeight - this.dialog.clientHeight;
      measure.remove();
      const target = Math.min(natural, parseFloat(getComputedStyle(this.dialog).maxHeight));
      const current = getComputedStyle(this.dialog).height;
      heightMotion.currentTime = 0;
      heightMotion.effect.setKeyframes([{ height: current }, { height: `${target}px` }]);
      heightMotion.effect.updateTiming({ duration: Math.max(1, duration - (performance.now() - started)) });
    };
    const epoch = this.motionEpoch;
    const origin = returning && [...this.dialog.querySelectorAll('[data-journey-id]')]
      .find(button => !outgoing.contains(button) && button.dataset.journeyId === journeyId);
    (origin || this.backButton).focus({ preventScroll: true });
    this.layerMotion = Promise.allSettled(this.animations.map(a => a.finished)).then(() => {
      if (epoch !== this.motionEpoch) return;
      this._cancelMotion();
      // Restore after the shell reaches its final height; the smaller interim
      // viewport and loading photos can otherwise clamp the saved offset.
      if (returning) this.content.scrollTop = this.cityScrollTop || 0;
    });
    return this.layerMotion;
  }

  _releasePhotos() {
    this.generation++;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }

  _outside(event) {
    if (event.target !== this.dialog) return false;
    const rect = this.dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
  }

  // Clicking the backdrop leaves the entire local drill-down, including a journey.
  close() {
    if (this.pendingBack || this.closing) return;
    const marker = this._marker();
    if (marker?.token !== this.token) return this._dismiss();
    this.pendingBack = true;
    history.go(marker.journeyId ? -2 : -1);
  }

  _cancelMotion() {
    this.motionEpoch = (this.motionEpoch || 0) + 1;
    this.animations?.forEach(animation => animation.cancel());
    this.animations = [];
    this.layerCleanup?.();
    this.layerCleanup = null;
    this.layerRetarget = null;
    this.layerMotion = null;
    this.dialog.classList.remove('is-entering', 'is-exiting', 'is-layer-transition', 'is-journey-motion');
    this.closing = null;
  }

  _animate(kind) {
    const epoch = ++this.motionEpoch;
    const className = kind === 'enter' ? 'is-entering' : 'is-exiting';
    this.dialog.classList.add(className);
    this.animations = this.dialog.getAnimations();
    return Promise.allSettled(this.animations.map(animation => animation.finished)).then(() => {
      if (epoch !== this.motionEpoch) return false;
      this.dialog.classList.remove(className);
      this.animations = [];
      return true;
    });
  }

  _present({ fresh = false } = {}) {
    const style = this.dialog.open && !fresh ? getComputedStyle(this.dialog) : null;
    const transform = style?.transform || 'translateY(36px)';
    const opacity = style?.opacity || '0';
    this._cancelMotion();
    this.dialog.style.setProperty('--city-enter-transform', transform);
    this.dialog.style.setProperty('--city-enter-opacity', opacity);
    this.dialog.inert = false;
    if (!this.dialog.open) this.dialog.showModal();
    if (fresh) this.dialog.classList.add('is-layer-transition');
    if (this.renderedMarker?.journeyId) this.dialog.classList.add('is-journey-motion');
    this._animate('enter').then(finished => {
      if (finished) this.dialog.classList.remove('is-layer-transition', 'is-journey-motion');
    });
  }

  _dismiss({ immediate = false } = {}) {
    if (immediate) {
      this._cancelMotion();
      this._finishClose(false);
      return Promise.resolve();
    }
    if (this.closing) return this.closing;
    if (!this.dialog.open) return Promise.resolve();
    const style = getComputedStyle(this.dialog);
    const transform = style.transform;
    const opacity = style.opacity;
    this._cancelMotion();
    this.dialog.style.setProperty('--city-exit-transform', transform);
    this.dialog.style.setProperty('--city-exit-opacity', opacity);
    // Keep the modal/backdrop mounted and the statistics inert through the exit.
    this.dialog.inert = true;
    const journeyId = this.renderedMarker?.journeyId;
    if (journeyId) this.dialog.classList.add('is-journey-motion');
    this.closing = this._animate('exit').then(finished => {
      if (!finished) return;
      this.closing = null;
      this.dialog.classList.remove('is-layer-transition', 'is-journey-motion');
      this._finishClose(true);
    });
    return this.closing;
  }

  _finishClose(restore) {
    const wasOpen = this.dialog.open;
    this.dialog.close();
    this.dialog.inert = false;
    this._releasePhotos();
    if (!wasOpen || !restore || !this.origin) return;
    this.scroll.scrollTop = this.origin.top;
    const trigger = this.origin.trigger?.isConnected ? this.origin.trigger :
      [...this.scroll.querySelectorAll('[data-city-key]')].find(button => button.dataset.cityKey === this.origin.key);
    trigger?.focus({ preventScroll: true });
  }

  hide() {
    this._dismiss({ immediate: true });
    // Used only if the parent tab is externally navigated away from.
    if (this._marker()?.token === this.token) {
      const state = { ...history.state };
      delete state.travelCityDetail;
      history.replaceState(state, '', location.href);
    }
  }

  destroy() {
    this.hide();
    this._unsub();
    window.removeEventListener('popstate', this._popstate);
    this.dialog.remove();
  }

  _render(marker) {
    this.renderedMarker = marker;
    this._releasePhotos();
    clear(this.dialog);
    this.backButton = el('button', {
      type: 'button', class: 'icon-btn', 'aria-label': this.t('common.back'), onclick: () => this.back(),
    }, [icon('back', 16)]);
    this.dialog.appendChild(el('div', { class: 'city-detail-toolbar' }, [
      this.backButton, el('span', {}, this.t(marker?.journeyId ? 'city.journeyDetail' : 'city.detail')),
    ]));
    this.content = el('div', { class: 'city-detail-content' });
    this.dialog.appendChild(this.content);
    const city = collectCityVisits(this.app.repo).find(city => city.key === marker?.key);
    if (!city) {
      this._title(this.t('city.unavailable'));
      return;
    }
    if (marker.journeyId) {
      const journey = city.journeys.find(j => j.id === marker.journeyId);
      if (journey) this._renderJourney(journey, city);
      else this._title(this.t('city.unavailable'));
    } else {
      this._renderCity(city);
      this.content.scrollTop = this.cityScrollTop || 0;
    }
  }

  _title(name, subtitle) {
    this.content.appendChild(el('h2', { id: `city-title-${this.token}`, class: 'city-detail-title' }, name));
    if (subtitle) this.content.appendChild(el('p', { class: 'city-detail-subtitle' }, subtitle));
  }

  _section(title) {
    const section = el('section', { class: 'city-detail-section' }, [el('h3', {}, title)]);
    this.content.appendChild(section);
    return section;
  }

  _date(date) { return fmtDate(date, this.locale) || this.t('city.dateUnknown'); }

  _renderCity(city) {
    const label = cityLabel(city, this.locale);
    this._title(label.name, label.country || this.t('city.countryUnknown'));
    const metric = (value, key, primary = false) => el('div', { class: primary ? 'is-primary' : '' }, [
      el('dt', {}, this.t(key)), el('dd', {}, value),
    ]);
    this.content.appendChild(el('dl', { class: 'city-detail-metrics' }, [
      metric(fmtNumber(city.count, this.locale), 'city.visitCount', true),
      metric(this._date(city.firstVisit), 'city.firstVisit'),
      metric(this._date(city.lastVisit), 'city.lastVisit'),
    ]));
    this.content.appendChild(el('p', { class: 'city-detail-hint' }, this.t('city.countHint')));

    const section = this._section(this.t('city.journeys'));
    const journeys = [...city.journeys].sort((a, b) => (parseDate(b.startDate)?.getTime() || 0) - (parseDate(a.startDate)?.getTime() || 0));
    for (const journey of journeys) {
      const route = this.app.repo.placesByJourney(journey.id);
      const title = journey.title || route.map(p => cityLabel(cityIdentity(p), this.locale).name).join(' → ');
      section.appendChild(el('button', {
        type: 'button', class: 'city-journey-row', 'data-journey-id': journey.id,
        onclick: () => this._openJourney(journey.id),
      }, [
        el('span', { class: 'city-row-body' }, [el('span', { class: 'city-row-name' }, title), el('span', { class: 'city-row-meta' }, this._date(journey.startDate))]),
        el('span', { class: 'city-row-arrow', 'aria-hidden': 'true' }, '›'),
      ]));
    }
    this._photos(city.photoIds, label.name);
  }

  _renderJourney(journey, city) {
    const places = this.app.repo.placesByJourney(journey.id);
    const title = journey.title || places.map(p => cityLabel(cityIdentity(p), this.locale).name).join(' → ');
    const dates = [journey.startDate, journey.endDate].filter((date, i, all) => date && all.indexOf(date) === i);
    this._title(title, dates.length ? dates.map(date => this._date(date)).join(' – ') : this.t('city.dateUnknown'));
    if (journey.note) this.content.appendChild(el('p', { class: 'city-detail-note' }, journey.note));
    const section = this._section(this.t('city.route'));
    const list = el('ol', { class: 'city-journey-route' });
    places.forEach((place, index) => {
      const identity = cityIdentity(place);
      const label = cityLabel(identity, this.locale);
      const role = place.role || (index === 0 ? 'start' : index === places.length - 1 ? 'destination' : 'waypoint');
      list.appendChild(el('li', { class: identity.key === city.key ? 'is-current' : '' }, [
        el('span', { class: 'city-row-meta' }, this.t(`city.role.${role}`)),
        el('div', { class: 'city-row-body' }, [
          el('span', { class: 'city-row-name' }, label.name),
          el('span', { class: 'city-row-meta' }, [label.country, this._date(visitDate(place, journey))].filter(Boolean).join(' · ')),
          place.note ? el('p', { class: 'city-detail-note' }, place.note) : null,
        ]),
      ]));
    });
    section.appendChild(list);
    const ids = new Set(placePhotoIds(this.app.repo, places));
    for (const photo of this.app.repo.state.photos || []) if (photo.journeyId === journey.id) ids.add(photo.id);
    this._photos([...ids], title);
  }

  _photos(ids, label) {
    const section = this._section(this.t('city.photos'));
    const status = el('p', { class: 'city-detail-hint', role: 'status' }, this.t(ids.length ? 'common.loading' : 'city.noPhotos'));
    section.appendChild(status);
    if (!ids.length) return;
    const grid = el('div', { class: 'city-photo-grid' });
    section.appendChild(grid);
    const generation = this.generation;
    let pending = ids.length;
    let loaded = 0;
    const finish = () => {
      pending--;
      if (loaded) status.hidden = true;
      else if (!pending) status.textContent = this.t('city.photosUnavailable');
      this.layerRetarget?.();
    };
    for (const id of ids) {
      const img = el('img', { alt: this.t('city.photoAlt', { city: label }), decoding: 'async', hidden: '' });
      grid.appendChild(img);
      Promise.resolve().then(() => this.app.repo.getPhotoUrl(id)).then(url => {
        if (generation !== this.generation || !grid.isConnected) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) { img.remove(); finish(); return; }
        this.urls.add(url);
        img.onload = () => {
          if (generation !== this.generation) return;
          img.hidden = false;
          loaded++;
          finish();
        };
        img.onerror = () => {
          if (generation !== this.generation) return;
          URL.revokeObjectURL(url);
          this.urls.delete(url);
          img.remove();
          finish();
        };
        img.src = url;
      }).catch(() => {
        if (generation !== this.generation) return;
        img.remove();
        finish();
      });
    }
  }
}
