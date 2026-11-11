#!/usr/bin/env python3
"""把 Markdown 报告导出成 PDF，结果以一行 JSON 打印。

  export_pdf.py --input report.md --output report.pdf [--title 标题] [--deps .cr-deps]

需要 reportlab。--deps 是装它的目录（pip install --target）。没装时打印 missing_reportlab，退出码 3。
中文、日文、韩文、俄文用 reportlab 自带的 CID 字体，不需要字体文件。
"""
import argparse
import json
import os
import re
import sys

BLOCK_HEADING = re.compile(r"^(#{1,4})\s+(.*)$")
BLOCK_RULE = re.compile(r"^\s*([-*_])(\s*\1){2,}\s*$")
BLOCK_BULLET = re.compile(r"^\s*[-*+]\s+(.*)$")
BLOCK_NUMBER = re.compile(r"^\s*\d+[.)]\s+(.*)$")
BLOCK_QUOTE = re.compile(r"^\s*>\s?(.*)$")
TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
TABLE_RULE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")
INLINE = re.compile(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`|(https?://[^\s<>()\[\]]+)")
LINK_COLOR = "#1a5fb4"
TAIL_PUNCTUATION = ".,;:!?。，；：！？）)"


def parse_blocks(text):
    """Markdown → [(类型, 内容)]。类型：heading、rule、quote、ul、ol、table、p"""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks = []
    i = 0

    def starts_block(n):
        line = lines[n]
        return not line.strip() or BLOCK_HEADING.match(line) or BLOCK_RULE.match(line) or BLOCK_BULLET.match(line) or BLOCK_NUMBER.match(line) or BLOCK_QUOTE.match(line) or is_table(n)

    def is_table(n):
        return bool(TABLE_ROW.match(lines[n])) and n + 1 < len(lines) and bool(TABLE_RULE.match(lines[n + 1]))

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
        elif BLOCK_HEADING.match(line):
            m = BLOCK_HEADING.match(line)
            blocks.append(("heading", (len(m.group(1)), m.group(2).strip())))
            i += 1
        elif BLOCK_RULE.match(line):
            blocks.append(("rule", None))
            i += 1
        elif is_table(i):
            rows = []
            head = i
            i += 2
            rows.append(split_row(lines[head]))
            while i < len(lines) and TABLE_ROW.match(lines[i]):
                rows.append(split_row(lines[i]))
                i += 1
            blocks.append(("table", rows))
        else:
            for kind, pattern in (("quote", BLOCK_QUOTE), ("ul", BLOCK_BULLET), ("ol", BLOCK_NUMBER)):
                if pattern.match(line):
                    items = []
                    while i < len(lines) and pattern.match(lines[i]):
                        items.append(pattern.match(lines[i]).group(1).strip())
                        i += 1
                    blocks.append((kind, items))
                    break
            else:
                para = []
                while i < len(lines) and not starts_block(i):
                    para.append(lines[i].strip())
                    i += 1
                blocks.append(("p", " ".join(para)))
    return blocks


def split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def escape(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def attr(text):
    return escape(text).replace('"', "&quot;")


def inline_markup(text):
    """行内 Markdown → reportlab 的段落标记。文字都先转义，模型写的 < 不会被当成标签"""
    out = []
    last = 0
    for m in INLINE.finditer(text):
        out.append(escape(text[last: m.start()]))
        label, url, bold, code, bare = m.groups()
        if url:
            out.append(f'<a href="{attr(url)}" color="{LINK_COLOR}">{escape(label)}</a>')
        elif bold:
            out.append(f"<b>{escape(bold)}</b>")
        elif code:
            out.append(escape(code))
        else:
            trimmed = bare.rstrip(TAIL_PUNCTUATION)
            out.append(f'<a href="{attr(trimmed)}" color="{LINK_COLOR}">{escape(trimmed)}</a>{escape(bare[len(trimmed):])}')
        last = m.end()
    out.append(escape(text[last:]))
    return "".join(out)


def clean(text):
    """去掉四字节字符（表情等）：CID 字体里没有，留着会变成乱码"""
    return re.sub(r"[\U00010000-\U0010ffff]", "", text)


def pick_font(text):
    """按报告里的文字选字体。假名优先于汉字，否则日文会用到中文字形"""
    if re.search(r"[぀-ヿ]", text):
        return "HeiseiKakuGo-W5"
    if re.search(r"[가-힯]", text):
        return "HYGothic-Medium"
    if re.search(r"[Ѐ-ӿ㐀-鿿＀-￯　-〿]", text):
        return "STSong-Light"
    return "Helvetica"


def build(markdown, output, title):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.platypus import HRFlowable, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    text = clean(markdown)
    font = pick_font(f"{title}\n{text}")
    cid = font != "Helvetica"
    if cid:
        pdfmetrics.registerFont(UnicodeCIDFont(font))
        pdfmetrics.registerFontFamily(font, normal=font, bold=font, italic=font, boldItalic=font)
    bold_font = font if cid else "Helvetica-Bold"
    wrap = "CJK" if cid else None

    def style(name, size, leading, **extra):
        base = dict(fontName=font, fontSize=size, leading=leading, alignment=TA_LEFT, textColor=colors.HexColor("#1a1a1a"), spaceAfter=6)
        if wrap:
            base["wordWrap"] = wrap
        base.update(extra)
        return ParagraphStyle(name, **base)

    body = style("body", 10.5, 16)
    quote = style("quote", 10, 15, leftIndent=12, textColor=colors.HexColor("#4d4d4d"))
    cell = style("cell", 9, 13, spaceAfter=0)
    headings = {
        1: style("h1", 20, 26, fontName=bold_font, spaceAfter=10),
        2: style("h2", 14, 20, fontName=bold_font, spaceBefore=12, spaceAfter=6),
        3: style("h3", 12, 17, fontName=bold_font, spaceBefore=8, spaceAfter=4),
        4: style("h4", 10.5, 16, fontName=bold_font, spaceBefore=6, spaceAfter=3),
    }
    width = A4[0] - 40 * mm

    story = []
    for kind, data in parse_blocks(text):
        if kind == "heading":
            story.append(Paragraph(inline_markup(data[1]), headings[data[0]]))
        elif kind == "p":
            story.append(Paragraph(inline_markup(data), body))
        elif kind == "rule":
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc"), spaceBefore=6, spaceAfter=8))
        elif kind == "quote":
            story.extend(Paragraph(inline_markup(item), quote) for item in data)
        elif kind in ("ul", "ol"):
            items = [ListItem(Paragraph(inline_markup(item), body)) for item in data]
            options = dict(bulletFontName=font, bulletFontSize=10.5, leftIndent=14)
            story.append(ListFlowable(items, bulletType="1", **options) if kind == "ol" else ListFlowable(items, bulletType="bullet", start="•" if not cid else "-", **options))
            story.append(Spacer(1, 4))
        elif kind == "table":
            columns = max(len(row) for row in data)
            rows = [[Paragraph(inline_markup(row[n] if n < len(row) else ""), cell) for n in range(columns)] for row in data]
            table = Table(rows, colWidths=[width / columns] * columns, repeatRows=1)
            table.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f2f2f2")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            story.extend([table, Spacer(1, 8)])
    if not story:
        story.append(Paragraph(escape(title or " "), body))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(font, 8)
        canvas.setFillColor(colors.HexColor("#808080"))
        canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, str(doc.page))
        canvas.restoreState()

    tmp = f"{output}.{os.getpid()}.tmp"
    doc = SimpleDocTemplate(tmp, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm, title=title or "Report", author="AnyModelBot")
    try:
        doc.build(story, onFirstPage=footer, onLaterPages=footer)
        with open(tmp, "rb") as f:
            if f.read(5) != b"%PDF-":
                raise ValueError("output is not a PDF")
        os.replace(tmp, output)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return os.path.getsize(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", default="")
    parser.add_argument("--deps")
    args = parser.parse_args()
    # Windows 控制台默认不是 UTF-8，路径和错误信息可能有中文
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if args.deps:
        sys.path.insert(0, os.path.abspath(args.deps))
    try:
        import reportlab  # noqa: F401
    except ImportError:
        print(json.dumps({"ok": False, "error": "missing_reportlab"}))
        return 3
    try:
        with open(args.input, encoding="utf-8") as f:
            markdown = f.read()
        size = build(markdown, args.output, args.title)
    except Exception as e:  # 模型要看到原因，好告诉用户
        print(json.dumps({"ok": False, "error": str(e)[:300]}, ensure_ascii=False))
        return 1
    print(json.dumps({"ok": True, "path": args.output.replace(os.sep, "/"), "bytes": size}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
