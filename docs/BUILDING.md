# Build and deployment

[简体中文](BUILDING.zh-CN.md) · [Architecture](../ARCHITECTURE.md) · [Configuration](CONFIGURATION.md)

## Toolchain

| Tool | Requirement |
| --- | --- |
| Node.js | 22.13+; 24 LTS recommended, matching the bundled Bot ABI |
| pnpm | 10.30.3, pinned by frontend metadata |
| Rust | Current stable; local validation uses 1.96 |
| Native build | C/C++ compiler, CMake, Perl and platform SDK |
| Desktop CLI | Tauri 2 CLI |
| Containers | Docker and Compose v2 |
| Optional Bot ingress | Python 3.11+ |

### Platform dependencies / 系统依赖

| Platform | Dependencies |
| --- | --- |
| Windows | Visual Studio Build Tools with C++ Desktop workload, MSVC, Windows SDK; WebView2 for desktop |
| Windows SQLCipher | Native Strawberry Perl for vendored OpenSSL; MSYS Perl is not a substitute |
| macOS | Xcode Command Line Tools; build and prepare Bot on the target architecture |
| Linux service | C/C++, CMake, Perl, pkg-config; supported native dependencies and private writable data |
| Linux desktop | Service toolchain plus Tauri 2 WebKitGTK 4.1, GTK 3, librsvg and indicator development packages |

The build includes SQLite/SQLCipher and vendored crypto; no database server is required. The Bot SQLite binding is native: prepare dependencies on the target OS/architecture and Node ABI. Required dependency/tool downloads need network access.

## Service and Web

Run from the repository root:

```sh
pnpm -C frontend install --frozen-lockfile
node scripts/prepare-boost-bot.mjs
pnpm -C frontend run build:desktop
cargo build --locked --release -p boost-service -p boost-web -p boost-start
```

Launch `target/release/boost-start` (`.exe` on Windows). Open `http://localhost:12000`; verify the management/login page. Service model traffic normally uses 12580. Model acceptance requires an authorized source and key.

Web embeds `frontend/out` by default, so rebuild Web after changing static assets. `BOOST_WEB_ROOT` can select an explicit UI directory. A plain Vite server does not provide the Web session/RPC runtime.

For a service package, ship the three matching binaries and stage the prepared Bot:

```sh
node scripts/stage-boost-bot.mjs output/service
```

Prepare that runtime on the destination OS/architecture. The package includes Node, native SQLite, tools, UI, skills and notices.

## Desktop

From the independent desktop package:

```sh
cd backend/desktop
cargo tauri dev
cargo tauri build
```

Hooks prepare Bot and static UI. Tauri references `../../frontend/out`; installers are written under the desktop target bundle directory. Desktop keeps its own Cargo.lock and target; the root service workspace is separate.

Use the existing Windows/macOS/Linux rebuild helpers only after reading their supported options. Do not use cleanup-oriented rebuilds to terminate a user's running instance or remove unrelated outputs.

## Desktop user storage / 桌面用户存储

| Directory below `~/.boost` | Contents |
| --- | --- |
| `data/` | Main database, local credentials, installation identity and default Bot data |
| `cache/webview/` | Shared Windows/Linux WebView profile and UI preferences |
| `logs/` | Desktop and gateway diagnostics |
| `runtime/bot-runtime/` | Content-versioned shared runtime |
| `updates/` | Update payloads and state |

Installer and portable Windows builds share this layout. Explicit database/token paths retain priority. Profile identifiers isolate non-primary builds. Standalone Service/Web use executable-relative defaults or configured volumes. macOS native WebKit website storage remains OS-managed.

Legacy application-data migration preserves existing destination files and uses completion markers. It is distinct from SQLCipher conversion. Close old instances first; an occupied profile or encrypted database must not be treated as an empty store.

## Storage encryption

Enable main encryption explicitly in Settings or configure a private `BOOST_DB_KEY_FILE` before startup. The desktop credential provider stores the key outside the database. Multiple Service/Web processes must use the same provider; headless containers normally use a read-only mounted secret.

Conversion requires exclusive access, verifies encrypted staging data and replaces the original only on success. It does not create an automatic backup. Wrong/missing keys fail startup. Bot keys are independently derived per actor; existing Bot data converts on next host startup. Files outside the databases remain outside this coverage.

## Development and containers

```sh
pnpm -C frontend run dev:full
```

The coordinated helper uses isolated development listeners: service 48860, Web 48861 and Vite 3005. Normal application entry remains 12000.

```sh
docker compose -f docker/docker-compose.all-in-one.yml config --quiet
docker compose -f docker/docker-compose.all-in-one.yml up --build -d
```

See [Docker](../docker/README.md) and [Nginx](../nginx/README.md) for persistent volumes, network exposure, TLS and stream handling.

## Release artifacts

The [release workflow](../.github/workflows/release-all.yml) builds Windows x64 portable EXE/NSIS and macOS arm64 DMG. Match all version fields to the release tag with `scripts/check-release-version.mjs`.

The portable build embeds the complete prepared runtime; `scripts/package-portable.py` produces the EXE. Runtime archive identity is content-derived, so unchanged runtime files reuse the cache. Active older runtimes are retained while referenced; runtime cache cleanup does not remove databases or workspaces.

Release publishing signs `update-manifest.json` using the repository signing secret. Its public verifier is bundled in the client. Signature, target, tag, source commit, size and digest are checked before applying an update. All three desktop artifacts are required for a complete signed release; do not use a partial portable-only refresh to produce a mixed-source release.

## Verification

Run the scope-specific checks in [TESTING.md](../TESTING.md). Keep disposable scripts, data, subprocess TEMP/TMP/TMPDIR and package caches in a task-specific project `tmp/`. Preserve deliverables outside tmp before cleanup. Record platform/package tests that could not run on the current host.

## Validation record

On Windows x64, 2026-11-16: frontend and Bot builds, workspace Rust tests (512 passed/3 ignored), Web (18), native check, storage (11), updater (18) and isolated Web settings acceptance passed. Public-document pairing/relative links and Compose configuration passed.

Docker image builds were not executed because the local daemon was unavailable (dockerDesktopLinuxEngine pipe missing). Nginx was not installed, so nginx -t was not executed. macOS/Linux package execution, production TLS and real-provider/channel acceptance require their target environments. Target-host release CI builds do not constitute manual installer acceptance.
