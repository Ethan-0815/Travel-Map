// config.js — 全局常量与配置
export const motion = {
  fast: 180,
  normal: 280,
  slow: 500,
  map: 800,
};

// 统一 easing 数值（与 CSS var(--ease-out) 一致：cubic-bezier(0.22,1,0.36,1)）
export const EASE_OUT_POINTS = [0.22, 1, 0.36, 1];

export const APP_NAME = 'Travel Map';

// 投影配置
export const PROJECTION = {
  type: 'naturalEarth1', // d3.geoNaturalEarth1
  padding: 8, // 全球 fit 边距（px）
  center: [0, 0],
  minZoom: 1,
  maxZoom: 24,
};

// 城市节点视觉
export const NODE = {
  coreR: 4, // 核心半径
  haloR: 9, // 光环半径
  activeR: 6,
  glowOpacity: 0.45,
};

// 路线视觉
export const ROUTE = {
  strokeWidth: 1.6,
  opacity: 0.55,
  glowWidth: 5,
  glowOpacity: 0.22,
  samples: 129, // 大圆航线采样点
};

// 存储
export const DB_NAME = 'travel-map';
export const DB_VERSION = 1;
export const STORES = ['settings', 'journeys', 'places', 'photos', 'blobs'];

// 主题
export const THEMES = ['light', 'dark'];
export const LANGS = ['zh', 'en'];
