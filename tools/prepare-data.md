# 地图数据准备说明

运行时数据已打包在 `assets/data/`，本文件记录数据来源与再生成步骤。

## 数据来源

| 文件 | 来源 | 下载地址 |
|---|---|---|
| `world-land.json` | Natural Earth 110m Land（公共领域） | `https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_land.geojson` |
| `world-countries.json` | Natural Earth 110m Admin 0 Countries | `https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson` |
| `china-provinces.json` + `china-nine-dash.json` | DataV.GeoAtlas `100000_full.json`（2021.5 版，学习交流用途） | `https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json` |

## 再生成

1. 把三个原始文件下载到 `assets/data/`（保持上表中的原始文件名）。
2. 运行：

```bash
python tools/prepare_data.py
```

3. 脚本会生成四个运行时文件，之后可删除原始文件。

## 处理内容

- **剔除**：Natural Earth 中的 China（CHN/CN）与 Taiwan（TWN/CN-TW）要素，避免中国边界不符合国标；由 DataV 合规中国数据覆盖。
- **合规**：DataV 数据含 34 个省级单元（台湾省 710000 / 香港 810000 / 澳门 820000）与九段线（`100000_JD`）。
- **环方向修正**：DataV 外环为逆时针，d3-geo 球面多边形约定外环为顺时针（与 Natural Earth 一致）。方向相反会导致 d3 把多边形渲染成「全球减去该多边形」（整个球面被错误填充）。`prepare_data.py` 会统一反转所有环方向。

## 地图数据精度

Natural Earth 110m 为 1:1.1 亿概略比例尺，适合全球视角。若需要放大到省级仍有更精细的边界，可换用 50m 版本并把 `prepare_data.py` 中的文件名相应替换（注意数据体积与渲染性能）。
