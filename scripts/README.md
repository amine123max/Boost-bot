# Development tools / 开发工具

Run from the repository root. These scripts use `frontend/`, `backend/desktop/`, root Cargo packages and `bot/` as their canonical source locations.

从仓库根目录执行，代码路径统一使用新的前端、后端及 Bot 目录。

| Entry | Responsibility / 职责 |
| --- | --- |
| `dev-boost.mjs` | Matching source-built service, authenticated developer Web and Vite / 联合开发 |
| `prepare-boost-bot.mjs` | Prepare locked Bot dependencies, shared UI, Node and tools / 准备 Bot |
| `stage-boost-bot.mjs` | Stage a prepared Bot runtime into a service package / 打包 Bot 运行目录 |
| `rebuild.ps1`, `rebuild-linux.sh`, `rebuild-macos.sh` | Native desktop rebuild helpers / 原生桌面重建 |
| `check-repository.mjs` | Validate structure, package paths and documentation links / 校验结构与文档链接 |
| `check-release-version.mjs` | Match source version fields to a release tag / 发布版本一致性 |
| `verify-boost-bot-live.mjs` | Browser probe of an explicitly selected running application / 真实运行环境浏览器检查 |
| `verify-api-key-quota-limit.sh` | API-key quota integration probe / 密钥额度验证 |
| `run-service-app.sh` | Build static UI and service binaries, then launch / 构建并启动服务 |
| `run-curl-cffi-chatgpt-proxy.sh`, `curl_cffi_chatgpt_proxy.py` | Optional proxy troubleshooting helper / 可选代理排障 |
| `setup-cloudflare-warp-proxy.sh` | Optional host proxy setup / 可选宿主代理配置 |

Normal application Web access uses **12580**. Developer-only listeners are documented in [BUILDING.md](../docs/BUILDING.md). Read a system-configuration or cleanup script before running it; these are not part of ordinary application startup.

正常 Web 访问使用 **12580**。开发端口见[构建指南](../docs/BUILDING.md)。修改系统配置或执行清理的脚本应先阅读源码，不属于日常启动步骤。
