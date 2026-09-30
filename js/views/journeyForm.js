// views/journeyForm.js — 视图④：Add / Edit Journey 表单（起点 / 终点）
import { ViewBase } from './viewBase.js';
import { icon, el, clear } from '../utils/dom.js';
import { lookupCity, searchCities } from '../utils/cityIndex.js';
import { uuid } from '../utils/id.js';

const QUICK_CITIES = {
  start: ['北京', '上海', '广州', '深圳', '东京', '大阪', '香港'],
  destination: ['北京', '上海', '广州', '深圳', '东京', '大阪', '香港'],
};

export class JourneyForm extends ViewBase {
  render() {
    this.root = el('div', {});
    this.head = el('div', { class: 'page-head page-head-row' });
    const back = el('button', { class: 'icon-btn', onclick: () => this.app.router.back() }, [icon('back', 16)]);
    this.titleEl = el('div', { class: 'display' }, '');
    this.head.appendChild(back);
    this.head.appendChild(this.titleEl);
    this.head.appendChild(el('div', { style: { width: 38 } }));

    this.scroll = el('div', { class: 'view-scroll form-wrap' });
    this.root.appendChild(this.head);
    this.root.appendChild(this.scroll);

    return this.root;
  }

  onMount() {
    const params = this.app.router.current?.params || {};
    this._editingId = params.id || null;
    this._nameEdited = !!this._editingId;
    this._autoTitle = '';
    this._start = this._blankDraft();
    this._destination = this._blankDraft();
    if (!this._editingId) {
      const now = new Date();
      const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
      this._start.arriveAt = this._destination.arriveAt = today;
    }
    this._build();
  }

  _build() {
    const repo = this.app.repo;
    clear(this.scroll);

    const editing = !!this._editingId;
    this.titleEl.textContent = this.t(editing ? 'form.edit' : 'form.new');

    let existing = null;
    if (editing) {
      existing = repo.state.journeys.find((j) => j.id === this._editingId);
      if (!existing) {
        this.app.router.go('journeys');
        return;
      }
    }

    // 旅程字段
    this.nameInput = el('input', { class: 'input', placeholder: this.t('form.namePh') });
    this.nameInput.value = existing ? existing.title : '';
    this.nameInput.addEventListener('input', () => { this._nameEdited = true; });

    this.scroll.appendChild(
      el('div', { class: 'field' }, [el('label', { text: this.t('form.name') }), this.nameInput])
    );

    // 起点
    this.scroll.appendChild(this._sectionLabel('form.start'));
    this.startWrap = el('div', { class: 'place-editor' });
    this.scroll.appendChild(this.startWrap);

    // 终点
    this.scroll.appendChild(this._sectionLabel('form.destination'));
    this.destWrap = el('div', { class: 'place-editor' });
    this.scroll.appendChild(this.destWrap);

    // 初始化地点
    if (existing) {
      const list = repo.placesByJourney(existing.id);
      const start = list.find((p) => p.role === 'start') || list[0];
      const dest = list.find((p) => p.role === 'destination') || list[list.length - 1];
      this._start = start ? this._toDraft(start) : this._blankDraft();
      this._destination = dest && dest !== start ? this._toDraft(dest) : this._blankDraft();
      if (!this._start.arriveAt) this._start.arriveAt = existing.startDate || '';
      if (!this._destination.arriveAt) this._destination.arriveAt = existing.endDate || '';
    }
    this._renderSections();

    // 操作按钮
    const actions = el('div', { style: { display: 'flex', gap: '10px', marginTop: '24px' } });
    const saveBtn = el('button', { class: 'btn btn-primary', style: { flex: 1 }, onclick: () => this._save() }, [el('span', { text: this.t('form.save') })]);
    actions.appendChild(saveBtn);
    if (editing) {
      const delBtn = el('button', { class: 'btn btn-danger', onclick: () => this._delete() }, [icon('trash', 15)]);
      actions.appendChild(delBtn);
    }
    this.scroll.appendChild(actions);

    this.app.i18n.applyI18n(this.root);
  }

  _sectionLabel(key) {
    return el('div', { class: 'form-section' }, [
      el('span', { class: 'form-section-title', 'data-i18n': key }),
    ]);
  }

  _toDraft(p) {
    return {
      id: p.id,
      name: p.name,
      country: p.country || '',
      lat: p.lat != null ? String(p.lat) : '',
      lng: p.lng != null ? String(p.lng) : '',
      arriveAt: (p.arriveAt || '').slice(0, 10),
      note: p.note || '',
      photoIds: p.photoIds || [],
      _photos: [],
      _photoUrls: [],
    };
  }

  _blankDraft() {
    return {
      id: null,
      name: '',
      country: '',
      lat: '',
      lng: '',
      arriveAt: '',
      note: '',
      photoIds: [],
      _photos: [],
      _photoUrls: [],
    };
  }

  _renderSections() {
    // 起点
    clear(this.startWrap);
    this.startWrap.appendChild(this._placeCard(this._start, 'start'));

    // 终点
    clear(this.destWrap);
    this.destWrap.appendChild(this._placeCard(this._destination, 'destination'));
  }

  _placeCard(p, role) {
    const card = el('div', { class: 'place-card', 'data-role': role });

    // 名称（含城市搜索）+ 操作按钮
    const nameRow = el('div', { class: 'place-card-head' });
    nameRow.appendChild(this._nameField(p));
    card.appendChild(nameRow);

    const quick = el('div', { class: 'quick-cities' });
    quick.appendChild(el('span', { class: 'quick-cities-label', text: this.t('form.commonCities') }));
    const chips = el('div', { class: 'quick-cities-scroll' });
    for (const city of QUICK_CITIES[role]) {
      const hit = lookupCity(city);
      chips.appendChild(el('button', { class: 'city-chip', type: 'button', onclick: () => this._selectCity(p, hit) }, hit.nameZh));
    }
    quick.appendChild(chips);
    card.appendChild(quick);

    // 日期 + 坐标
    const row2 = el('div', { class: 'place-card-row' });
    const dateLabel = role === 'start' ? 'form.startDate' : 'form.endDate';
    const dateField = el('label', { class: 'place-date-field' }, [el('span', { text: this.t(dateLabel) })]);
    const dateInput = el('input', { class: 'input', type: 'date' });
    dateInput.value = p.arriveAt;
    dateInput.addEventListener('input', () => (p.arriveAt = dateInput.value));
    dateField.appendChild(dateInput);
    row2.appendChild(dateField);

    const latInput = el('input', { class: 'input', type: 'number', step: 'any', placeholder: this.t('form.lat') });
    latInput.value = p.lat;
    latInput.addEventListener('input', () => (p.lat = latInput.value));
    const lngInput = el('input', { class: 'input', type: 'number', step: 'any', placeholder: this.t('form.lng') });
    lngInput.value = p.lng;
    lngInput.addEventListener('input', () => (p.lng = lngInput.value));
    row2.appendChild(latInput);
    row2.appendChild(lngInput);
    card.appendChild(row2);

    // 备注
    const noteInput = el('input', { class: 'input', placeholder: this.t('form.note') });
    noteInput.value = p.note;
    noteInput.addEventListener('input', () => (p.note = noteInput.value));
    card.appendChild(noteInput);

    // 照片
    const photoRow = el('div', { class: 'place-photos' });
    const addPhoto = el('button', { class: 'mini-btn', title: this.t('form.photos'), onclick: () => this._pickPhoto(p) }, [icon('image', 15)]);
    photoRow.appendChild(addPhoto);
    const thumbs = el('div', { class: 'thumbs' });
    for (const id of p.photoIds) thumbs.appendChild(this._thumbImg(id, null));
    for (const url of p._photoUrls) thumbs.appendChild(this._thumbImg(null, url));
    photoRow.appendChild(thumbs);
    card.appendChild(photoRow);

    return card;
  }

  _thumbImg(id, url) {
    const img = el('img', { class: 'thumb' });
    if (url) img.src = url;
    else if (id) {
      this.app.repo.getPhotoUrl(id).then((u) => {
        if (u) img.src = u;
      });
    }
    return img;
  }

  _autofill(p, input) {
    const hit = lookupCity(input.value);
    if (hit) {
      this._applyCity(p, hit);
      input.value = hit.name;
      const card = input.closest('.place-card');
      const numbers = card.querySelectorAll('input[type="number"]');
      numbers[0].value = p.lat;
      numbers[1].value = p.lng;
    }
  }

  _applyCity(p, hit) {
    p.name = hit.name;
    p.country = hit.country;
    p.lat = String(hit.lat);
    p.lng = String(hit.lng);
    this._syncDestinationTitle(p);
  }

  _syncDestinationTitle(p = this._destination) {
    if (p !== this._destination || this._nameEdited) return;
    // Preserve a custom value supplied by typing or browser autofill.
    if (this.nameInput.value && this.nameInput.value !== this._autoTitle) {
      this._nameEdited = true;
      return;
    }
    const hit = lookupCity(p.name);
    this._autoTitle = hit
      ? (this.app.i18n.getLang() === 'zh' ? hit.nameZh || hit.name : hit.name)
      : p.name.trim();
    this.nameInput.value = this._autoTitle;
  }

  _selectCity(p, hit) {
    this._applyCity(p, hit);
    this._renderSections();
  }

  /** 城市名称输入框（含自动补全下拉） */
  _nameField(p) {
    const wrap = el('div', { class: 'city-search' });
    const input = el('input', { class: 'input', placeholder: this.t('form.placeNamePh') });
    input.value = p.name;
    const suggest = el('div', { class: 'city-suggest' });
    suggest.style.display = 'none';

    input.addEventListener('input', () => {
      p.name = input.value;
      p.country = '';
      p.lat = '';
      p.lng = '';
      this._syncDestinationTitle(p);
      this._showSuggestions(suggest, input, p);
    });
    input.addEventListener('focus', () => this._showSuggestions(suggest, input, p));
    input.addEventListener('blur', () => {
      setTimeout(() => (suggest.style.display = 'none'), 160);
      this._autofill(p, input);
    });

    wrap.appendChild(input);
    wrap.appendChild(suggest);
    return wrap;
  }

  _showSuggestions(suggest, input, p) {
    const q = input.value.trim();
    clear(suggest);
    if (!q || (p.lat && p.lng)) {
      suggest.style.display = 'none';
      return;
    }
    const matches = searchCities(q, 6);
    if (!matches.length) {
      suggest.style.display = 'none';
      return;
    }
    for (const m of matches) {
      const item = el('div', { class: 'city-suggest-item', onmousedown: (e) => e.preventDefault() });
      item.appendChild(
        el('span', { class: 'n' }, m.nameZh && m.nameZh !== m.name ? `${m.nameZh} · ${m.name}` : m.name)
      );
      item.appendChild(el('span', { class: 'c' }, this.i18n.getLang() === 'zh' ? (m.countryZh || m.country) : m.country));
      item.addEventListener('click', () => {
        this._selectCity(p, m);
      });
      suggest.appendChild(item);
    }
    suggest.style.display = 'block';
  }

  _pickPhoto(p) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      for (const file of input.files) {
        p._photos.push(file);
        p._photoUrls.push(URL.createObjectURL(file));
      }
      this._renderSections();
    };
    input.click();
  }

  _toRow(p, role) {
    return {
      id: p.id || uuid(),
      name: p.name.trim(),
      country: p.country || '',
      city: p.name.trim(),
      lat: p.lat === '' ? null : parseFloat(p.lat),
      lng: p.lng === '' ? null : parseFloat(p.lng),
      arriveAt: p.arriveAt ? `${p.arriveAt}T00:00` : null,
      departAt: null,
      note: p.note || '',
      photoIds: p.photoIds || [],
      role,
    };
  }

  // Save always takes a fresh snapshot from the rendered cards. This keeps DOM edits,
  // quick-city selections, and the in-memory drafts on the same path.
  _snapshotPlaces() {
    const rows = [];
    for (const card of this.scroll.querySelectorAll('.place-card')) {
      const role = card.dataset.role;
      const draft = role === 'start' ? this._start : role === 'destination' ? this._destination : null;
      if (!draft) continue;
      const nameInput = card.querySelector('.city-search input');
      const dateInput = card.querySelector('input[type="date"]');
      const numbers = card.querySelectorAll('input[type="number"]');
      const name = nameInput?.value.trim() || '';
      const hit = lookupCity(name);
      draft.name = name;
      draft.arriveAt = dateInput?.value || '';
      draft.lat = numbers[0]?.value || '';
      draft.lng = numbers[1]?.value || '';
      if (hit) {
        draft.country = hit.country;
        // A changed city must replace the previous chip coordinates.
        draft.lat = String(hit.lat);
        draft.lng = String(hit.lng);
      }
      rows.push({ draft, role });
    }
    return rows;
  }

  async _save() {
    const repo = this.app.repo;
    const snapshots = this._snapshotPlaces();
    this._syncDestinationTitle();
    const name = this.nameInput.value.trim();
    const start = snapshots.find((x) => x.role === 'start')?.draft;
    const dest = snapshots.find((x) => x.role === 'destination')?.draft;
    if (!name) {
      this.app.toast(this.t('form.needName'));
      this.nameInput.focus();
      return;
    }
    if (!start?.name || !dest?.name) {
      this.app.toast(this.t('form.needStartDest'));
      return;
    }
    const ordered = snapshots.map((x) => x.draft);
    const drafts = ordered;
    if (drafts.some((p) => !p.name || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng)) || p.lat === '' || p.lng === '')) {
      this.app.toast(this.t('form.needCoordinates'));
      return;
    }
    if (!start.arriveAt || !dest.arriveAt || dest.arriveAt < start.arriveAt) {
      this.app.toast(this.t('form.needDates'));
      return;
    }

    const placeRows = snapshots.map((x) => this._toRow(x.draft, x.role));
    const savedStart = placeRows.find((p) => p.role === 'start');
    const savedDestination = placeRows.find((p) => p.role === 'destination');
    if (!savedStart || !savedDestination) {
      this.app.toast(this.t('form.needStartDest'));
      return;
    }

    console.info('[JourneyForm] save input', { journeyId: this._editingId, title: name, placeRows });

    const journey = {
      id: this._editingId || uuid(),
      title: name,
      subtitle: '',
      startDate: start.arriveAt,
      endDate: dest.arriveAt,
      description: '',
      coverColor: '#e09b57',
    };

    await repo.saveJourney(journey);
    console.info('[JourneyForm] journey write input', journey);

    await repo.savePlaces(journey.id, placeRows);
    const persisted = await repo.debugJourneySave(journey.id);
    console.info('[JourneyForm] persisted comparison', {
      journeyMatches: JSON.stringify({ ...journey, createdAt: persisted.journey?.createdAt, updatedAt: persisted.journey?.updatedAt }) === JSON.stringify(persisted.journey),
      placeRows,
      persistedPlaces: persisted.places,
    });

    // 上传新照片（按顺序映射到已保存的地点）
    const savedPlaces = repo.placesByJourney(journey.id);
    for (let i = 0; i < drafts.length; i++) {
      const saved = savedPlaces[i];
      if (!saved) continue;
      for (const file of drafts[i]._photos) {
        await repo.savePhoto({
          journeyId: journey.id,
          placeId: saved.id,
          blob: file,
          mime: file.type,
        });
      }
    }

    if (!this._editingId) {
      // 新旅程：回地图 → 定位 → 路线重新生长 → 提示
      this.app.pendingNewJourney = journey.id;
      this.app.router.go('map');
    } else {
      this.app.toast(this.t('toast.saved'));
      this.app.router.go('journeys');
    }
  }

  async _delete() {
    if (!this._editingId) return;
    if (!confirm(this.t('form.deleteConfirm'))) return;
    await this.app.repo.deleteJourney(this._editingId);
    this.app.toast(this.t('toast.deleted'));
    this.app.router.go('journeys');
  }
}
