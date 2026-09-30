// replay/replayController.js — Journey Replay 状态机
import { sleep, tween, EASE_OUT } from '../core/tween.js';
import { yearOf } from '../utils/date.js';

class ReplayController {
  constructor() {
    this.abort = null;
    this.running = false;
    this._year = null;
  }

  async start({ mapView, journeys, repo, onYear, onDone }) {
    this.stop();
    this.running = true;
    const ac = new AbortController();
    this.abort = ac;
    this._year = null;

    const sorted = [...journeys].sort((a, b) =>
      (a.startDate || '') < (b.startDate || '') ? -1 : 1
    );

    let playbackEpoch;
    try {
      // 保留当前镜头，随后直接 fitTo 当前旅程的全部地点。
      mapView.hideAllRoutes();
      playbackEpoch = mapView._playbackEpoch;
      this._playback = { mapView, epoch: playbackEpoch, ac };
      mapView._growing = true;
      mapView.clearActive();

      for (const j of sorted) {
        if (ac.signal.aborted || playbackEpoch !== mapView._playbackEpoch) return;
        const year = yearOf(j.startDate);
        if (year && onYear) await this._bumpYear(year, onYear, ac);
        if (ac.signal.aborted) return;

        const places = mapView._journeyPlaces(j.id);
        if (!places.length) continue;

        await mapView.fitTo(
          places.map((p) => [p.lng, p.lat]),
          { padding: 110, duration: 700 }
        );
        if (ac.signal.aborted || playbackEpoch !== mapView._playbackEpoch) return;
        mapView.revealNode(mapView._key(places[0]));
        if (places.length < 2 || !mapView.routes.has(j.id)) continue;
        const completed = await mapView.animateRoute(j.id, { dim: false, reveal: true, stepDelay: 70 });
        if (!completed || ac.signal.aborted || playbackEpoch !== mapView._playbackEpoch) return;
        await sleep(120, { signal: ac.signal });
      }

      // 结束：停在完整地图
      const allPlaces = repo.state.places.filter((p) =>
        sorted.some((j) => j.id === p.journeyId)
      );
      if (allPlaces.length) {
        await mapView.fitTo(
          allPlaces.map((p) => [p.lng, p.lat]),
          { padding: 90, duration: 800 }
        );
      }
      if (ac.signal.aborted || playbackEpoch !== mapView._playbackEpoch) return;
      mapView.showAllRoutes();
    } catch (e) {
      if (e && e.name !== 'AbortError') console.error('[replay]', e);
    } finally {
      if (playbackEpoch === mapView._playbackEpoch) {
        mapView._growing = false;
        mapView._updateLabels(mapView.camera.cam.k);
      }
      if (this.abort === ac) {
        this._playback = null;
        this.running = false;
        this.abort = null;
        if (!ac.signal.aborted && onDone) onDone();
      }
    }
  }

  _bumpYear(target, onYear, ac) {
    const from = this._year ?? target;
    this._year = target;
    return tween({
      from: { v: from },
      to: { v: target },
      duration: 460,
      ease: EASE_OUT,
      onUpdate: (o) => {
        if (!ac.signal.aborted && this.abort === ac) onYear(Math.round(o.v));
      },
    }).promise;
  }

  stop() {
    if (this.abort) this.abort.abort();
    const playback = this._playback;
    this._playback = null;
    if (playback && playback.epoch === playback.mapView._playbackEpoch) {
      playback.mapView.cancelRoutePlayback();
      playback.mapView._growing = false;
      playback.mapView._updateLabels(playback.mapView.camera.cam.k);
    }
    this.abort = null;
    this.running = false;
    this._year = null;
  }
}

export const replayController = new ReplayController();
