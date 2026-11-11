"""Package a prepared desktop release with its complete embedded Bot runtime."""

import argparse
import json
import platform
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent.parent
RUNTIME_PARTS = (
    "dist", "ui", "bots", "assets", "bin", "node_modules", "dsh-runtime",
    "package.json", "LICENSE", "LICENSES", "THIRD_PARTY_NOTICES.md",
    "THIRD_PARTY_NOTICES_en.md",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="")
    parser.add_argument("--output", type=Path, default=ROOT / "output")
    args = parser.parse_args()
    version = json.loads((ROOT / "backend/desktop/tauri.conf.json").read_text(encoding="utf-8"))["version"]
    release = ROOT / "backend/desktop/target"
    if args.target:
        if "/" in args.target or "\\" in args.target or args.target in (".", ".."):
            raise ValueError("Expected a Rust target triple")
        release /= args.target
    release /= "release"
    args.output.mkdir(parents=True, exist_ok=True)

    if platform.system() == "Darwin":
        app = release / "bundle/macos/Boost.app"
        if not (app / "Contents/MacOS/Boost").is_file():
            raise FileNotFoundError(f"Desktop app is missing: {app}")
        archive = args.output / f"Boost-{version}-macos-portable.zip"
        subprocess.run(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(app), str(archive)], check=True)
    elif platform.system() == "Windows":
        executable = release / "Boost.exe"
        bot = ROOT / "bot"
        for required in (executable, bot / "bin/node.exe", *(bot / name for name in RUNTIME_PARTS)):
            if not required.exists():
                raise FileNotFoundError(f"Prepare the release runtime first: {required}")
        archive = args.output / f"Boost-{version}-windows-portable.zip"
        with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=6, allowZip64=True) as package:
            package.write(executable, "Boost-portable.exe")
            for name in RUNTIME_PARTS:
                source = bot / name
                files = sorted(source.rglob("*")) if source.is_dir() else [source]
                for file in files:
                    if not file.is_file():
                        continue
                    relative = file.relative_to(bot)
                    if file.suffix.lower() in (".pdb", ".ilk", ".map", ".pyc") or any(
                        part in ("__pycache__", ".cache", ".pytest_cache") for part in relative.parts
                    ):
                        continue
                    package.write(file, "boost-bot/" + relative.as_posix())
            required = {"Boost-portable.exe", "boost-bot/bin/node.exe", "boost-bot/dist/src/boost-host.js", "boost-bot/package.json"}
            if not required.issubset(package.namelist()):
                raise RuntimeError("Portable archive is missing required runtime files")
    else:
        raise RuntimeError("Portable archives are provided for Windows and Apple Silicon macOS")
    print(f"Portable release: {archive} ({archive.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
