# 构建与部署

[English](BUILDING.md) · [架构](../ARCHITECTURE.zh-CN.md) · [配置](CONFIGURATION.zh-CN.md)

## 工具链

| 工具 | 要求 |
| --- | --- |
| Node.js | 22.13+，推荐 24 LTS，与内置 Bot ABI 匹配 |
| npm | Bot 依赖安装使用 11.6.2，与本地验证及发行工具链一致 |
| pnpm | 10.30.3，按前端元数据固定 |
| Rust | 当前稳定版，本地验证使用 1.96 |
| 原生构建 | C/C++、CMake、Perl 与平台 SDK |
| 桌面 CLI | Tauri 2 |
| 容器 | Docker 与 Compose v2 |
| 可选 Bot 入口 | Python 3.11+ |

## 系统依赖

| 平台 | 依赖 |
| --- | --- |
| Windows | Visual Studio Build Tools C++ 桌面工作负载、MSVC、Windows SDK；桌面需 WebView2 |
| Windows SQLCipher | vendored OpenSSL 需要原生 Strawberry Perl，不能以 MSYS Perl 替代 |
| macOS | Xcode Command Line Tools，在目标架构准备 Bot 并构建 |
| Linux 服务 | C/C++、CMake、Perl、pkg-config，兼容原生依赖及私有可写数据目录 |
| Linux 桌面 | 另需 Tauri 2 的 WebKitGTK 4.1、GTK 3、librsvg 和托盘开发包 |

构建包含 SQLite/SQLCipher 和 vendored 密码库，不需要数据库服务器。Bot SQLite 是原生扩展，必须匹配目标 OS、架构和 Node ABI。依赖及工具下载需要网络。

## Service 与 Web

从仓库根目录执行：

```sh
npm install --global npm@11.6.2
pnpm -C frontend install --frozen-lockfile
node scripts/prepare-boost-bot.mjs
pnpm -C frontend run build:desktop
cargo build --locked --release -p boost-service -p boost-web -p boost-start
```

运行 `target/release/boost-start`，Windows 使用 `.exe`。打开 `http://localhost:12000`，验证管理页或登录页；模型服务默认使用 12580，调用验收另需有效上游和平台 key。

Web 默认嵌入 `frontend/out`，静态资源变更后需重新构建 Web；`BOOST_WEB_ROOT` 可指定目录。普通 Vite 服务不包含 Web 会话/RPC 运行时。

分发服务包时附带三个匹配版本的程序，并准备 Bot：

```sh
node scripts/stage-boost-bot.mjs output/service
```

在目标 OS/架构执行准备，产物包含 Node、原生 SQLite、工具、UI、技能和声明。

## 桌面应用

进入独立桌面包：

```sh
cd backend/desktop
cargo tauri dev
cargo tauri build
```

构建 hook 准备 Bot 和前端。Tauri 指向 `../../frontend/out`，安装包位于桌面 target 的 bundle 目录；桌面保留独立 Cargo.lock 和 target，根服务工作区分别构建。

重建脚本按平台提供，先阅读参数。不借清理式重建结束用户正在运行的实例或删除无关产物。

## 桌面数据布局

| `~/.boost` 子目录 | 内容 |
| --- | --- |
| `data/` | 主库、本地凭据、安装标识及默认 Bot 数据 |
| `cache/webview/` | Windows/Linux 共用 WebView 配置和界面偏好 |
| `logs/` | 桌面与网关诊断 |
| `runtime/bot-runtime/` | 按内容版本共享的运行时 |
| `updates/` | 更新载荷与状态 |

Windows 安装版和便携版共用该布局；显式数据库/令牌路径优先，非主 profile 按标识隔离。独立 Service/Web 使用程序相对默认路径或持久卷。macOS WebKit 网站存储仍由系统管理。

旧应用目录迁移保留已有目标文件并使用完成标记，与 SQLCipher 转换是不同流程。先关闭旧实例；被占用或加密的库不能被误判为空库。

## 存储加密

通过设置页显式启用，或在启动前配置私有 `BOOST_DB_KEY_FILE`。桌面凭据库独立于数据库保存密钥。多个 Service/Web 进程必须采用同一来源；无界面容器通常只读挂载 secret。

转换需要独占访问，校验加密暂存数据后才替换原库，不创建自动备份。错/缺密钥使启动失败。Bot 按身份派生独立密钥，既有数据在对应宿主下次启动时转换；数据库以外的文件不受该加密覆盖。

## 开发与容器

```sh
pnpm -C frontend run dev:full
```

联合开发使用独立监听：服务 48860、Web 48861、Vite 3005。正常应用入口仍为 12000。

```sh
docker compose -f docker/docker-compose.all-in-one.yml config --quiet
docker compose -f docker/docker-compose.all-in-one.yml up --build -d
```

持久卷、网络暴露、TLS 与流式代理见 [Docker](../docker/README.zh-CN.md) 和 [Nginx](../nginx/README.zh-CN.md)。

## 发布产物

[发布工作流](../.github/workflows/release-all.yml)构建 Windows x64 便携 EXE/NSIS 和 macOS arm64 DMG。通过 `scripts/check-release-version.mjs` 核对全部版本与 tag。

便携打包由 `scripts/package-portable.py` 内嵌完整运行时。归档身份按文件内容计算，未变资源复用缓存。仍被进程引用的旧运行时保留，缓存清理不删除数据库或工作目录。

发布端使用仓库 Secret 签署 `update-manifest.json`，客户端内置公开验证密钥，应用更新前核对签名、目标、tag、源提交、大小与摘要。完整签名发布需要三个桌面产物，不能用只刷新便携版拼接不同源码的发行版。

## 验证

按[验证说明](../TESTING.zh-CN.md)执行。一次性脚本、数据、子进程 TEMP/TMP/TMPDIR 和下载缓存放入任务专属项目 `tmp/`，交付保存到外部后再清理。记录当前主机不能执行的平台和安装包验收。

## 本地验证记录

2026-11-16，Windows x64：前端构建、Bot 构建、Rust 工作区（512 通过/3 忽略）、Web 18 项、桌面原生 check、存储 11 项、更新器 18 项和隔离 Web 设置运行验证通过。公共文档配对/相对链接及 Compose 配置通过。

本机 Docker daemon 未运行（dockerDesktopLinuxEngine 管道不存在），因此没有执行 Docker 镜像构建；未安装 Nginx，未执行 nginx -t。macOS/Linux 安装包运行与真实 TLS/提供商/渠道凭据验收不在此 Windows 检查结果内。发布 CI 在各目标宿主构建，不能视为人工安装验收。
