# 容器部署

[English](README.md) · [构建](../docs/BUILDING.zh-CN.md) · [Nginx](../nginx/README.zh-CN.md)

## 部署方式

| 文件 | 用途 |
| --- | --- |
| `docker-compose.all-in-one.yml` | 从源码将 Service、Web 和 Bot 打包到一个容器 |
| `docker-compose.yml` | 从源码分别构建 Service 与 Web |
| `docker-compose.bot-api.yml` | 可选 FastAPI Bot 入口 overlay |
| `docker-compose.release.yml` | 使用显式版本标签的既有镜像 |
| 根目录 `docker-compose.yml` | 独立镜像示例，不是当前源码构建 |

## 源码构建

需要 Docker、Compose v2 以及构建依赖下载网络。在仓库根目录执行：

```sh
docker compose -f docker/docker-compose.all-in-one.yml config --quiet
docker compose -f docker/docker-compose.all-in-one.yml up --build -d
```

访问 `http://localhost:12000`，确认管理页或登录页可见。Bot 原生依赖必须匹配目标 OS、架构和 Node ABI，准备脚本会验证 SQLite 扩展。

## 持久化与加密

`boost-data` 命名卷保存 `/data`，更新时保留该卷。分离服务共享数据库及内部凭据卷；启用 SQLCipher 时还需一致的密钥来源。

无界面加密使用只读挂载的私有密钥文件，在每个打开主库的进程中将 `BOOST_DB_KEY_FILE` 指向对应容器路径。真实密钥不能写进 Compose、镜像层或 Git。转换已有明文库需要独占维护启动，先停其他数据库使用者。持久卷不等于备份。

## 网络与生命周期

容器内部显式监听网络接口，宿主发布端口与 Nginx 决定外部可达性，分别审查 12000/12580。Compose 内使用服务 DNS，不能使用其他容器的 loopback。

容器重启策略负责容器恢复，原生启动器只守护自己创建的子进程，避免无关多层 supervisor。计算机控制工具另需图形环境与权限。

## 验收

覆盖 Compose 语法、镜像构建、持久化重启、密钥可用性、登录/角色、模型 JSON/SSE、断连清理和过载。Nginx/TLS 在目标部署验证；Windows 下的语法检查不代表 Linux 镜像或外部上游通过。
