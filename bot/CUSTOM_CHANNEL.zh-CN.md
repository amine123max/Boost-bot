# 自定义 HTTP 渠道协议

[English](CUSTOM_CHANNEL.md) · [Bot 集成](INTEGRATION.zh-CN.md) · [Nginx](../nginx/README.zh-CN.md)

## 配置与身份

每个渠道账号配置独立名称、接收 HTTP(S) URL、16–256 字符签名密钥及可选出站 API token。首次保存需完成真实 challenge；测试连接只验证，不保存。平台/账号启停和默认 Bot 独立管理。

跨网络使用 HTTPS。桥接方仅持渠道签名密钥，不能取得内部 Boost RPC token；服务部署由可信代理按账号归属选择 actor，不接受公共身份头。

## 签名

双向 POST 使用 UTF-8 JSON：

| 请求头 | 值 |
| --- | --- |
| Content-Type | application/json |
| X-Boost-Hook-Timestamp | Unix 秒 |
| X-Boost-Hook-Signature | HMAC-SHA256 十六进制 |

签名输入为 `timestamp + "." + 原始请求体字节`，使用账号签名密钥。先验证原始字节，再解析 JSON；使用常量时间比较，拒绝超过五分钟的时间差，不能重新序列化后验证。

可选 Bearer token 只发送到配置的接收 URL。拒绝跳转，15 秒请求期限，JSON 响应最大 64 KiB；秘密不放入 URL。

## Challenge

Boost 发送带 version=1、type=verify 和随机 challenge 的签名 JSON；接收方验证后返回 HTTP 200 及完全相同的 challenge，可附 name。启动、测试和连接均使用该验证，失败不能冒充已连接。

## 入站消息

回调路径由界面展示，结构包含 version、type=message、id、chatId、senderId、text，以及可选 senderName/files。标识为非空且最多 160 字符，文本最多 24,000 字符；支持最多四个 Base64 附件，每个 512 KiB，总回调上限 1 MB。不抓取远程附件 URL。

同 chatId/id 在当前五分钟去重窗内重复时幂等确认，不产生第二个任务；成功表示已接收排队，不代表模型已完成。首个获准发送者按渠道既有规则成为账号所有者，其他发送者需要授权。

跨重启持久防重放与轮换的新增约定由 T13 跟踪，不能将当前内存时间窗描述为永久防重放。

## 出站与文件

出站文本包含 version、type=message、chatId、text 和稳定 idempotencyKey。接收方按该 key 去重，返回 ok 以及可选平台消息 ID；丢失确认后持久 outbox 可重试。当前渠道发送完整回复，不编辑既有消息。

文件包含 type=file、chatId、name 和 Base64 内容，编码前最大 8 MiB。按相同成功响应确认。原始负载、错误与限额的具体字段以[英文协议](CUSTOM_CHANNEL.md)及[实现](backend/src/channels/messenger/custom.ts)为准。

## 部署验证

使用[签名回调示例](../nginx/custom-webhook.conf.example)，内部凭据放受限服务器配置。验证 challenge、合法消息、错密钥、篡改、时间偏差、重复、未知账号、附件上限和出站去重。普通模型/管理凭据不能替代渠道签名。
