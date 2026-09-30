"""生成 PWA 图标（纯 Python，无依赖）
设计：琥珀色圆角方块 + 白色圆环 + 白色中心点 + 一条白色旅程弧线
"""
import zlib
import struct
import math

ACCENT = (224, 155, 87)
WHITE = (255, 255, 255)


def sd_round_rect(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ax = max(qx, 0.0)
    ay = max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r


def dist_seg(px, py, ax, ay, bx, by):
    abx, aby = bx - ax, by - ay
    t = 0.0 if abx == 0 and aby == 0 else max(0.0, min(1.0, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)))
    cx, cy = ax + abx * t, ay + aby * t
    return math.hypot(px - cx, py - cy)


def render(size):
    ss = 3
    S = size * ss
    ring_r = size * 0.30
    ring_w = size * 0.035
    dot_r = size * 0.085
    route_w = size * 0.045
    cx = cy = size / 2.0
    corner = size * 0.22
    # 旅程弧线（二次贝塞尔采样）
    pts = []
    for i in range(41):
        t = i / 40.0
        u = 1 - t
        x = u * u * 0.20 + 2 * u * t * 0.50 + t * t * 0.80
        y = u * u * 0.78 + 2 * u * t * 0.14 + t * t * 0.78
        pts.append((x * size, y * size))

    rows = []
    for fy in range(size):
        row = bytearray()
        for fx in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = fx + (sx + 0.5) / ss
                    py = fy + (sy + 0.5) / ss
                    inside_bg = sd_round_rect(px, py, cx, cy, size / 2.0, size / 2.0, corner) < 0
                    if not inside_bg:
                        continue
                    # 背景
                    cr, cg, cb = ACCENT
                    # 圆环
                    if abs(math.hypot(px - cx, py - cy) - ring_r) < ring_w:
                        cr, cg, cb = WHITE
                    # 中心点
                    elif math.hypot(px - cx, py - cy) < dot_r:
                        cr, cg, cb = WHITE
                    # 弧线
                    else:
                        for i in range(len(pts) - 1):
                            if dist_seg(px, py, *pts[i], *pts[i + 1]) < route_w:
                                cr, cg, cb = WHITE
                                break
                    r += cr
                    g += cg
                    b += cb
                    a += 255
            n = ss * ss
            row += bytes((r // n, g // n, b // n, a // n))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr)
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


if __name__ == '__main__':
    import os
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(base, exist_ok=True)
    for s in (192, 512):
        write_png(os.path.join(base, f'icon-{s}.png'), s, render(s))
        print('wrote', f'icon-{s}.png')
