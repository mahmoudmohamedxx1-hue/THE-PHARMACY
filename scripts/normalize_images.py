#!/usr/bin/env python3
"""Normalize oversized/heavy product images: max 1000px, webp q84.
Updates DB paths when extension changes. Skips files already fine."""
import os
import sqlite3
import glob
from PIL import Image

BASE = '/home/z/my-project'
IMG_DIR = f'{BASE}/public/images/products'
DB = f'{BASE}/db/custom.db'
MAX_PX = 1000
MAX_BYTES = 350 * 1024

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
rows = {r['imageUrl']: dict(r) for r in con.execute('SELECT id, slug, imageUrl FROM Product WHERE imageUrl != ""')}

changed, shrunk, errors = 0, 0, 0
total_before = total_after = 0
for fp in glob.glob(f'{IMG_DIR}/*'):
    rel = '/images/products/' + os.path.basename(fp)
    size = os.path.getsize(fp)
    total_before += size
    try:
        im = Image.open(fp)
        w, h = im.size
        needs = (max(w, h) > MAX_PX) or (size > MAX_BYTES)
        if not needs:
            total_after += size
            continue
        im = im.convert('RGBA') if im.mode in ('P', 'LA', 'RGBA') else im.convert('RGB')
        if im.mode == 'RGBA':
            bg = Image.new('RGB', im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[3])
            im = bg
        if max(im.size) > MAX_PX:
            im.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)
        out = fp.rsplit('.', 1)[0] + '.webp'
        im.save(out, 'WEBP', quality=84, method=4)
        new_size = os.path.getsize(out)
        if new_size >= size and fp != out:
            # no gain; keep original
            os.remove(out)
            total_after += size
            continue
        if fp != out:
            os.remove(fp)
        total_after += new_size
        shrunk += 1
        new_rel = '/images/products/' + os.path.basename(out)
        if rel in rows and new_rel != rel:
            con.execute('UPDATE Product SET imageUrl=? WHERE id=?', (new_rel, rows[rel]['id']))
            changed += 1
    except Exception as e:
        errors += 1
        print('ERR', os.path.basename(fp), str(e)[:60])

con.commit()
con.close()
print(f'processed: shrunk={shrunk} db_paths_changed={changed} errors={errors}')
print(f'total size: {total_before/1e6:.1f}MB -> {total_after/1e6:.1f}MB')
