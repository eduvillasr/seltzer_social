"""
Image pipeline: take a source image (PNG/JPG/AVIF/WEBP), find the can,
center it on a 420x420 white square, save as WebP.

For LaCroix-style transparent PNGs: uses alpha channel.
For Google-Images-style white-bg JPEGs: uses near-white pixel detection.

When --min-fill is passed, the pipeline rejects images where the can
fills less than that fraction of the frame (writes to rejects/ instead).
"""
import os
from pathlib import Path
from PIL import Image, ImageOps


def detect_content_bbox(img, white_thresh=240):
    """Find the non-white content bounding box."""
    if img.mode == 'RGBA':
        bbox = img.getbbox()
        return bbox
    rgb = img.convert('RGB')
    gray = rgb.convert('L')
    mask = gray.point(lambda p: 0 if p > white_thresh else 255)
    return mask.getbbox()


def to_white_square(img, size=420):
    margin = 0
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


def process_to_webp(
    src_path, dst_path,
    *, size=420, quality=80, skip_bg_removal=True,
    min_fill_fraction=0.0,
):
    """
    Returns dict {bytes, fill_fraction, rejected: bool, reason?: str}.
    If min_fill_fraction > 0 and the can content fills less than that of
    the frame, the result is written instead to <dst_path>.rejected.png
    and a rejected: True dict is returned.
    """
    src = Image.open(src_path)
    if src.mode == 'P':
        src = src.convert('RGBA')

    bbox = detect_content_bbox(src)
    if bbox:
        l, t, r, b = bbox
        w, h = src.size
        pad = 1
        l = max(0, l - pad); t = max(0, t - pad)
        r = min(w, r + pad); b = min(h, b + pad)
        src = src.crop((l, t, r, b))

    out = to_white_square(src, size=size)

    # Measure content fill in the final 420x420 frame
    gray = out.convert('L')
    mask = gray.point(lambda p: 0 if p > 240 else 255)
    bbox2 = mask.getbbox()
    if bbox2:
        fill_w = bbox2[2] - bbox2[0]
        fill_h = bbox2[3] - bbox2[1]
        fill_fraction = max(fill_w, fill_h) / size
    else:
        fill_fraction = 0.0

    if min_fill_fraction > 0 and fill_fraction < min_fill_fraction:
        rejects_dir = Path(dst_path).parent / 'rejects'
        rejects_dir.mkdir(parents=True, exist_ok=True)
        reject_path = rejects_dir / (Path(dst_path).stem + '.png')
        out.save(reject_path, 'PNG')
        return {
            'bytes': os.path.getsize(reject_path),
            'fill_fraction': fill_fraction,
            'rejected': True,
            'reason': f'content fills only {fill_fraction*100:.0f}% of frame '
                      f'(need {min_fill_fraction*100:.0f}%)',
            'path': str(reject_path),
        }

    Path(dst_path).parent.mkdir(parents=True, exist_ok=True)
    out.save(dst_path, 'WEBP', quality=quality, method=6)
    return {
        'bytes': os.path.getsize(dst_path),
        'fill_fraction': fill_fraction,
        'rejected': False,
        'path': str(dst_path),
    }


if __name__ == '__main__':
    import sys
    src, dst = sys.argv[1], sys.argv[2]
    min_fill = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
    r = process_to_webp(src, dst, min_fill_fraction=min_fill)
    if r['rejected']:
        print(f'REJECTED: {r["reason"]} → {r["path"]}')
    else:
        print(f'wrote {dst} ({r["bytes"]/1024:.1f} KB, '
              f'fill {r["fill_fraction"]*100:.0f}%)')
