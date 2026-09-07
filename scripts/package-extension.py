"""Package the built extension for Edge Add-ons without the development key."""
import hashlib
import argparse
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "dist-extension"
manifest_path = BUILD / "manifest.json"
manifest = json.loads(manifest_path.read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--sideload", action="store_true", help="Keep the fixed developer key for manual installation.")
args = parser.parse_args()
if not args.sideload:
    manifest.pop("key", None)
version = manifest["version"]
variant = "sideload" if args.sideload else "store"
output = ROOT / "artifacts" / f"relaydrop-extension-{version}-{variant}.zip"
output.parent.mkdir(exist_ok=True)
files = sorted(path for path in BUILD.rglob("*") if path.is_file())
if not all((BUILD / name).is_file() for name in ["THIRD_PARTY_NOTICES.txt", "LICENSE.txt"]):
    raise SystemExit("Generate third-party notices and rebuild before packaging.")
for path in files:
    if path.suffix == ".map" or path.name.startswith(".env"):
        raise SystemExit("Development-only file found in extension build.")
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        relative = str(path.relative_to(BUILD))
        if relative == "manifest.json":
            archive.writestr(relative, json.dumps(manifest, indent=2) + "\n")
        else:
            archive.write(path, relative)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert ("key" in json.loads(archive.read("manifest.json"))) == args.sideload
    for path in files:
        relative = str(path.relative_to(BUILD))
        if relative != "manifest.json":
            assert archive.read(relative) == path.read_bytes(), relative
print(json.dumps({
    "package": output.name,
    "version": version,
    "files": len(files),
    "development_key_removed": not args.sideload,
    "sha256": hashlib.sha256(output.read_bytes()).hexdigest()
}, indent=2))
