# Bot FastAPI 接入层

[English](README.md) · [系统架构](../../../ARCHITECTURE.zh-CN.md)

## 数据流与边界

`Nginx → FastAPI → Boost Web 会话鉴权 → Rust 服务 → 按 actor 隔离的 Node Bot`。

FastAPI 提供有界异步入口，不拥有会话数据、计费或数据库，不替代有状态 Node 智能体。桌面继续使用受管 loopback Rust/Node，不依赖 Python。

## 启动

容器使用基础 Compose 与 overlay：

```sh
docker compose -f docker/docker-compose.yml -f docker/docker-compose.bot-api.yml up -d --build
```

非容器环境需要 Python 3.11+，在独立环境安装同目录 `requirements.txt`，从仓库根目录运行：

```sh
uvicorn bot.backend.api.app:app --host 127.0.0.1 --port 12001 --workers 2 --no-access-log --timeout-keep-alive 65
```

默认目标为 Boost Web 12000；不同网络使用进程环境配置固定可信来源，不能接受客户端指定目标。启用 Nginx Bot 路由前先启动 sidecar。

## 配置

| 变量 | 类型 | 默认值 | 必填 | 作用 |
| --- | --- | --- | --- | --- |
| `BOT_API_UPSTREAM` | HTTP(S) origin | `http://127.0.0.1:12000` | 否 | 可信 Boost Web |
| `BOT_API_CONCURRENCY` | 整数 | `256` | 否 | 每 worker 活跃数，SSE 持有到结束 |
| `BOT_API_QUEUE_SIZE` | 整数 | `512` | 否 | 等待上限 |
| `BOT_API_QUEUE_TIMEOUT` | 秒 | `15` | 否 | 排队期限 |
| `BOT_API_MAX_BODY_BYTES` | 字节 | `33554432` | 否 | 单体上限 |
| `BOT_API_BODY_BUDGET_BYTES` | 字节 | `67108864` | 否 | 每 worker 缓冲预算 |

每 worker 独立，Nginx 的 512 Bot 连接上限另计。扩大限额不会扩大上游模型配额。

## 传输与安全

保留原始请求体、query 和响应字节，包括 SSE/压缩；目标 Host 来自可信配置。剥离客户端内部 RPC token/actor 头，沿用 Boost Web 的会话检查。请求体在发送前有界读取，超大上传不应部分执行变更。断连释放上游连接及准入/缓冲预留。写请求不自动重投。

部署示例关闭访问日志，避免一次性启动参数进入日志。Nginx 关闭相关缓冲、压缩及上游重放，长流使用独立空闲期限。

## 验证

检查 `/healthz`、有效/无效会话、SSE、取消、容量拒绝和超大体；生产 DNS/TLS、渠道和模型需在目标环境使用有效凭据验证。
