// data/backup.js — JSON 导入导出
import * as repo from './repo.js';
import * as db from './db.js';

/** 导出完整数据为 travel-map-backup.json */
export async function exportBackup() {
  const [settings, journeys, places, photos] = await Promise.all([
    db.getAll('settings'),
    db.getAll('journeys'),
    db.getAll('places'),
    db.getAll('photos'),
  ]);
  // 照片 Blob 转 base64（体积可控）
  const blobs = [];
  for (const p of photos) {
    const rec = await db.get('blobs', p.id);
    if (rec) {
      blobs.push({
        id: p.id,
        dataUrl: await blobToDataUrl(rec.blob),
      });
    }
  }
  const backup = {
    app: 'travel-map',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    journeys,
    places,
    photos,
    blobs,
  };
  return JSON.stringify(backup, null, 2);
}

/** 从备份 JSON 恢复（清空并重写） */
export async function importBackup(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    throw new Error('invalid-json');
  }
  if (!data || data.app !== 'travel-map' || !Array.isArray(data.journeys)) {
    throw new Error('invalid-backup');
  }
  // 清空现有
  await Promise.all([
    db.clear('settings'),
    db.clear('journeys'),
    db.clear('places'),
    db.clear('photos'),
    db.clear('blobs'),
  ]);
  // 写入
  await db.bulkPut('settings', data.settings || []);
  await db.bulkPut('journeys', data.journeys || []);
  await db.bulkPut('places', data.places || []);
  await db.bulkPut('photos', data.photos || []);
  for (const b of data.blobs || []) {
    const blob = await dataUrlToBlob(b.dataUrl);
    if (blob) await db.put('blobs', { id: b.id, blob });
  }
  await repo.loadAll();
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  return new Promise((res) => {
    try {
      fetch(dataUrl)
        .then((r) => r.blob())
        .then(res)
        .catch(() => res(null));
    } catch {
      res(null);
    }
  });
}

export function downloadFile(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default { exportBackup, importBackup, downloadFile };
