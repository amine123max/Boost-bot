#!/usr/bin/env python3
"""把上游 ppt-master 技能放进这个 Bot：python3 bots/ppt-master/vendor.py <上游仓库目录>

上游完整技能有 13,000 多个文件，而运行包上限是 2,000 个，所以要裁剪。升级上游时重新运行，
再用 `npm run bot -- hash bots/ppt-master/skills/ppt-master` 更新 bot.json 里的 sha256 和 source。
这里不改上游的流程文档；运行时的差异都写在 skills/ppt-runner/SKILL.md。
"""
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DROP = [
    # 图标只留 tabler-filled（1,055 个）；选库的规则见 ppt-runner
    "templates/icons/chunk-filled",
    "templates/icons/phosphor-duotone",
    "templates/icons/simple-icons",
    "templates/icons/tabler-outline",
    # 音效 12 MB，一期不提供
    "templates/sounds",
    # 上游自己的测试
    "scripts/tests",
    # 技能由目录升级，不能自己改自己
    "scripts/update_repo.py",
]
# 约束检查不允许技能里出现 sudo；这两处只是提示文字
PATCH = [
    ("scripts/docs/conversion.md", "sudo apt install pandoc", "apt install pandoc"),
    ("scripts/source_to_md/doc_to_md.py", "sudo apt install pandoc", "apt install pandoc"),
]
ICON_NOTE = (
    "> **AnyModelBot bundle**: only `tabler-filled` is included here. The other libraries listed below are not "
    "available; use `tabler-filled` or no icons, and ask the user for any brand logo.\n\n"
)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    src = Path(sys.argv[1]).resolve() / "skills" / "ppt-master"
    if not (src / "SKILL.md").is_file():
        print(f"没有找到上游技能：{src}")
        return 2
    dest = HERE / "skills" / "ppt-master"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"))
    for rel in DROP:
        p = dest / rel
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()
    for rel, old, new in PATCH:
        p = dest / rel
        text = p.read_text(encoding="utf-8")
        if old not in text:
            print(f"上游变了，请检查这处修改：{rel}")
            return 1
        p.write_text(text.replace(old, new), encoding="utf-8")
    readme = dest / "templates" / "icons" / "README.md"
    title, rest = readme.read_text(encoding="utf-8").split("\n", 1)
    readme.write_text(f"{title}\n\n{ICON_NOTE}{rest.lstrip()}", encoding="utf-8")
    count = sum(1 for f in dest.rglob("*") if f.is_file())
    print(f"已放入 {dest}，共 {count} 个文件")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
