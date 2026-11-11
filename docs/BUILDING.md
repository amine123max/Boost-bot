# Build and deployment / 构建与部署

Normal local and hosted browser access uses **`http://localhost:12580`** or **`http://<server>:12580`**. Other ports below are internal or development-only.

正常本地及部署后的浏览器入口统一为 **12580**。下列其他端口仅用于内部通信或开发调试。

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

Launch `target/release/boost-start` (`boost-start.exe` on Windows). It starts Service and Web together. Open **12580**. For a distributable service package, include the three matching binaries and stage the prepared Bot beside them:

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

## Development-only ports

| Purpose | Normal mode | Coordinated source development |
| --- | --- | --- |
| User-facing Web | **12580** | 48861, isolated developer gateway |
| Internal service/RPC | 48760 | 48860 |
| Vite HMR | Not used | 3005 |
| Browser regression server | Not used | 3200 by default; `BOOST_TEST_PORT` overrides |

```bash
pnpm -C frontend run dev:full
```

This development helper starts matching binaries and a hot-reload frontend, with isolated development listeners. It does not change the normal application's **12580** entry. A plain Vite server is not a complete service-mode deployment.

## Containers and reverse proxy

```bash
docker compose -f docker/docker-compose.all-in-one.yml config --quiet
docker compose -f docker/docker-compose.all-in-one.yml up --build -d
```

The source-build files use the new `frontend/` and `backend/` paths. See [Docker](../docker/README.md) for split services and persistent volumes. [Nginx](../nginx/README.md) documents the optional TLS reverse proxy and streaming/header requirements.

## Releases

The [release workflow](../.github/workflows/release-all.yml) builds Windows x64 desktop portable EXE and NSIS installer, plus an Apple Silicon macOS DMG, from a version tag. Validate versions first:

```bash
node scripts/check-release-version.mjs v0.5.0
```

After preparing the Bot runtime and frontend on Windows, run `python scripts/package-portable.py` to build `output/Boost_0.5.0_x64.exe`. Pass `--target x86_64-pc-windows-msvc` for an explicit Rust target. The portable Cargo feature embeds the complete Bot runtime inside the native desktop executable; first launch extracts it into the application's versioned runtime cache. No manual extraction or installation is required. Build the NSIS installer before this command, using the normal desktop feature set.

The packaging script sets `BOOST_EMBEDDED_BOT_ARCHIVE` and `BOOST_EMBEDDED_BOT_DIGEST` only for the portable Cargo build. They identify the project-local temporary runtime archive and its SHA-256 cache key; users do not need to configure them when launching the desktop program.

Version fields must match across the root Cargo workspace, native desktop manifest/configuration and frontend package. Build jobs define intended targets; validate platform-specific artifacts before distributing them. Update behavior and release configuration are documented in [中文](zh-CN/release/自动更新与GitHub发布.md) and [English](en/report/app-updates-and-releases.md).

## Verification and screenshots

See [TESTING.md](../TESTING.md). Task-controlled temporary files belong in a dedicated directory under root `tmp/`; set `TEMP`, `TMP` and `TMPDIR` for subprocesses. Documentation screenshots are final assets under `docs/images/`, not disposable test output.
