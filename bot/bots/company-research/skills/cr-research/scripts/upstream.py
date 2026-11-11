#!/usr/bin/env python3
"""对接用户本机运行的 Company Research Agent 服务（轨 A）。只用 Python 标准库，结果都以一行 JSON 打印。

  probe   --api URL                            服务在不在，配了哪些模型
  start   --api URL --job-dir DIR --company X  启动研究，把上游的任务号记进 DIR/upstream.json
  follow  --job-dir DIR --state F --job-id ID  读进度流，更新界面状态。到时间就退出，再运行一次接着读
  report  --job-dir DIR                        取上游的报告状态
  pdf     --job-dir DIR                        让上游生成 PDF，存成 DIR/report.pdf

只连本机地址：报告内容和公司信息不发到别处。不传也不读任何 Key，上游服务用它自己的配置。
"""
import argparse
import json
import os
import re
import socket
import sys
import time
from datetime import datetime, timezone
from urllib import error, parse, request

STAGES = ["grounding", "research", "collector", "curator", "enricher", "briefing", "editor"]
RESEARCH_NODES = {
    "financial_analyst": "financial",
    "news_scanner": "news",
    "industry_analyst": "industry",
    "company_analyst": "company",
}
ALL_NODES = ["grounding", *RESEARCH_NODES, "collector", "curator", "enricher", "briefing", "editor"]
# 上游事件里的分类名 → 节点
ANALYZERS = {
    "financial_analyzer": "financial_analyst",
    "news_analyzer": "news_scanner",
    "industry_analyzer": "industry_analyst",
    "company_analyzer": "company_analyst",
}
STATUS_OF = {
    "grounding": "grounding",
    "research": "researching",
    "collector": "collecting",
    "curator": "curating",
    "enricher": "enriching",
    "briefing": "briefing",
    "editor": "editing",
}
DISCLAIMER = {
    "zh-CN": "**免责声明**：本报告由 AI 根据公开来源整理，仅供信息和学习参考，不构成投资、税务或法律建议。来源可能过时或有误，使用前请自行核实。作者和 AnyModelBot 不对依据本报告作出的决定承担责任。",
    "en": "**Disclaimer**: This report was compiled by AI from public sources for information and learning only. It is not investment, tax or legal advice. Sources may be outdated or wrong, so verify them before relying on them. The authors and AnyModelBot accept no liability for decisions based on this report.",
}
TIMELINE_MAX = 200
PREVIEW_CHARS = 1500
SOURCES_PREVIEW = 12
# 回环地址不走代理
OPENER = request.build_opener(request.ProxyHandler({}))


def out(obj):
    print(json.dumps(obj, ensure_ascii=False))


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_api(raw):
    """只接受本机地址。返回去掉结尾斜杠的地址，不合格返回 None"""
    try:
        u = parse.urlsplit(raw)
    except ValueError:
        return None
    if u.scheme not in ("http", "https") or u.hostname not in ("127.0.0.1", "localhost", "::1"):
        return None
    return raw.rstrip("/")


def call(url, body=None, timeout=10):
    """返回 (状态码, 响应内容的字节)。连不上时抛 OSError"""
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = request.Request(url, data=data, headers={"content-type": "application/json"} if data else {})
    try:
        with OPENER.open(req, timeout=timeout) as res:
            return res.status, res.read()
    except error.HTTPError as e:
        return e.code, e.read()
    except error.URLError as e:
        raise OSError(str(e.reason)) from e


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_atomic(path, data):
    """先写完整内容再替换，界面不会读到写了一半的文件"""
    tmp = f"{path}.{os.getpid()}.tmp"
    mode = "wb" if isinstance(data, bytes) else "w"
    kwargs = {} if isinstance(data, bytes) else {"encoding": "utf-8"}
    with open(tmp, mode, **kwargs) as f:
        f.write(data)
    os.replace(tmp, path)


def extract_sources(report):
    """上游的接口不返回来源列表，只能从报告里取：先取 [标题](地址)，再取 References 里的裸地址"""
    found = {}
    for title, url in re.findall(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)", report):
        found.setdefault(url, title.strip())
    for line in report.splitlines():
        for url in re.findall(r"https?://[^\s<>()\[\]\"']+", line):
            url = url.rstrip(".,;:!?")
            if url in found:
                continue
            # MLA 格式的引用：Website. "Title." https://…
            quoted = re.search(r'"([^"]+)"', line)
            found[url] = quoted.group(1).rstrip(".") if quoted else ""
    return [{"url": u, **({"title": t} if t else {}), "used": True} for u, t in found.items()]


def with_disclaimer(report, lang):
    text = DISCLAIMER.get(lang, DISCLAIMER["en"])
    return report if text in report else f"{report.rstrip()}\n\n---\n\n{text}\n"


def preview_of(report):
    """报告开头，在段落结尾截断"""
    if len(report) <= PREVIEW_CHARS:
        return report
    cut = report.rfind("\n\n", 0, PREVIEW_CHARS)
    return report[: cut if cut > 0 else PREVIEW_CHARS].rstrip()


class Tracker:
    """把上游事件变成界面状态。每次写之前都重读文件，只改这个任务自己的字段"""

    def __init__(self, args):
        self.state_path = args.state
        self.job_id = args.job_id
        self.job_dir = os.path.normpath(args.job_dir)
        self.lang = args.lang
        self.pending = []
        self.fields = {}
        self.top = {}
        self.dirty = False
        self.last_flush = 0.0
        job = self.job()
        self.nodes = dict(job.get("nodes") or {})
        self.doc_counts = dict(job.get("docCounts") or {})
        for node in ALL_NODES:
            self.nodes.setdefault(node, "pending")
        for key in RESEARCH_NODES.values():
            self.doc_counts.setdefault(key, 0)

    def job(self):
        for job in read_json(self.state_path).get("jobs", []):
            if job.get("id") == self.job_id:
                return job
        raise KeyError(self.job_id)

    def set_node(self, node, status):
        if self.nodes.get(node) == status or (self.nodes.get(node) == "done" and status == "running"):
            return
        self.nodes[node] = status
        entry = {"jobId": self.job_id, "at": now(), "node": node, "status": status}
        self.pending.append(entry)
        self.dirty = True

    def finish_before(self, stage):
        """上游的进度是轮询出来的，会漏掉很快结束的节点：走到后面的阶段时，前面的都算完成"""
        for earlier in STAGES[: STAGES.index(stage)]:
            for node in RESEARCH_NODES if earlier == "research" else [earlier]:
                self.set_node(node, "done")

    def enter(self, stage, node):
        self.finish_before(stage)
        self.set_node(node, "running")
        if self.fields.get("status") != STATUS_OF[stage] or self.fields.get("currentStep") != node:
            self.fields["status"] = STATUS_OF[stage]
            self.fields["currentStep"] = node
            self.dirty = True

    def apply(self, event):
        kind = event.get("type")
        if kind == "progress":
            step = event.get("step")
            if step in ALL_NODES:
                stage = "research" if step in RESEARCH_NODES else step
                self.finish_before(stage)
                self.set_node(step, "done")
                self.fields["status"] = STATUS_OF[stage]
                self.fields["currentStep"] = step
        elif kind == "research_init":
            self.enter("grounding", "grounding")
        elif kind in ("query_generating", "query_generated", "search_started"):
            node = ANALYZERS.get(event.get("category"))
            if node:
                self.enter("research", node)
        elif kind == "curation":
            category = event.get("category")
            if category in self.doc_counts and isinstance(event.get("total"), int):
                self.doc_counts[category] = event["total"]
                self.dirty = True
            self.enter("curator", "curator")
        elif kind == "enrichment":
            self.enter("enricher", "enricher")
        elif kind in ("briefing_start", "briefing_complete"):
            self.enter("briefing", "briefing")
        elif kind in ("report_compilation", "report_chunk"):
            self.enter("editor", "editor")

    def complete(self, report):
        report = with_disclaimer(report, self.lang)
        sources = extract_sources(report)
        report_path = os.path.join(self.job_dir, "report.md")
        sources_path = os.path.join(self.job_dir, "sources.json")
        write_atomic(report_path, report)
        write_atomic(sources_path, json.dumps(sources, ensure_ascii=False, indent=2))
        for node in ALL_NODES:
            self.set_node(node, "done")
        total = sum(self.doc_counts.values())
        self.fields.update(
            status="completed",
            currentStep="editor",
            reportPath=report_path.replace(os.sep, "/"),
            sourcesPath=sources_path.replace(os.sep, "/"),
            curation={"total": max(total, len(sources)), "kept": len(sources)},
        )
        self.top = {"selectedJobId": self.job_id, "reportPreview": preview_of(report), "sourcesPreview": sources[:SOURCES_PREVIEW]}
        self.flush(force=True)
        return {"state": "completed", "report": self.fields["reportPath"], "sources": len(sources)}

    def fail(self, message):
        for node, status in self.nodes.items():
            if status == "running":
                self.set_node(node, "failed")
        self.fields.update(status="failed", error=str(message)[:300])
        self.flush(force=True)
        return {"state": "failed", "error": self.fields["error"]}

    def flush(self, force=False):
        if not force and (not self.dirty or time.time() - self.last_flush < 1):
            return
        state = read_json(self.state_path)
        for job in state.get("jobs", []):
            if job.get("id") != self.job_id:
                continue
            # 用户中途取消了：不再写回来
            if job.get("status") == "cancelled":
                raise Cancelled()
            done = sum(1 for s in self.nodes.values() if s == "done")
            job.update(self.fields, nodes=self.nodes, docCounts=self.doc_counts, updatedAt=now())
            job["progress"] = 100 if self.fields.get("status") == "completed" else round(done / len(ALL_NODES) * 95)
        state.update(self.top)
        state["timeline"] = ((state.get("timeline") or []) + self.pending)[-TIMELINE_MAX:]
        write_atomic(self.state_path, json.dumps(state, ensure_ascii=False, indent=2))
        with open(os.path.join(self.job_dir, "nodes.jsonl"), "a", encoding="utf-8") as f:
            for entry in self.pending:
                f.write(json.dumps({"at": entry["at"], "node": entry["node"], "status": entry["status"]}, ensure_ascii=False) + "\n")
        self.pending = []
        self.dirty = False
        self.last_flush = time.time()


class Cancelled(Exception):
    pass


def meta_of(job_dir):
    return read_json(os.path.join(job_dir, "upstream.json"))


def cmd_probe(args):
    api = local_api(args.api)
    if not api:
        return out({"reachable": False, "error": "api_not_local"})
    try:
        status, body = call(f"{api}/config", timeout=3)
        cfg = json.loads(body) if status == 200 else None
    except (OSError, ValueError):
        cfg = None
    # 8000 端口上可能是别的服务：有这个字段才算上游
    if not isinstance(cfg, dict) or "openrouter_configured" not in cfg:
        return out({"reachable": False})
    out({"reachable": True, "openrouter": bool(cfg.get("openrouter_configured")), "openai": bool(cfg.get("openai_configured")), "defaultModel": cfg.get("default_model") or ""})


def cmd_start(args):
    api = local_api(args.api)
    if not api:
        return out({"ok": False, "error": "api_not_local"})
    body = {"company": args.company}
    for key, value in (("company_url", args.company_url), ("industry", args.industry), ("hq_location", args.hq), ("model", args.model)):
        if value:
            body[key] = value
    try:
        status, raw = call(f"{api}/research", body, timeout=30)
        reply = json.loads(raw)
    except (OSError, ValueError) as e:
        return out({"ok": False, "error": str(e)[:300]})
    upstream_id = reply.get("job_id") if status == 200 and isinstance(reply, dict) else None
    if not upstream_id:
        return out({"ok": False, "error": f"HTTP {status}"})
    os.makedirs(args.job_dir, exist_ok=True)
    write_atomic(os.path.join(args.job_dir, "upstream.json"), json.dumps({"apiBase": api, "jobId": upstream_id, "company": args.company, "startedAt": now()}, ensure_ascii=False, indent=2))
    out({"ok": True, "jobId": upstream_id})


def fetch_report(api, upstream_id):
    """(状态, 报告文字)。状态：ready、pending、lost"""
    status, raw = call(f"{api}/research/{parse.quote(upstream_id)}/report")
    if status == 404:
        return "lost", ""
    if status == 202:
        return "pending", ""
    if status == 200:
        report = json.loads(raw).get("report")
        if isinstance(report, str) and report:
            return "ready", report
    return "pending", ""


def read_stream(api, upstream_id, tracker, deadline):
    """读进度流直到结束或到时间。返回最后的结果，还在进行中时返回 None"""
    req = request.Request(f"{api}/research/{parse.quote(upstream_id)}/stream", headers={"accept": "text/event-stream"})
    while time.time() < deadline:
        # 流里没事件时会一直等；超时后重连，事件还排在上游的队列里，不会丢
        try:
            with OPENER.open(req, timeout=max(1, min(15, deadline - time.time()))) as res:
                for line in res:
                    if not line.startswith(b"data:"):
                        continue
                    try:
                        event = json.loads(line[5:].strip())
                    except ValueError:
                        continue
                    if event.get("type") == "complete" and event.get("report"):
                        return tracker.complete(event["report"])
                    if event.get("type") == "error":
                        return tracker.fail(event.get("error") or "upstream error")
                    tracker.apply(event)
                    tracker.flush()
                    if time.time() >= deadline:
                        return None
        except (socket.timeout, TimeoutError):
            tracker.flush(force=tracker.dirty)
            continue
        # 流结束了却没有结果：上游多半不认识这个任务了，下面用报告接口确认
        return check_report(api, upstream_id, tracker)
    return None


def check_report(api, upstream_id, tracker):
    state, report = fetch_report(api, upstream_id)
    if state == "ready":
        return tracker.complete(report)
    if state == "lost":
        return tracker.fail("job_lost: the local service no longer knows this job, probably because it restarted")
    return None


def cmd_follow(args):
    meta = meta_of(args.job_dir)
    api, upstream_id = meta["apiBase"], meta["jobId"]
    if not local_api(api):
        return out({"state": "failed", "error": "api_not_local"})
    tracker = Tracker(args)
    deadline = time.time() + args.max_seconds
    try:
        result = read_stream(api, upstream_id, tracker, deadline)
        if result is None:
            tracker.flush(force=tracker.dirty)
            result = {"state": "running", "status": tracker.fields.get("status"), "step": tracker.fields.get("currentStep")}
    except Cancelled:
        result = {"state": "cancelled"}
    except (error.URLError, ConnectionError, OSError) as e:
        result = {"state": "unreachable", "error": str(e)[:300]}
    out(result)


def cmd_report(args):
    meta = meta_of(args.job_dir)
    try:
        state, report = fetch_report(meta["apiBase"], meta["jobId"])
    except OSError as e:
        return out({"state": "unreachable", "error": str(e)[:300]})
    out({"state": state, "chars": len(report)})


def cmd_pdf(args):
    meta = meta_of(args.job_dir)
    if not local_api(meta["apiBase"]):
        return out({"ok": False, "error": "api_not_local"})
    with open(os.path.join(args.job_dir, "report.md"), encoding="utf-8") as f:
        report = f.read()
    # 上游的 PDF 只有西文字体，别的文字会变成方块，交给本地脚本
    try:
        report.encode("cp1252")
    except UnicodeEncodeError:
        return out({"ok": False, "error": "non_latin_report"})
    try:
        status, body = call(f"{meta['apiBase']}/generate-pdf", {"report_content": report, "company_name": meta.get("company")}, timeout=120)
    except OSError as e:
        return out({"ok": False, "error": "unreachable", "detail": str(e)[:300]})
    if status != 200 or not body.startswith(b"%PDF-"):
        return out({"ok": False, "error": f"HTTP {status}"})
    path = os.path.join(args.job_dir, "report.pdf")
    write_atomic(path, body)
    out({"ok": True, "path": path.replace(os.sep, "/"), "bytes": len(body)})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("probe")
    p.add_argument("--api", default="http://127.0.0.1:8000")
    p.set_defaults(fn=cmd_probe)

    p = sub.add_parser("start")
    p.add_argument("--api", default="http://127.0.0.1:8000")
    p.add_argument("--job-dir", required=True)
    p.add_argument("--company", required=True)
    p.add_argument("--company-url")
    p.add_argument("--industry")
    p.add_argument("--hq")
    p.add_argument("--model")
    p.set_defaults(fn=cmd_start)

    p = sub.add_parser("follow")
    p.add_argument("--job-dir", required=True)
    p.add_argument("--state", required=True)
    p.add_argument("--job-id", required=True)
    p.add_argument("--lang", default="en")
    p.add_argument("--max-seconds", type=float, default=90)
    p.set_defaults(fn=cmd_follow)

    p = sub.add_parser("report")
    p.add_argument("--job-dir", required=True)
    p.set_defaults(fn=cmd_report)

    p = sub.add_parser("pdf")
    p.add_argument("--job-dir", required=True)
    p.set_defaults(fn=cmd_pdf)

    args = parser.parse_args()
    # Windows 控制台默认不是 UTF-8，公司名和错误信息可能有中文
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        args.fn(args)
    except (KeyError, OSError, ValueError) as e:
        out({"ok": False, "state": "failed", "error": f"{type(e).__name__}: {e}"[:300]})
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
