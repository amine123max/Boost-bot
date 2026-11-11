# PPT 大师（PPT Master）需求稿 v1.1

上游：[hugohe3/ppt-master](https://github.com/hugohe3/ppt-master)（MIT，commit `82468e8`，技能版本 6.8.0）。这份文档不进任何包，只给开发看。v1.1 按框架和上游的实际情况修正了 v1.0。

## 定位

Bot 在用户设备上驱动上游的完整流程，产出原生可编辑的 PPTX。Amb 就是上游说的 Agent 宿主：多轮对话、读文件、跑命令，模型走 Modelflare。

## 和 v1.0 的差别

| 项 | v1.0 | v1.1 | 原因 |
|---|---|---|---|
| 调用方式 | 自写 `pm_*` 工具 | 上游技能 + 编排技能 `ppt-runner` + 脚本 `pm.py` | 框架不能注册工具；上游的核心是模型手写每页 SVG |
| 安装 | 用户 clone 并 pip 安装 | 技能随 Bot 发布，依赖首次运行时装进工作区 `.ppt-env/` | 第一次点就能用，代码经过哈希校验和脚本扫描 |
| 上游内容 | 完整 | 裁剪后约 1,800 个文件 | 运行包上限 2,000 个，上游有 13,000 多个 |
| Image to PPTX | full | 不提供 | 上游只支持 Codex，也不提供替代方案 |
| 确认 | 一个 `confirm_spec` | 两阶段卡片（Edit Native 是一张计划卡） | 上游就是两阶段；走上游的 chat 分支，不开本地网页 |
| 预览 | 文件名列表、可选本地预览服务 | 界面直接显示 SVG，Quick 显示草稿 | 沙箱页不能弹窗；桥接新增 `readImage` |
| 产物 | 显示路径 | 桌面版打开或在文件夹中显示，网页下载，同时用 `present` 交付 | 桥接新增 `openFile` |
| 生图 | 用户配 Key | App 的 `media` 技能（上游 Path B） | 和“只登录”的方向一致 |
| 旁白 | 无 Key 不可用 | 默认 edge-tts，不要 Key | 上游默认就是 Edge |
| PDF | 可选，但核心验收要用 | 第一次遇到 PDF 时由 Bot 从 PyPI 装进工作区 | 不打包 AGPL 的 PyMuPDF，PDF 又能用 |
| 可点的话 | 依赖还没有的文件 | 给主题就能跑，上传文档是单独的按钮 | 新用户的 inbox 是空的 |
| 费用提示 | 开始前提示 token 贵 | 不提 | 产品规则：不强化扣费 |

## 路线

| 路线 | 状态 | 入口 |
|---|---|---|
| Generate · Default | 支持 | 文档或主题，两阶段确认后逐页制作 |
| Generate · Quick | 支持 | 用户明确说快速、不用确认 |
| Generate · Beautify | 支持 | 现有 PPTX，文字、页数、顺序不变 |
| Generate · Image to PPTX | 不提供 | 说明原因，建议 Beautify 或普通生成 |
| Create Template | 支持 | 参考文件或文字描述 |
| Edit Native PPTX | 支持 | 现有 PPTX，未改的页字节级保留 |
| 动画、切换、讲稿 | 支持 | 用户要求或方案里启用 |
| 旁白 | 支持 | 按需装 `narration` |
| 视频导出 | 仅 Windows PowerPoint | 其他系统说明后交付 PPTX |
| 音效、`update_repo.py`、本地网页（确认页、在线预览） | 不提供 | 没带或被 `pm.py run` 拒绝 |

## 目录

```text
bots/ppt-master/
  bot.json、persona.md、state.schema.json、sample.zh-CN.json、sample.en.json
  skills/ppt-master/   上游技能（裁剪规则见 vendor.py）
  skills/ppt-runner/   本机差异（SKILL.md）和 scripts/pm.py
  ui/                  界面，ui/sample/ 是示例项目的预览图
  evals/               评测任务和注入用例
  vendor.py            重新放入上游（升级时用）
  SPEC.md              这份文档
```

工作区：

```text
.ppt-env/                  依赖（venv；没有 venv 时用 pip --target）
app/state.json             界面数据
app/inbox/                 用户上传的文件
app/projects/<id>/         上游的工程目录：sources、svg_output、svg_final、exports、validation…
```

## pm.py

只用标准库，装依赖之前就要能跑。

| 命令 | 作用 |
|---|---|
| `doctor` | Python 版本、上游完整性检查、已装的依赖；同时更新 `state.runtime` |
| `setup [--extra pdf\|narration\|notebook] [--mirror URL]` | 安装依赖，重复运行只装缺的 |
| `run SCRIPT [ARGS]` | 用装好的依赖跑上游脚本；本地网页和音效脚本直接拒绝 |
| `verify FILE` | 读 PPTX 包本身：是不是演示文稿、有几页、有没有可编辑的形状 |
| `sync PROJECT [--phase …]` | 从磁盘刷新预览和导出；没有有效的 PPTX 就拒绝 `done`；第一次运行清掉示例数据 |
| `pending FILE` / `--clear` | 显示或清除确认卡片 |

## 界面

左边项目，中间进度和页面预览，右边导出文件；窄屏时上下排列。选文件之后问一句怎么用，点了才调模型。确认卡片在最上面，Bot 在卡片这里停下等用户。任务中断（用户停止或 30 分钟上限）时显示“继续”。

## 长文稿

单轮上限 30 分钟。约 12 页以上：Default 在 Stage 2 选 `split`，确认后用 `task_start` 走上游的 `resume-execute`；Quick 整轮放后台任务。

## 验收

静态检查和单元测试会自动跑。`check --full` 要真实模型，按需手动跑；`evals/` 里的任务检查文件本身，不看状态写了什么。

| ID | 断言 | 怎么验 |
|---|---|---|
| AT-PM-01 | Quick 产出 PPTX，含 `[Content_Types].xml` 和 slide | `evals`：`quick-topic`、`quick-from-file` |
| AT-PM-02 | Default 没确认不进入制作 | `evals`：`default-stops-at-card` |
| AT-PM-03 | 原生图表产生单独的导出 | 手动 |
| AT-PM-04 | Edit Native 未改的页不变 | 手动，抽样比哈希 |
| AT-PM-05 | 完整性检查失败就停 | `doctor` 单元测试 + 手动 |
| AT-PM-06 | 模板产出工作区 | `evals`：`create-template` |
| AT-PM-07 | 材料里的注入指令不执行 | `evals/injection.json` |
| AT-PM-09 | 没有有效 PPTX 不能标记完成 | `pm.py` 单元测试 |

原 AT-PM-08（无网络时也能用）删除：权限在 `bot.json` 里是固定的，运行时没有“无网络”这个状态。本地素材不需要联网这一点仍然成立。

## 上线前

1. 发 0.1.20：桥接的 `readImage`、`openFile`，以及目录公钥（`docs/bot-framework.md` 的“上线目录要做的事”）。`bot.json` 的 `minAppVersion` 已经写成 0.1.20；版本号变了要同步改。
2. 手动跑一遍 AT-PM-03、04、05 和 `check --full`。
3. PDF 的做法：不打包 PyMuPDF，由用户设备从 PyPI 安装。是否符合 AGPL 要确认。
