"""
Image pipeline: take an image of a can on a (mostly) white or transparent background,
detect the can, center on a 420x420 white square, save as WebP.

For LaCroix-style transparent PNGs: uses alpha channel.
For Google-Images-style white-bg JPEGs: uses near-white pixel detection.
"""
import os
from pathlib import Path
from PIL import Image, ImageOps


def detect_content_bbox(img: Image.Image, white_thresh: int = 240) -> tuple[int, int, int, int] | None:
    """Find the non-white content bounding box."""
    if img.mode == 'RGBA':
        # Use alpha channel
        bbox = img.getbbox()
        return bbox
    rgb = img.convert('RGB')
    # convert to grayscale, threshold non-white pixels
    gray = rgb.convert('L')
    # invert + threshold so non-white becomes white
    mask = gray.point(lambda p: 0 if p > white_thresh else 255)
    return mask.getbbox()


def to_white_square(img: Image.Image, size: int = 420) -> Image.Image:
    """Center img on a white square."""
    margin = 16
    target = size - 2 * margin
    work = img.copy()
    work.thumbnail((target, target), Image.LANCZOS)
    canvas = Image.new('RGB', (size, size), (255, 255, 255))
    x = (size - work.width) // 2
    y = (size - work.height) // 2
    if work.mode == 'RGBA':
        canvas.paste(work, (x, y), work)
    else:
        canvas.paste(work, (x, y))
    return canvas


def process_to_webp(src_path, dst_path, *, size: int = 420, quality: int = 80,
                    skip_bg_removal: bool = True) -> int:
    src = Image.open(src_path)
    # convert AVIF/WEBP/JPEG to a working mode
    if src.mode == 'P':
        src = src.convert('RGBA')

    # crop to content
    bbox = detect_content_bbox(src)
    if bbox:
        # add small padding
        l, t, r, b = bbox
        w, h = src.size
        pad = 4
        l = max(0, l - pad); t = max(0, t - pad)
        r = min(w, r + pad); b = min(h, b + pad)
        src = src.crop((l, t, r, b))

    out = to_white_square(src, size=size)
    Path(dst_path).parent.mkdir(parents=True, exist_ok=True)
    out.save(dst_path, 'WEBP', quality=quality, method=6)
    return os.path.getsize(dst_path)


if __name__ == '__main__':
    import sys
    src, dst = sys.argv[1], sys.argv[2]
    n = process_to_webp(src, dst)
    print('wrote', dst, '({:.1f} KB)'.format(n / 1024))
