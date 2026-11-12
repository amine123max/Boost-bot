# Docker deployment / 容器部署

[Project](../README.md) · [中文首页](../README.zh-CN.md) · [Build guide](../docs/BUILDING.md)

The Dockerfiles build `frontend/`, `backend/` and the prepared `bot/` runtime from this checkout. The user-facing Web port is **12000**.

Dockerfile 从当前源码构建前端、后端和 Bot 运行时，用户访问端口为 **12000**。

| File | Purpose / 用途 |
| --- | --- |
| `docker-compose.all-in-one.yml` | Source-built Service + Web + Bot in one container / 一体化源码构建 |
| `docker-compose.yml` | Separate source-built Service and Web containers / 分离式源码构建 |
| `docker-compose.release.yml` | Existing registry images; set `BOOST_RELEASE_TAG` / 既有镜像部署 |
| `Dockerfile.*.release` | Wrap already-built binaries / 预构建二进制镜像 |

From the repository root:

```bash
docker compose -f docker/docker-compose.all-in-one.yml config --quiet
docker compose -f docker/docker-compose.all-in-one.yml up --build -d
```

Open `http://localhost:12000`. The named `boost-data` volume persists `/data`; retain it across container updates. `BOOST_DB_PATH` and `BOOST_RPC_TOKEN_FILE` point into this volume. Split deployments share the same data/token volume.

访问 `http://localhost:12000`。`boost-data` 命名卷持久化 `/data`，更新容器时保留该卷；数据库和 RPC Token 位于其中。分离式部署需要共享数据和 Token 卷。

The root `docker-compose.yml` is a separate registry-image example, not a source build. Its image tag and registry are deployment choices; it is not a substitute for validating the current checkout's build.

根目录 Compose 是独立的既有镜像示例，不从当前源码构建。其仓库与标签属于部署配置，不代表当前源码已经验证。

For TLS and streaming requirements see [Nginx](../nginx/README.md). Native tools in containers require compatible OS/architecture; computer-control features require a usable graphical environment.
