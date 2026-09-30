# Travel Map 路线动画与响应式修复

日期：2026-09-29。依据当前代码检查后修复。

## 原因

- `_buildRoute()` 原先将已保存的 progress 当成剩余 dashoffset 比例：进度 0 重建后会变成完整路线，进度 1 反而隐藏。
- 路线设置了 `non-scaling-stroke`，但 dash 长度和 head 使用本地路径长度；相机缩放时可见描边和路径取点的度量不一致。现在在同一 SVG 坐标系计算 dash 和 head，线宽按当前缩放反向补偿。
- 原先线与底层分别启动 tween，resize 后 tween 继续操作已移除的 path；`resetRoutes()` 还把中间进度抹成零。
- 桌面 CSS 将按钮改为固定 110px 并居中，但选中 pill 仍使用整栏三等分；页面标题、内容、地图覆盖层也各自使用不同边距。实测还发现浏览器继续加载旧 responsive.css，因此给两份更新样式的入口引用加了版本号。

## 当前实现

- 实际动画入口仍是 `MapView.animateRoute()` → `_drawLeg()`。
- `_drawLeg()` 使用一个 tween 和一个 progress。平滑曲线为 `t*t*(3-2*t)`。
- `_paintLeg()` 设置实际 SVG 长度的 dash：可视长度 `length*progress`，偏移 `length*(1-progress)`。没有短 dash 或滚动 dash。
- `_positionHead()` 从同一 path 的 `getPointAtLength(length*progress)` 得到头部位置，并使用实时相机比例。
- 未开始段的主线与底层均 visibility hidden；完成段移除 dash，成为连续实线。
- 每帧保存进度；重投影复用动画所持的 leg 对象，替换几何后按相同进度恢复。reset 保留完成、当前、未来三种状态。
- 到达地点时立即创建 `_waitForSegmentContinue()` 等待；`_bindClick()` 中空白地图点击调用 `continueSegment()`。反子午线片段不会被误当作新地点。
- 根据用户最后的反馈，速度小幅提高约 10%：`duration = min(5400, 2500 + distanceKm)` 毫秒；北京→广州浏览器实测由约 4.88 秒改为 4.40 秒。
- MapPage 只将 resize 监听提前到进入动画之前，确保等待点击期间也能响应窗口变化。

## 布局

桌面使用 `--content-max`、`--content-gutter`、`--content-inset` 同一宽度体系，应用到主页面标题、滚动内容、地图标题与覆盖层和 Bottom Bar。地图底图保留全屏铺满，玻璃胶囊样式保留。导航按钮恢复等宽三列，与 pill 对齐。手机沿用原断点样式。

实测边界：

| 视口宽度 | Bottom Bar | 标题/内容边界 | 结果 |
| --- | --- | --- | --- |
| 390 | 14–376 | 保持手机原样式 | 无横向溢出 |
| 768 | 14–754 | 保持原断点样式 | 无横向溢出 |
| 1024 | 24–1000 | 24–1000 | 对齐 |
| 1440 | 160–1280 | 160–1280 | 对齐 |
| 1920 | 400–1520 | 400–1520 | 对齐 |

## 验证方式与结果

通过连接的真实浏览器打开 `tools/route-regression.html`，直接导入生产 MapView、D3、本地 GeoJSON、真实 SVG 和 requestAnimationFrame；使用内存中的北京/上海/广州测试地点，没有创建或修改 IndexedDB 旅程。测试页面记录每帧主线、底层、head 的实际 DOM 几何与可见性，并抓取 25%、50%、75% 画面。

- 北京→广州：PASS，实测 4400ms，无未来线、无重复短 dash，head 误差低于 0.001px。
- 北京→上海→广州：第一段完成后保持 `[1,0]` 等待；真实点击空白地图后才开始第二段；第一段保留。
- 绘制中两次改变舞台尺寸并重投影、重建路线 DOM、reset：PASS，进度没有回退，没有未来路线泄露。
- 正式应用页面验证 390×844、768×1024、1024×768、1440×900、1920×1080，横向宽度均未超出视口。
- CSS：浏览器 CSSOM 正常解析，实测边界断言通过。
- 修改的 JavaScript 语法检查通过，`tools/smoke.cjs` 输出 SMOKE PASS。
- 浏览器测试未捕获新的 error/warn。

原始结果见 `route-direct-report.json`、`route-resize-report.json`、`layout-report.json`、`route-scope-report.json`；截图见 `route-paused.png` 和 `route-regression-complete.png`。

## 文件范围

生产文件修改：

1. `js/map/mapView.js`：进度、分段绘制、head、重绘、时长。
2. `js/views/mapPage.js`：仅提前 resize 监听注册。
3. `css/responsive.css`：统一宽屏布局。
4. `css/components.css`：移除独立的旧宽屏宽度规则。
5. `index.html`：仅给上述两份 CSS 引用添加版本号。

新增 `tools/route-regression.html/js` 和验证记录。

哈希比较确认其余 32 份原有 JS/CSS 文件未变，包括表单、repo、IndexedDB、Router、城市解析等；没有修改 `_snapshotPlaces()`、`saveJourney()`、`savePlaces()`、pendingNewJourney、日期或地点/旅程数据结构。
