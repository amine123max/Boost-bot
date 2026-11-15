# Custom HTTP channels / 自定义 HTTP 渠道

In **管理聊天渠道 → 添加渠道 → 自定义**, configure a receiving HTTP(S) URL,
a unique 16–256 character signing secret and, optionally, an outbound API token.
The robot SVG identifies this option. Accounts can be independently named,
enabled and assigned to a default Bot. A real challenge exchange must succeed
before credentials are saved. **测试连接** only verifies; it does not save an account.

在“管理聊天渠道”添加“自定义”，填写接收地址、独立签名密钥和可选的出站 API Token。
接收端须实现以下协议；任意第三方 Webhook 地址不一定兼容，需由桥接服务适配。
HTTP 支持本机桥接，跨网络部署请使用 HTTPS。每个账号使用独立密钥。

## Authentication / 鉴权

Both directions POST UTF-8 JSON with these headers:

```text
Content-Type: application/json
X-Boost-Hook-Timestamp: <Unix seconds>
X-Boost-Hook-Signature: <hex HMAC-SHA256>
```

The HMAC input is `timestamp + "." + raw_request_body_bytes`, signed with the
account secret. Verify the original bytes before parsing JSON, compare signatures
in constant time and reject timestamps outside a five-minute window. Do not
reserialize JSON before checking its signature. Boost sends an optional
`Authorization: Bearer <API Token>` only to the configured receiving URL.
Redirects are rejected; request timeout is 15 seconds and JSON responses are
limited to 64 KiB. Do not put secrets in URLs.

入站路径为界面显示的 `/boost-bot/amb/hooks/custom/<account-key>`。
公网部署在 HTTPS server 中包含
[nginx 示例](../nginx/custom-webhook.conf.example)，由服务器端注入现有 RPC 凭据。
在受限配置文件中定义 `set $boost_custom_rpc_token "<RPC token>";`。
桌面示例固定管理员 actor；服务部署须按实际账号设置 actor，不能信任客户端传入的
actor header。桥接方仅持有账号签名密钥，不持有 Boost RPC token。
该示例不会自动配置域名、TLS 或修改正在运行的 Nginx。

## Verification / 连接验证

Boost sends a signed POST when testing, connecting and starting the account:

```json
{"version":1,"type":"verify","challenge":"<random UUID>"}
```

The receiver verifies its signature and returns HTTP 200:

```json
{"challenge":"<the same UUID>","name":"My bridge"}
```

`name` is optional. Incoming signed `verify` packets are also supported.
An unreachable or incompatible receiving service reports a connection error.

## Incoming messages / 入站消息

POST a signed packet to the account callback:

```json
{"version":1,"type":"message","id":"message-42","chatId":"chat-1","senderId":"user-1","senderName":"Alice","text":"Summarize this document","files":[{"name":"notes.txt","type":"file","base64":"aGVsbG8="}]}
```

`id`, `chatId` and `senderId` are nonempty strings up to 160 characters.
`text` is required, can be empty for a file and is limited to 24,000 characters.
`senderName` and `files` are optional. Up to four base64 attachments, each at
most 512 KiB, are accepted within the total 1 MB callback limit. `type` may be
`image` or `file`. Remote attachment URLs are not fetched.

The response is `{"ok":true}`; a repeated `chatId`/`id` within five minutes
adds `"duplicate":true`. Reuse message IDs when retrying. Acceptance means
queued processing, not completed model execution. The adapter uses the existing
single-chat admission, approvals, Bot routing and durable outbound queue.
The first admitted sender becomes the account owner under existing channel rules;
other senders require permission. No access rights are expanded.

## Outgoing messages / 出站消息

Boost POSTs signed packets to the configured receiving URL:

```json
{"version":1,"type":"message","chatId":"chat-1","text":"The reply","idempotencyKey":"<stable queue key>"}
```

Return `{"ok":true,"id":"<optional platform message ID>"}`. Deduplicate
`idempotencyKey` on the receiver: the durable queue can retry after a lost
acknowledgment. This channel sends complete replies and does not edit messages.

Files are delivered as `{"version":1,"type":"file","chatId":"chat-1","name":"report.txt","base64":"..."}`
with the same `{"ok":true}` response, up to 8 MiB before base64 encoding.
File retries do not currently carry a stable idempotency key; receivers that
need duplicate suppression should retain a bounded chat/name/content digest.
Do not claim exactly-once delivery.

Messages, credentials, owner admission and default Bot binding are isolated by
account key. Disabling an account stops its callbacks; deleting it removes its
channel credentials through the existing account lifecycle.
