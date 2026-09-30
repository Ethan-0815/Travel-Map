# Travel Map

<p align="center">      
  <em>A beautiful, local-first map for remembering where you've been.</em>      
</p>

**Travel Map** 不是旅游攻略，也不是社交旅行 App——它是一张**属于你的、会动的旅行地图**。

打开 → 看到自己的世界 → 点击城市 → 查看旅行记录 → 回忆自己的足迹。

---

## Features

✓ Interactive map — 流畅拖动 / 缩放 / 城市聚焦  
✓ Journey timeline — 极简垂直时间线  
✓ Animated travel routes — 大圆航线逐段绘制  
✓ Journey replay — 播放你的旅行历史（年份平滑推进）  
✓ City details — 到访统计 + 回忆笔记 + 照片  
✓ Stats — 数字 Count-up 动画  
✓ Local-first storage — IndexedDB，无需账号  
✓ Import / Export — `travel-map-backup.json`  
✓ PWA — 可安装、离线可用  
✓ Light / Dark mode  
✓ 中英双语 UI  
✓ Responsive design — 移动端优先

## Privacy

> **Your journeys belong to you.**

所有旅行数据仅保存在**本设备的 IndexedDB** 中。没有账号、没有服务器、没有云同步、没有任何遥测。地图渲染使用的地理数据全部打包在本地，运行时零联网请求。

## Run

因为使用了 ES Modules + IndexedDB + PWA，请通过本地静态服务运行（不要直接双击 index.html）：

**方式一（Windows）**

```cmd
tools\start-server.cmd
```

**方式二（任意平台）**

```bash
python -m http.server 8080
# 或
npx serve .
```

然后访问 `http://localhost:8080`。

## First Use

首次打开为空状态。点击地图页的 **＋ 添加旅程**，按起点、途经点和终点填写第一段旅程；保存后会立即看到路线、城市节点和统计数据。

应用不会自动创建或上传任何旅程。需要测试数据时，可使用 `tools/seedTestData.mjs` 注入标准测试记录。

## Tech Stack

- **渲染**：原生 HTML / CSS / JavaScript（ES Modules，无构建）
- **地图**：D3 v7（geoNaturalEarth1 投影 + 本地 GeoJSON 矢量底图），完全离线
- **存储**：IndexedDB（journeys / places / photos / blobs / settings）
- **动画**：自研轻量 tween 引擎，统一 `cubic-bezier(0.22, 1, 0.36, 1)`
- **PWA**：manifest + Service Worker（stale-while-revalidate）

## Map Data & 合规声明

| 数据        | 来源                                                                                  | 说明                              |
| --------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| 世界陆地 / 国界 | [Natural Earth](https://www.naturalearthdata.com/) 110m（公共领域）                       | 已移除 China / Taiwan 独立要素         |
| 中国国界 / 省界 | [DataV.GeoAtlas](https://geo.datav.aliyun.com/) `100000_full.json`（2021.5 版，学习交流用途） | 台湾省 / 香港 / 澳门均为中国省级单位，含九段线与南海诸岛 |

- 中国部分已按国标绘制：台湾、香港、澳门为中国一部分；南海诸岛与九段线正确标绘。
- 数据环方向已统一为 d3 球面约定（外环顺时针），见 `tools/prepare_data.py`。
- 本项目为个人本地应用：不采集、不上传任何人的位置信息；用户的足迹坐标仅存于本机浏览器。

## Project Structure

```
├── index.html            入口
├── sw.js                 Service Worker
├── vendor/d3/            本地 D3（离线）
├── assets/data/          本地 GeoJSON 底图数据
├── css/                  设计令牌 + 分模块样式
├── js/
│   ├── core/             tween / easing / eventbus（统一动画系统）
│   ├── data/             IndexedDB 封装 / 仓库 / 备份
│   ├── map/              投影 / 图层 / 相机 / 路线 / 节点 / 编排
│   ├── views/            Map / Journeys / Stats / Form / Settings
│   ├── replay/           Replay 状态机
│   ├── i18n/             中英词典
│   └── utils/            dom / date / id / 城市坐标索引
└── tools/                数据预处理 / 一键启动 / 测试脚本
```

## Testing

```bash
node tools/smoke.cjs      # 地图数据 + 投影 + 路线数学（Node，无浏览器）
node tools/verify.mjs     # 无头浏览器运行时验证（需本机 Edge）
node tools/e2e.mjs        # 端到端：详情 / 各视图 / 主题 / Replay
node tools/formtest.mjs   # 表单 + 持久化 + 导出
node tools/mobile.mjs     # 移动端视口截图
```

## License

MIT — 地图数据版权归各自来源所有（Natural Earth：公共领域；DataV：学习交流用途）。
