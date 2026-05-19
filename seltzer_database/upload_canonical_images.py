"""
upload_canonical_images.py — upload every .webp in images/ to Supabase
storage at review-images/canonical/<filename>.

WHY THIS EXISTS
---------------
The "Create review" autofill shows a broken-image (?) icon for every
canonical drink because the database has image_urls that point at
review-images/canonical/<file>.webp but no files were ever uploaded
to that folder. This script does the upload step that step 2 of
seltzer_database/README.md describes. After running it, every URL the
app already has will start resolving.

WHAT YOU NEED
-------------
Your Supabase service-role key (NOT the anon key). Get it from:
    Supabase dashboard -> Project settings -> API -> "service_role" secret
The service role bypasses RLS so this script can write to storage even
if your bucket policies only allow authenticated writes.

USAGE
-----
    cd seltzer_database
    export SUPABASE_URL="https://alprjysmwyezejucotqq.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="ey..."   # paste your key
    python3 upload_canonical_images.py

On Windows PowerShell:
    cd seltzer_database
    $env:SUPABASE_URL = "https://alprjysmwyezejucotqq.supabase.co"
    $env:SUPABASE_SERVICE_ROLE_KEY = "ey..."
    python upload_canonical_images.py

Re-running is safe — the script uses x-upsert so existing files are
overwritten rather than erroring out.
"""
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BUCKET = 'review-images'
FOLDER = 'canonical'  # files land at review-images/canonical/<filename>


def upload_one(supabase_url: str, key: str, file_path: Path) -> tuple[bool, str]:
    """Upload a single file. Returns (ok, message)."""
    object_path = f'{FOLDER}/{file_path.name}'
    endpoint = f'{supabase_url.rstrip("/")}/storage/v1/object/{BUCKET}/{object_path}'

    body = file_path.read_bytes()
    req = urllib.request.Request(
        endpoint,
        data=body,
        method='POST',
        headers={
            'Authorization': f'Bearer {key}',
            'Content-Type': 'image/webp',
            # Upsert lets us re-run safely if some files were already uploaded.
            'x-upsert': 'true',
            # Long-cache canonical images.
            'cache-control': 'public, max-age=31536000, immutable',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
            return True, f'{resp.status} OK'
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode('utf-8', errors='replace')
        except Exception:
            err_body = ''
        return False, f'HTTP {e.code}: {err_body[:200]}'
    except Exception as e:
        return False, f'{type(e).__name__}: {e}'


def looks_like_jwt(value: str) -> bool:
    """Quick sanity check: a Supabase service_role key is a JWT —
    three dot-separated base64url segments, the first decoding to JSON
    starting with '{' (header). Catches paste truncation issues
    before we make 184 doomed HTTP requests."""
    parts = value.split('.')
    if len(parts) != 3:
        return False
    if not value.startswith('eyJ'):  # base64url('{...')
        return False
    if len(value) < 100:  # service_role JWTs are ~200+ chars
        return False
    return True


def main() -> int:
    # 1) Supabase URL — fall back to a sane default for this project.
    supabase_url = os.environ.get('SUPABASE_URL') or 'https://alprjysmwyezejucotqq.supabase.co'

    # 2) Service-role key. Try env var first; if missing or looks
    #    truncated, prompt with a hidden input so the user can paste
    #    cleanly without PowerShell quoting / line-wrap mangling it.
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip().strip('"').strip("'")
    if not key or not looks_like_jwt(key):
        if key:
            print(f'WARN: SUPABASE_SERVICE_ROLE_KEY env var is set but doesn\'t look like a valid JWT')
            print(f'      (length={len(key)}, starts with {key[:8]!r}). Most likely the paste was truncated.')
            print(f'      Falling back to a hidden prompt — paste the key again below.')
        else:
            print('No SUPABASE_SERVICE_ROLE_KEY env var found.')
        try:
            key = getpass.getpass('Paste your Supabase service_role key (input hidden): ').strip()
        except (KeyboardInterrupt, EOFError):
            print('\nAborted.')
            return 2
        if not looks_like_jwt(key):
            print()
            print(f'ERROR: that still doesn\'t look like a valid JWT (length={len(key)}, starts with {key[:8]!r}).')
            print('       A service_role key is ~220 chars, contains exactly two dots, and starts with "eyJ".')
            print('       Make sure you copied the *service_role* secret from Supabase -> Settings -> API,')
            print('       not the anon key, and that nothing got cut off when you pasted.')
            return 2

    here = Path(__file__).parent
    img_dir = here / 'images'
    files = sorted(img_dir.glob('*.webp'))
    if not files:
        print(f'ERROR: no .webp files found in {img_dir}')
        return 2

    print(f'Uploading {len(files)} files to {supabase_url}/storage/v1/.../{BUCKET}/{FOLDER}/')
    n_ok = 0
    n_fail = 0
    failures: list[tuple[str, str]] = []
    for i, f in enumerate(files, 1):
        ok, msg = upload_one(supabase_url, key, f)
        status = 'OK ' if ok else 'FAIL'
        print(f'  [{i:3}/{len(files)}] {status} {f.name}  {"" if ok else "-> " + msg}')
        if ok:
            n_ok += 1
        else:
            n_fail += 1
            failures.append((f.name, msg))
            # Fail fast on the first auth failure — there's no point
            # making 183 more requests with the same bad key.
            if i == 1 and ('401' in msg or '403' in msg or 'JWS' in msg):
                print()
                print('First upload failed with an auth error — aborting before making 183 more.')
                print('Most common causes:')
                print('  - The key isn\'t the *service_role* secret (the anon key won\'t bypass RLS).')
                print('  - The key got truncated when pasted into the terminal.')
                print('  - The bucket name is different — check Supabase -> Storage that "review-images" exists.')
                return 1

    print()
    print(f'Done. {n_ok} uploaded, {n_fail} failed.')
    if failures:
        print()
        print('Failures (first 5):')
        for name, msg in failures[:5]:
            print(f'  {name}: {msg}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
