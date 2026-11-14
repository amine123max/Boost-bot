"""Build the Windows desktop EXE with its Bot runtime embedded in the executable."""

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parent.parent
RUNTIME_PARTS = (
    "dist", "bots", "assets", "bin", "node_modules", "dsh-runtime",
    "package.json", "LICENSE", "LICENSES", "THIRD_PARTY_NOTICES.md",
    "THIRD_PARTY_NOTICES_en.md",
)


def write_runtime_archive(bot: Path, archive: Path):
    """Use content-stable metadata so rebuilding the same files reuses the cache."""
    digest = hashlib.sha256(b"Boost-runtime-content-v1\0")
    with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=6, allowZip64=True) as package:
        for name in sorted(RUNTIME_PARTS):
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
                info = ZipInfo(relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = (0o100755 if relative.parts[0] == "bin" else 0o100644) << 16
                identity = relative.as_posix().encode("utf-8")
                digest.update(len(identity).to_bytes(4, "big"))
                digest.update(identity)
                digest.update(file.stat().st_size.to_bytes(8, "big"))
                # Stream native binaries and tools instead of holding them in RAM.
                with file.open("rb") as source_stream, package.open(info, "w", force_zip64=True) as target:
                    for block in iter(lambda: source_stream.read(1024 * 1024), b""):
                        target.write(block)
                        digest.update(block)
        required = {"bin/node.exe", "dist/backend/src/boost-host.js", "package.json"}
        if not required.issubset(package.namelist()):
            raise RuntimeError("Embedded archive is missing required runtime files")
    return digest.hexdigest()


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
        digest = write_runtime_archive(bot, archive)
        env = {
            **os.environ, "TEMP": str(scratch), "TMP": str(scratch), "TMPDIR": str(scratch),
            "BOOST_EMBEDDED_BOT_ARCHIVE": str(archive), "BOOST_EMBEDDED_BOT_DIGEST": digest,
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
        if actual.exists():
            shutil.rmtree(actual)


if __name__ == "__main__":
    main()
