"""Build the encrypted read-only GitHub Pages site for 制作グループ 進行表.

usage: SITE_KEYS='{"master":"...","risa":"...","shoyo":"...","miyamon":"..."}' \
       python3 build_site.py <master_projects_dir> <repo_dir>

<master_projects_dir> holds p*.json exported from the master artifact.
Each page's data is AES-GCM encrypted; the key lives only in the shared URL's #fragment,
so the public repo holds ciphertext only. Keys are never written into the repo.
"""
import json, sys, os, glob, datetime, base64, secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PAGES = {  # folder -> (title, owner filter; None = every project)
    "master": ("制作グループ 進行表", None),
    "risa": ("リサの進行表", "リサ"),
    "shoyo": ("しょーよーの進行表", "しょーよー"),
    "miyamon": ("みやもんの進行表", "みやもん"),
}
b64u = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
def unb64u(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

src, out = sys.argv[1], sys.argv[2]
keys = json.loads(os.environ["SITE_KEYS"])
here = os.path.dirname(os.path.abspath(__file__))
viewer = open(os.path.join(here, "viewer.html"), encoding="utf8").read()

projects = []
for f in sorted(glob.glob(os.path.join(src, "*.json"))):
    d = json.load(open(f, encoding="utf8")); d = d.get("data", d)
    d.pop("chat", None)  # personal Claude chat links never go out
    d["tasks"] = [t for t in d.get("tasks", []) if not t.get("del")]
    projects.append(d)
now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat()

for folder, (title, owner) in PAGES.items():
    os.makedirs(os.path.join(out, folder), exist_ok=True)
    ps = [p for p in projects if owner is None or p.get("owner") == owner]
    pt = json.dumps({"updated": now, "projects": ps}, ensure_ascii=False).encode()
    iv = secrets.token_bytes(12)
    ct = AESGCM(unb64u(keys[folder])).encrypt(iv, pt, None)
    json.dump({"iv": b64u(iv), "ct": b64u(ct)}, open(os.path.join(out, folder, "data.enc"), "w"))
    open(os.path.join(out, folder, "index.html"), "w", encoding="utf8").write(viewer.replace("__TITLE__", title))
    stale = os.path.join(out, folder, "data.json")
    if os.path.exists(stale): os.remove(stale)

open(os.path.join(out, "index.html"), "w", encoding="utf8").write('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>404</title><p>Not found</p>')
open(os.path.join(out, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")
open(os.path.join(out, ".nojekyll"), "w").write("")
os.makedirs(os.path.join(out, "_tools"), exist_ok=True)
for f in ("build_site.py", "viewer.html"):
    open(os.path.join(out, "_tools", f), "w", encoding="utf8").write(open(os.path.join(here, f), encoding="utf8").read())
print("built", len(projects), "projects at", now)
