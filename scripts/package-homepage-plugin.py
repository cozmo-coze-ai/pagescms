"""Build only the reviewed homepage plugin files, with no credentials or MCP process."""
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
plugin = root / "plugins" / "gpt-96a7a163626e05f4185de181791ba82a"
manifest = json.loads((plugin / "plugin.json").read_text(encoding="utf-8"))
extension = manifest["extensions"]["com.openai"]
assert manifest["name"] == plugin.name
assert manifest["version"] == "0.3.0"
assert extension["apps"] == "./.app.json"
app = json.loads((plugin / ".app.json").read_text(encoding="utf-8"))
assert app == {"apps": {"coze-homepage": {"id": "asdk_app_6abb1da4205c81919a0468aee3675954"}}}
assert extension["interface"]["defaultPrompt"] == [
    "Make the homepage hero more compact on mobile.",
    "Change this homepage copy in all four languages.",
    "Replace a supported homepage photo with my attachment.",
]
assert not (plugin / "mcp.json").exists()
assert not (plugin / ".mcp.json").exists()

overlay = {key: manifest[key] for key in ("name", "version", "description", "author")}
overlay.update({"skills": "./skills/", "apps": extension["apps"], "interface": extension["interface"]})
(plugin / ".codex-plugin").mkdir(exist_ok=True)
(plugin / ".codex-plugin" / "plugin.json").write_text(json.dumps(overlay, indent=2) + "\n", encoding="utf-8")
if "--prepare" in sys.argv:
    print("Compatibility manifest prepared; no archive written.")
    raise SystemExit(0)

files = ["plugin.json", ".codex-plugin/plugin.json", ".app.json", "skills/homepage-editor/SKILL.md", "assets/coze-icon.png", "README.md"]
for name in files:
    source = plugin / name
    assert source.is_file() and not source.is_symlink()
    assert source.resolve().is_relative_to(plugin.resolve())

target = root / ".codex" / "coze-homepage-editor-team-0.3.0.zip"
target.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(plugin / name, name)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(files)
    assert json.loads(archive.read(".app.json")) == app
    for name in files:
        assert archive.read(name) == (plugin / name).read_bytes()
print(f"Verified six-file plugin archive: {target}")
