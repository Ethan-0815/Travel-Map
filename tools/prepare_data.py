"""Travel Map — 数据预处理脚本
一次性：把原始下载数据整理为运行时所需的精简文件。

输入（assets/data 原始文件）：
  - ne_110m_countries.json     Natural Earth 110m 世界国界
  - ne_110m_land.json          Natural Earth 110m 陆地
  - china_100000_full.json     DataV GeoAtlas 中国（含 34 省级 + 九段线 100000_JD）

输出（运行时文件）：
  - world-countries.json       去掉 China(CN/CHN) 与 Taiwan(CN-TW/TWN) 的世界国界
  - world-land.json            陆地
  - china-provinces.json       34 个省级（台湾省/香港/澳门为中国省份）
  - china-nine-dash.json       九段线（100000_JD）
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'assets', 'data')
DATA = os.path.normpath(DATA)


def load(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


def save(name, obj):
    with open(os.path.join(DATA, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def reverse_rings(feature):
    """反转 GeoJSON feature 所有环的方向。
    DataV 数据外环为逆时针，而 d3-geo 球面多边形约定外环为顺时针
    （与 Natural Earth 一致），方向相反会导致 d3 把多边形渲染成
    「全球减去该多边形」。"""
    g = feature['geometry']
    if g is None:
        return feature

    def rev_ring(ring):
        # 保留首尾闭合点结构：反转后重新闭合
        pts = ring[:-1] if ring[0] == ring[-1] else ring[:]
        pts.reverse()
        pts.append(pts[0])
        return pts

    if g['type'] == 'Polygon':
        g['coordinates'] = [rev_ring(r) for r in g['coordinates']]
    elif g['type'] == 'MultiPolygon':
        g['coordinates'] = [[rev_ring(r) for r in poly] for poly in g['coordinates']]
    return feature


def main():
    # 1) 世界国界：剔除 China 与 Taiwan（用 DataV 合规中国覆盖）
    countries = load('ne_110m_countries.json')
    def is_china_tw(f):
        p = f['properties']
        return p.get('ADM0_A3') in ('CHN', 'TWN') or p.get('ISO_A2') in ('CN', 'CN-TW')
    kept = [f for f in countries['features'] if not is_china_tw(f)]
    countries['features'] = kept
    save('world-countries.json', countries)
    print('world-countries.json features:', len(kept))

    # 2) 陆地
    land = load('ne_110m_land.json')
    save('world-land.json', land)
    print('world-land.json features:', len(land['features']))

    # 3) 中国拆分（并统一环方向为 d3 约定）
    china = load('china_100000_full.json')
    provinces = []
    nine_dash = None
    for f in china['features']:
        ad = f['properties'].get('adcode')
        if ad == '100000_JD':
            nine_dash = f
        else:
            provinces.append(reverse_rings(f))
    if nine_dash is not None:
        nine_dash = reverse_rings(nine_dash)
    save('china-provinces.json', {
        'type': 'FeatureCollection',
        'features': provinces,
    })
    print('china-provinces.json features:', len(provinces))

    if nine_dash is not None:
        save('china-nine-dash.json', {
            'type': 'FeatureCollection',
            'features': [nine_dash],
        })
        print('china-nine-dash.json: ok')
    else:
        print('WARNING: 100000_JD (九段线) not found')


if __name__ == '__main__':
    main()
