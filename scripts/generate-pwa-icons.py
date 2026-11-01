"""Render the code-native wallet mark to opaque PNG icons, using only Python stdlib."""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent / 'public' / 'icons'


def rounded(x, y, left, top, right, bottom, radius):
    if not (left <= x <= right and top <= y <= bottom):
        return False
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def color(x, y):
    # Every essential stroke fits within the central maskable safe area.
    result = (24, 135, 119)
    if rounded(x, y, 126, 142, 370, 354, 34):
        result = (191, 237, 221)
    if rounded(x, y, 126, 174, 386, 370, 34):
        result = (255, 255, 255)
    if rounded(x, y, 302, 232, 398, 310, 22):
        result = (19, 86, 77)
    if (x - 337) ** 2 + (y - 271) ** 2 <= 10 ** 2:
        result = (191, 237, 221)
    return result


def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)


def render(size):
    pixels = bytearray()
    samples = 3
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            colors = [color((x + (sx + .5) / samples) * 512 / size,
                            (y + (sy + .5) / samples) * 512 / size)
                      for sy in range(samples) for sx in range(samples)]
            pixels.extend(sum(c[channel] for c in colors) // len(colors) for channel in range(3))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(pixels, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    for size in [180, 192, 512]:
        data = render(size)
        name = 'apple-touch-icon.png' if size == 180 else f'icon-{size}.png'
        (ROOT / name).write_bytes(data)
        if size == 512:
            (ROOT / 'maskable-512.png').write_bytes(data)
