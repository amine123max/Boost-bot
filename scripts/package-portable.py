"""Build the Windows desktop EXE with its Bot runtime embedded in the executable."""

import argparse
import hashlib
import json
import os
import platform
import shutil
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
    if platform.system() != "Windows":
        raise RuntimeError("The single-file portable EXE is a Windows build")
    if args.target and args.target != "x86_64-pc-windows-msvc":
        raise ValueError("The portable EXE targets Windows x64")
    version = json.loads((ROOT / "backend/desktop/tauri.conf.json").read_text(encoding="utf-8"))["version"]
    output = args.output.resolve()
    bot = ROOT / "bot"
    for required in (bot / "bin/node.exe", *(bot / name for name in RUNTIME_PARTS)):
        if not required.exists():
            raise FileNotFoundError(f"Prepare the Bot runtime first: {required}")
    temporary_root = (ROOT / "tmp").resolve()
    scratch = temporary_root / f"boost-portable-{os.getpid()}"
    scratch.mkdir(parents=True)
    try:
        archive = scratch / "bot-runtime.zip"
        with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=6, allowZip64=True) as package:
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
                    package.write(file, relative.as_posix())
            required = {"bin/node.exe", "dist/src/boost-host.js", "package.json"}
            if not required.issubset(package.namelist()):
                raise RuntimeError("Embedded archive is missing required runtime files")
        digest = hashlib.sha256()
        with archive.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        env = {
            **os.environ, "TEMP": str(scratch), "TMP": str(scratch), "TMPDIR": str(scratch),
            "BOOST_EMBEDDED_BOT_ARCHIVE": str(archive), "BOOST_EMBEDDED_BOT_DIGEST": digest.hexdigest(),
        }
        command = ["cargo", "build", "--release", "--features", "portable-runtime", "--bin", "Boost", "--locked"]
        if args.target:
            command.extend(["--target", args.target])
        subprocess.run(command, cwd=ROOT / "backend/desktop", env=env, check=True)
        release = ROOT / "backend/desktop/target"
        if args.target:
            release /= args.target
        executable = release / "release/Boost.exe"
        output.mkdir(parents=True, exist_ok=True)
        destination = output / f"Boost_{version}_x64.exe"
        shutil.copyfile(executable, destination)
        print(f"Portable desktop EXE: {destination} ({destination.stat().st_size:,} bytes)")
    finally:
        actual = scratch.resolve()
        if actual.parent != temporary_root or actual.name != f"boost-portable-{os.getpid()}":
            raise RuntimeError("Invalid portable build cleanup directory")
        shutil.rmtree(actual)


if __name__ == "__main__":
    main()
