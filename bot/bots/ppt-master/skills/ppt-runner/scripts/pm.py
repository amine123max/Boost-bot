#!/usr/bin/env python3
"""PPT Master on AnyModelBot: the runtime, upstream script runner, export check and app/state.json updates.

Standard library only: this has to work before anything is installed. Commands:

  doctor                       Check Python, the attribution guard and the installed packages. Updates state.runtime.
  setup [--extra NAME]...      Install packages into <workspace>/.ppt-env. Extras: pdf, narration, notebook.
  run SCRIPT [ARGS]...         Run skills/ppt-master/scripts/SCRIPT with the installed packages.
  verify FILE.pptx             Check that a file is a real PPTX with editable slides. Prints JSON.
  sync PROJECT [OPTIONS]       Refresh a project's previews and exports from disk and update the job.
  pending FILE.json | --clear  Show or clear the confirmation card.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[2] / "ppt-master"
ENV_DIR_NAME = ".ppt-env"
MIN_PY, MAX_PY = (3, 10), (3, 14)

# Upstream's requirements.txt minus what this bot never uses (Flask for the local pages, cloud image SDKs).
GROUPS = {
    "core": [
        "PyYAML>=6.0", "python-pptx>=0.6.21", "XlsxWriter>=3.0.0", "skia-pathops>=0.9.2", "uharfbuzz>=0.50.0",
        "mammoth>=1.6.0", "markdownify>=0.11.6", "ebooklib>=0.18", "openpyxl>=3.1.0", "Pillow>=9.0.0", "numpy>=1.20.0",
        "requests>=2.31.0", "beautifulsoup4>=4.12.0",
    ],
    "pdf": ["PyMuPDF>=1.23.0"],
    "narration": ["edge-tts>=7.2.8"],
    "notebook": ["nbconvert>=7.0.0"],
}
MODULES = {
    "core": ["yaml", "pptx", "xlsxwriter", "pathops", "uharfbuzz", "mammoth", "markdownify", "ebooklib", "openpyxl", "PIL", "numpy", "requests", "bs4"],
    "pdf": ["fitz"],
    "narration": ["edge_tts"],
    "notebook": ["nbconvert"],
}
# Local web pages can't be shown to the user here, and the sound library isn't bundled.
BLOCKED_SCRIPTS = {
    "confirm_ui/server.py": "This app confirms through its own card: use the pending command.",
    "svg_editor/server.py": "This app shows previews itself: live preview is off for this run.",
    "sound_sync.py": "The sound library isn't included in this bot.",
}
ROUTES = ["generate", "create_template", "edit_native"]
PROFILES = ["default", "quick", "beautify"]
PHASES = ["routed", "guard", "importing", "spec_pending", "authoring", "finalizing", "exporting", "done", "error", "cancelled"]
KINDS = ["generate", "template", "edit_native"]
EDITABLE_TAGS = (b"<p:sp>", b"<p:sp ", b"<p:cxnSp>", b"<p:cxnSp ", b"<p:graphicFrame>", b"<p:graphicFrame ")
PICTURE_TAGS = (b"<p:pic>", b"<p:pic ")


class Failure(Exception):
    """A problem to report to the model as one JSON line, with a non-zero exit."""

    def __init__(self, code: str, message: str, status: int = 1):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def workspace() -> Path:
    """The folder holding app/state.json. Background tasks run in a subfolder of the workspace."""
    cwd = Path.cwd().resolve()
    for d in [cwd, *cwd.parents]:
        if (d / "app" / "state.json").is_file():
            return d
    raise Failure("no_workspace", f"No app/state.json at or above {cwd}. Run this from the bot's workspace.")


def env_dir() -> Path:
    return workspace() / ENV_DIR_NAME


def load_env() -> dict | None:
    """How packages were installed: a venv, or a --target folder when this Python has no venv support."""
    try:
        env = json.loads((env_dir() / "env.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if env.get("mode") == "venv" and Path(env.get("python", "")).is_file():
        return env
    if env.get("mode") == "target" and Path(env.get("site", "")).is_dir():
        return {**env, "python": sys.executable}
    return None


def run_env(env: dict | None) -> dict:
    out = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"}
    if env and env.get("mode") == "target":
        out["PYTHONPATH"] = os.pathsep.join(x for x in [env["site"], os.environ.get("PYTHONPATH", "")] if x)
    return out


def venv_python(venv: Path) -> Path:
    return venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def has_pip(python: str) -> bool:
    return subprocess.run([python, "-m", "pip", "--version"], capture_output=True).returncode == 0


def python_supported() -> bool:
    return MIN_PY <= sys.version_info[:2] <= MAX_PY


def installed(env: dict | None, group: str) -> list[str]:
    """Modules of a group that can't be found. find_spec only: importing numpy and friends takes seconds."""
    if not env:
        return list(MODULES[group])
    code = f"import importlib.util as u,json;print(json.dumps([m for m in {MODULES[group]!r} if not u.find_spec(m)]))"
    r = subprocess.run([env["python"], "-c", code], capture_output=True, text=True, env=run_env(env))
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else list(MODULES[group])


def guard_ok() -> bool:
    r = subprocess.run([sys.executable, str(SKILL_DIR / "scripts" / "attribution_guard.py")], capture_output=True, env=run_env(None))
    return r.returncode == 0


# —— app/state.json ——


def state_path() -> Path:
    return workspace() / "app" / "state.json"


def read_state() -> dict:
    try:
        st = json.loads(state_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        st = {}
    st = st if isinstance(st, dict) else {}
    st.setdefault("title", "PPT Master")
    if not isinstance(st.get("projects"), list):
        st["projects"] = []
    return st


def write_state(st: dict) -> None:
    """Write the whole file, then swap it in: the UI never sees half a JSON."""
    p = state_path()
    fd, tmp = tempfile.mkstemp(prefix=".state-", suffix=".json", dir=p.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(st, f, ensure_ascii=False, indent=2)
        os.replace(tmp, p)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def set_runtime(ready: bool, problem: str | None, extras: dict | None = None) -> None:
    st = read_state()
    st["runtime"] = {"ready": ready, "python": ".".join(map(str, sys.version_info[:3])), **({"problem": problem} if problem else {}), **({"extras": extras} if extras else {})}
    write_state(st)


# —— commands ——


def cmd_doctor(_: argparse.Namespace) -> int:
    env = load_env()
    guard = guard_ok()
    missing = installed(env, "core")
    extras = {name: not installed(env, name) for name in ("pdf", "narration", "notebook")}
    ok_python = python_supported()
    problem = "guard" if not guard else "python_version" if not ok_python else "not_installed" if missing else None
    next_step = {
        "guard": "Stop. Report that the skill integrity check failed. Don't inspect, repair or bypass it.",
        "python_version": f"Stop. Ask the user to install Python {MIN_PY[0]}.{MIN_PY[1]} to {MAX_PY[0]}.{MAX_PY[1]} from python.org.",
        "not_installed": "Run: pm.py setup",
        None: "Ready.",
    }[problem]
    set_runtime(not problem, problem, extras)
    print(json.dumps({
        "ok": not problem,
        "python": {"path": sys.executable, "version": ".".join(map(str, sys.version_info[:3])), "supported": ok_python},
        "skillDir": str(SKILL_DIR),
        "guardOk": guard,
        "envReady": bool(env) and not missing,
        "missing": missing,
        "extras": extras,
        "pandoc": bool(shutil.which("pandoc")),
        "imageToPptxReady": False,
        "next": next_step,
    }, ensure_ascii=False, indent=2))
    return 0 if not problem else 1


def create_env() -> dict:
    d = env_dir()
    d.mkdir(parents=True, exist_ok=True)
    venv = d / "venv"
    r = subprocess.run([sys.executable, "-m", "venv", str(venv)], capture_output=True, text=True)
    if r.returncode == 0 and venv_python(venv).is_file() and has_pip(str(venv_python(venv))):
        env = {"mode": "venv", "python": str(venv_python(venv))}
    else:
        # Debian and Ubuntu leave venv out of the base package. A --target folder works with plain pip.
        shutil.rmtree(venv, ignore_errors=True)
        if not has_pip(sys.executable):
            raise Failure("no_pip", "This Python has neither venv nor pip. Ask the user to install Python from python.org, or the python3-venv package on Linux.")
        site = d / "site"
        site.mkdir(exist_ok=True)
        env = {"mode": "target", "site": str(site), "python": sys.executable}
    (d / "env.json").write_text(json.dumps(env, indent=2), encoding="utf-8")
    return env


def cmd_setup(args: argparse.Namespace) -> int:
    if not python_supported():
        raise Failure("python_version", f"Python {MIN_PY[0]}.{MIN_PY[1]} to {MAX_PY[0]}.{MAX_PY[1]} is required; this is {sys.version.split()[0]}.")
    env = load_env() or create_env()
    groups = ["core", *args.extra]
    wanted = [g for g in groups if installed(env, g)]
    if not wanted:
        print(json.dumps({"ok": True, "installed": [], "already": groups}))
        cmd_doctor_quiet()
        return 0
    cmd = [env["python"], "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--prefer-binary"]
    if env["mode"] == "target":
        cmd += ["--upgrade", "--target", env["site"]]
    if args.mirror:
        cmd += ["--index-url", args.mirror]
    cmd += [req for g in wanted for req in GROUPS[g]]
    # pip's progress is the only sign of life on a slow network, so it isn't captured
    code = subprocess.call(cmd, env=run_env(env), stdout=sys.stderr)
    if code != 0:
        raise Failure("pip_failed", "pip failed. If this looks like a network problem, retry once with --mirror https://pypi.tuna.tsinghua.edu.cn/simple", code)
    still = [m for g in wanted for m in installed(env, g)]
    if still:
        raise Failure("pip_incomplete", f"pip finished but these modules can't be found: {', '.join(still)}")
    print(json.dumps({"ok": True, "installed": wanted}))
    cmd_doctor_quiet()
    return 0


def cmd_doctor_quiet() -> None:
    env = load_env()
    guard = guard_ok()
    missing = installed(env, "core")
    set_runtime(guard and not missing, "guard" if not guard else "not_installed" if missing else None, {n: not installed(env, n) for n in ("pdf", "narration", "notebook")})


def cmd_run(args: argparse.Namespace) -> int:
    rel = args.script.replace("\\", "/").removeprefix("scripts/")
    root = (SKILL_DIR / "scripts").resolve()
    target = (root / rel).resolve()
    if root not in target.parents or target.suffix != ".py" or not target.is_file():
        raise Failure("no_script", f"No such upstream script: {args.script}", 2)
    if rel in BLOCKED_SCRIPTS:
        raise Failure("blocked", BLOCKED_SCRIPTS[rel], 2)
    env = load_env()
    if not env and rel != "attribution_guard.py":
        raise Failure("not_installed", "Packages aren't installed yet. Run: pm.py setup")
    python = env["python"] if env else sys.executable
    return subprocess.call([python, str(target), *args.args], env=run_env(env))


def verify_pptx(path: Path) -> dict:
    """Read the package itself: a PPTX whose slides hold only pictures can't be edited."""
    out: dict = {"ok": False, "path": str(path), "size": 0, "slides": 0, "editableSlides": 0, "imageOnlySlides": []}
    if not path.is_file():
        return {**out, "problem": "missing"}
    out["size"] = path.stat().st_size
    try:
        with zipfile.ZipFile(path) as z:
            names = set(z.namelist())
            if "[Content_Types].xml" not in names or "ppt/presentation.xml" not in names:
                return {**out, "problem": "not_a_presentation"}
            slides = sorted(n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n))
            out["slides"] = len(slides)
            if not slides:
                return {**out, "problem": "no_slides"}
            for name in slides:
                xml = z.read(name)
                if any(t in xml for t in EDITABLE_TAGS):
                    out["editableSlides"] += 1
                elif any(t in xml for t in PICTURE_TAGS):
                    out["imageOnlySlides"].append(name)
    except (zipfile.BadZipFile, OSError, KeyError) as e:
        return {**out, "problem": f"bad_zip: {e}"}
    if not out["editableSlides"]:
        return {**out, "problem": "no_editable_slides"}
    out["ok"] = True
    return out


def cmd_verify(args: argparse.Namespace) -> int:
    r = verify_pptx(Path(args.file).resolve())
    print(json.dumps(r, ensure_ascii=False, indent=2))
    return 0 if r["ok"] else 1


def working_svgs(project: Path, kind: str) -> list[Path]:
    """Where the pages being authored live: each route keeps them in its own folder."""
    folder = {"edit_native": "authoring-svg-flat", "template": "templates"}.get(kind, "svg_output")
    return sorted((project / folder).glob("*.svg"))


def previews_of(project: Path, kind: str, ws: Path) -> tuple[list[dict], bool]:
    """svg_final/ holds finished self-contained pages. Before that, or in Quick, show the working SVGs as drafts."""
    final = sorted((project / "svg_final").glob("*.svg"))
    working = working_svgs(project, kind)
    pages = final or working
    return [{"path": f.relative_to(ws).as_posix(), "name": f.stem, "mtime": int(f.stat().st_mtime)} for f in pages], not final and bool(pages)


def exports_of(project: Path, ws: Path, warnings: list[str]) -> list[dict]:
    """Only what passes the check is listed: state can't claim a file that isn't a real deck."""
    out = []
    for f in sorted((project / "exports").glob("*"), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.suffix.lower() == ".mp4":
            out.append({"path": f.relative_to(ws).as_posix(), "name": f.name, "size": f.stat().st_size, "kind": "video"})
        elif f.suffix.lower() == ".pptx":
            r = verify_pptx(f)
            if not r["ok"]:
                warnings.append(f"{f.name}: {r.get('problem')}")
                continue
            if r["imageOnlySlides"]:
                warnings.append(f"{f.name}: {len(r['imageOnlySlides'])} image-only slides")
            kind = "native_charts" if "_native_charts_tables" in f.stem else "standard"
            out.append({"path": f.relative_to(ws).as_posix(), "name": f.name, "size": r["size"], "kind": kind, "slides": r["slides"]})
    return out


def cmd_sync(args: argparse.Namespace) -> int:
    ws = workspace()
    project = Path(args.project)
    project = (project if project.is_absolute() else Path.cwd() / project).resolve()
    if ws / "app" not in project.parents or not project.is_dir():
        raise Failure("bad_project", f"Project folders live under {ws / 'app'}; got {project}", 2)
    st = read_state()
    # The first real project replaces the sample data
    st["projects"] = [p for p in st["projects"] if isinstance(p, dict) and not p.get("sample")]
    if isinstance(st.get("job"), dict) and st["job"].get("sample"):
        st["job"] = None
    pid = project.name
    prev = next((p for p in st["projects"] if p.get("id") == pid), {})
    kind = args.kind or prev.get("kind") or "generate"
    warnings: list[str] = []
    previews, draft = previews_of(project, kind, ws)
    exports = exports_of(project, ws, warnings)
    # Template workspaces may have no review deck: what they must have is templates/
    has_output = bool(exports) or (kind == "template" and any((project / "templates").glob("*")))
    if args.phase == "done" and not has_output:
        write_state(st)
        raise Failure("no_export", f"Can't mark this done: no valid PPTX in {project / 'exports'}. {'; '.join(warnings)}", 3)
    entry = {
        **prev,
        "id": pid,
        "name": args.name or prev.get("name") or pid,
        "kind": kind,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "previews": previews,
        "previewsDraft": draft,
        "exports": exports,
        **({"format": args.format} if args.format else {}),
        "pages": exports[0]["slides"] if exports and exports[0].get("slides") else len(previews),
    }
    st["projects"] = [entry, *[p for p in st["projects"] if p.get("id") != pid]]
    st["activeProjectId"] = pid
    if args.phase:
        old = st["job"] if isinstance(st.get("job"), dict) and st["job"].get("projectId") == pid else {}
        job = {
            "projectId": pid,
            "route": args.route or old.get("route") or ("create_template" if kind == "template" else kind),
            "profile": args.profile or old.get("profile") or "default",
            "phase": args.phase,
            "done": args.done if args.done is not None else len(working_svgs(project, kind)),
            "total": args.total if args.total is not None else old.get("total") or 0,
            "background": args.background or (old.get("background", False) and args.phase not in ("done", "error", "cancelled")),
            "message": args.message or "",
            "warnings": [*args.warn, *warnings],
        }
        st["job"] = job
        if args.phase != "spec_pending":
            st["pendingSpec"] = None
    write_state(st)
    print(json.dumps({"ok": True, "project": pid, "pages": entry["pages"], "previews": len(previews), "exports": [e["name"] for e in exports], "warnings": warnings}, ensure_ascii=False))
    return 0


def cmd_pending(args: argparse.Namespace) -> int:
    st = read_state()
    if args.clear:
        st["pendingSpec"] = None
        write_state(st)
        print(json.dumps({"ok": True}))
        return 0
    if not args.file:
        raise Failure("usage", "pending needs a JSON file, or --clear", 2)
    try:
        spec = json.loads(Path(args.file).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Failure("bad_spec", f"Can't read {args.file}: {e}", 2)
    if not isinstance(spec, dict) or spec.get("stage") not in ("stage1", "stage2", "plan") or not isinstance(spec.get("title"), str) or not isinstance(spec.get("summary"), str):
        raise Failure("bad_spec", 'Expected {"stage":"stage1|stage2|plan","title":"…","summary":"…","fields":[{"label","value"}],"choices":[{"id","label","description","recommended"}]}', 2)
    st["pendingSpec"] = spec
    if isinstance(st.get("job"), dict):
        st["job"] = {**st["job"], "phase": "spec_pending"}
    write_state(st)
    print(json.dumps({"ok": True, "stage": spec["stage"]}))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pm.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor").set_defaults(fn=cmd_doctor)
    p = sub.add_parser("setup")
    p.add_argument("--extra", action="append", default=[], choices=["pdf", "narration", "notebook"])
    p.add_argument("--mirror", help="PyPI mirror, only after a failed attempt")
    p.set_defaults(fn=cmd_setup)
    p = sub.add_parser("run")
    p.add_argument("script")
    p.add_argument("args", nargs=argparse.REMAINDER)
    p.set_defaults(fn=cmd_run)
    p = sub.add_parser("verify")
    p.add_argument("file")
    p.set_defaults(fn=cmd_verify)
    p = sub.add_parser("sync")
    p.add_argument("project")
    p.add_argument("--kind", choices=KINDS)
    p.add_argument("--name")
    p.add_argument("--format")
    p.add_argument("--route", choices=ROUTES)
    p.add_argument("--profile", choices=PROFILES)
    p.add_argument("--phase", choices=PHASES)
    p.add_argument("--done", type=int)
    p.add_argument("--total", type=int)
    p.add_argument("--background", action="store_true", help="This job runs in a background task")
    p.add_argument("--message")
    p.add_argument("--warn", action="append", default=[])
    p.set_defaults(fn=cmd_sync)
    p = sub.add_parser("pending")
    p.add_argument("file", nargs="?")
    p.add_argument("--clear", action="store_true")
    p.set_defaults(fn=cmd_pending)
    args = parser.parse_args(argv)
    try:
        return args.fn(args)
    except Failure as e:
        print(json.dumps({"ok": False, "code": e.code, "message": e.message}, ensure_ascii=False))
        return e.status


if __name__ == "__main__":
    raise SystemExit(main())
