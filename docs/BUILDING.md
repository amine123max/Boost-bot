# Build and deployment / 构建与部署

Normal local and hosted browser access uses **`http://localhost:12000`** or **`http://<server>:12000`**. Other ports below are internal or development-only.

正常本地及部署后的浏览器入口统一为 **12000**。下列其他端口仅用于内部通信或开发调试。

## Toolchain

| Tool | Requirement |
| --- | --- |
| Node.js | 22.13+; 24 LTS recommended |
| pnpm | 10.30.3, pinned by `frontend/package.json` |
| npm | Use checked-in Bot lockfiles with `npm ci` |
| Rust | Current stable; verified with 1.96 |
| Desktop | Tauri 2 CLI and platform prerequisites |
| Containers | Docker with Compose v2, for container builds only |

All commands below start at the repository root unless a working directory is specified.

## Service + Web

```bash
pnpm -C frontend install --frozen-lockfile
node scripts/prepare-boost-bot.mjs
pnpm -C frontend run build:desktop
cargo build --locked --release -p boost-service -p boost-web -p boost-start
```

Launch `target/release/boost-start` (`boost-start.exe` on Windows). It starts Service and Web together. Open **12000**. For a distributable service package, include the three matching binaries and stage the prepared Bot beside them:

```bash
node scripts/stage-boost-bot.mjs <package-directory>
```

The output contains `boost-bot/` with its Node executable, runtime dependencies, UI, skills and notices. Prepare on the target OS/architecture; copying native tools from another platform is not supported.

`boost-web` embeds `frontend/out/` by default. `BOOST_WEB_ROOT` can select an explicit static directory; build the frontend before compiling Web. `BOOST_DB_PATH` and `BOOST_RPC_TOKEN_FILE` should point to writable persistent storage. Relative service paths are resolved against the executable directory.

## Desktop

```bash
cd backend/desktop
cargo tauri dev
cargo tauri build
```

`backend/desktop/tauri.conf.json` points to `../../frontend/out`. Its pre-build hooks prepare Bot and run the frontend script. Installers are written to `backend/desktop/target/release/bundle/`; the root workspace output remains `target/`.

Windows helpers: `scripts/rebuild.ps1`; macOS: `scripts/rebuild-macos.sh`; Linux: `scripts/rebuild-linux.sh`. Use their dry-run options before cleanup-oriented rebuilds. See the scripts themselves for supported arguments.

### Desktop user storage / 桌面用户存储

Desktop builds use `~/.boost` (`C:\Users\<user>\.boost` on Windows). The installer and portable EXE share this directory. No additional environment variables are required.

桌面版统一使用用户主目录下的 `.boost`；安装版与免安装版共用数据，无需新增环境变量。

| Directory | Contents / 内容 |
| --- | --- |
| `data/` | `boost.db`, local RPC credential, installation identity, Bot conversations and owned proxy state / 数据库、RPC 凭据、安装标识、Bot 对话及代理状态 |
| `cache/webview/` | Shared Windows/Linux WebView profile, UI preferences and browser cache / 多窗口共用的 WebView 配置、界面偏好和缓存 |
| `logs/` | Desktop logs and gateway diagnostics / 桌面日志与网关诊断日志 |
| `runtime/bot-runtime/` | Versioned Bot runtime extracted by the portable EXE / 免安装版解包的版本化 Bot 运行时 |
| `updates/` | Downloaded update packages and update state / 更新包与更新状态 |

The first upgraded launch imports existing AppData/XDG application data without initializing or pruning the source database. SQLite snapshots include uncheckpointed WAL transactions, including Bot messages. Existing destination files are not overwritten; a completion marker prevents repeated imports. Legacy database files remain in their original directory. WebView2 profiles, extracted runtimes, logs and update directories move when the destination is absent. Quit the old Boost process before upgrading; a locked profile causes a migration error rather than starting with empty UI preferences.

首次升级会导入原 AppData/XDG 目录的数据，SQLite 快照包含尚未 checkpoint 的 WAL 记录；迁移过程不初始化或清理原数据库。已有目标文件不会覆盖，完成标记防止重复导入。旧数据库保留在原目录；目标不存在时迁移 WebView2 配置、运行时、日志与更新目录。升级前退出旧 Boost；配置目录被占用时会提示迁移失败，避免静默丢失界面偏好。

`BOOST_DB_PATH` and `BOOST_RPC_TOKEN_FILE` still override database and RPC credential paths, with relative paths resolved against the executable. Non-primary desktop identifiers are isolated below `~/.boost/profiles/<identifier>/`. Standalone Service/Web/Docker storage defaults and configured volumes are unchanged. macOS WebKit's native website storage remains OS-managed because WKWebView does not support a custom data directory; Boost-owned data, logs, runtimes and updates use `.boost` on macOS as well.

显式配置的 `BOOST_DB_PATH`、`BOOST_RPC_TOKEN_FILE` 继续生效；相对路径仍相对可执行文件解析。QA 等独立桌面标识使用 `.boost/profiles/<identifier>/`。Service/Web/Docker 的默认路径和持久卷不变。macOS 的 WebKit 原生站点存储由系统管理，其他 Boost 数据、日志、运行时和更新统一放在 `.boost`。

## Development-only ports

| Purpose | Normal mode | Coordinated source development |
| --- | --- | --- |
| User-facing Web | **12000** | 48861, isolated developer gateway |
| Internal service/RPC | 12580 | 48860 |
| Vite HMR | Not used | 3005 |
| Browser regression server | Not used | 3200 by default; `BOOST_TEST_PORT` overrides |

```bash
pnpm -C frontend run dev:full
```

This development helper starts matching binaries and a hot-reload frontend, with isolated development listeners. It does not change the normal application's **12000** entry. A plain Vite server is not a complete service-mode deployment.

## Containers and reverse proxy

```bash
docker compose -f docker/docker-compose.all-in-one.yml config --quiet
docker compose -f docker/docker-compose.all-in-one.yml up --build -d
```

The source-build files use the new `frontend/` and `backend/` paths. See [Docker](../docker/README.md) for split services and persistent volumes. [Nginx](../nginx/README.md) documents the optional TLS reverse proxy and streaming/header requirements.

## Releases

The [release workflow](../.github/workflows/release-all.yml) builds Windows x64 desktop portable EXE and NSIS installer, plus an Apple Silicon macOS DMG, from a version tag. Validate versions first:

```bash
node scripts/check-release-version.mjs v0.5.1
```

After preparing the Bot runtime and frontend on Windows, run `python scripts/package-portable.py` to build `output/Boost_0.5.1_x64.exe`. Pass `--target x86_64-pc-windows-msvc` for an explicit Rust target. The portable Cargo feature embeds the complete Bot runtime inside the native desktop executable; first launch extracts it into the application's versioned runtime cache. No manual extraction or installation is required. Build the NSIS installer before this command, using the normal desktop feature set.

The packaging script sets `BOOST_EMBEDDED_BOT_ARCHIVE` and `BOOST_EMBEDDED_BOT_DIGEST` only for the portable Cargo build. They identify the project-local temporary runtime archive and its SHA-256 cache key; users do not need to configure them when launching the desktop program.

Version fields must match across the root Cargo workspace, native desktop manifest/configuration and frontend package. Build jobs define intended targets; validate platform-specific artifacts before distributing them. Update behavior and release configuration are documented in [中文](zh-CN/release/自动更新与GitHub发布.md) and [English](en/report/app-updates-and-releases.md).

## Verification and screenshots

See [TESTING.md](../TESTING.md). Task-controlled temporary files belong in a dedicated directory under root `tmp/`; set `TEMP`, `TMP` and `TMPDIR` for subprocesses. Documentation screenshots are final assets under `docs/images/`, not disposable test output.
