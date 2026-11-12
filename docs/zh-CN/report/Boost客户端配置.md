# Boost 客户端配置

在「密钥」创建平台密钥。上游提供商密钥只用于「聚合 API」连接，客户端填写 Boost 生成的平台密钥。新平台密钥为无前缀的 64 位随机十六进制字符串；已有密钥仍可使用。

## Codex CLI

在 PowerShell 中设置当前终端环境变量：

```powershell
$env:BOOST_API_KEY = '平台密钥'
```

macOS / Linux：

```bash
export BOOST_API_KEY='平台密钥'
```

把 `平台密钥` 替换成完整密钥。以上命令只影响当前终端；需要长期使用时，在用户环境变量或终端配置文件中设置同名变量，再重新打开终端。

编辑 `~/.codex/config.toml`，Windows 为 `%USERPROFILE%\.codex\config.toml`。设置了 `CODEX_HOME` 时使用该目录。将以下内容合并到已有配置，把模型 ID 换成模型目录中实际可用的模型：

```toml
model_provider = "Boost"
model = "填入模型 ID"

[model_providers.Boost]
name = "Boost"
base_url = "http://localhost:12580/v1"
wire_api = "responses"
env_key = "BOOST_API_KEY"
requires_openai_auth = false
```

`model_provider` 与 `[model_providers.Boost]` 中的标识大小写须一致。修改过服务地址时同步修改 `base_url`。从已设置环境变量的终端运行 `codex`，发送一次请求，再在 Boost「日志」检查模型、来源与状态。

软件内「密钥 → 配置方法」及「设置 → 高级设置 → 配置方法」可复制当前地址和模型对应的示例；创建密钥后可直接打开含实际密钥的配置指引。

## 其他客户端

选择 OpenAI 兼容提供商，Base URL 填 `http://localhost:12580/v1`，API Key 填平台密钥，并选择已配置路由的模型。使用 SDK 时从 `BOOST_API_KEY` 环境变量读取密钥。管理 RPC 的认证凭据与平台密钥用途不同。

## 模型与官方价格

- 在「聚合 API」快速配置 GPT、DeepSeek、Gemini、Claude，填入各自上游密钥。兼容服务可使用自定义地址。
- 在「模型 → 并入远端模型」选择模型来源及一个或多个连接。GPT / DeepSeek 使用兼容模型列表，Gemini 和 Claude 使用原生分页列表；导入失败显示具体连接错误。
- 在「模型 → 模型计费」同步 OpenAI、Gemini、Claude 官网价格，可选择单个提供商或全部同步，也可维护自定义价格。每家提供商独立更新，下载或解析失败保留上次成功结果。自定义价格不会被覆盖。
- 每个聚合 API 连接的「导入模型」可从远端或供应商模板并入模型，也可手动添加和维护共享模板；模型池中的「管理绑定」可直接进入模型目录，维护调用来源、优先级、权重及计费模型。
- 模型目录的远端并入默认选择账号池，并按每个所选账号分别拉取。聚合 API 在自己的模型池中使用「拉取远端模型」；请求路径即使配置为图片生成或编辑，模型拉取仍访问模型列表端点。
- 不再安装或使用内置价格。未同步的模型、未发布的服务档位显示价格缺失。官网文本 token 价格用于估算，图片、音频、工具、存储、区域及其他特殊计费需以提供商账单为准。
- Gemini 采用 Standard 价格，按官网生效日期及上下文分档；Claude 同步 Standard 输入、输出、缓存读取和缓存写入价格；OpenAI 同步官网提供的 Standard / Flex / Fast / Ultrafast 档位。

配置字段依据：[Codex 官方配置参考](https://developers.openai.com/codex/config-reference/)。价格来源：[OpenAI](https://developers.openai.com/api/docs/pricing)、[Gemini](https://ai.google.dev/gemini-api/docs/pricing)、[Claude](https://platform.claude.com/docs/en/about-claude/pricing)。

## 聚合 API 图片调用

为 OpenAI 兼容上游配置正确的基础地址并拉取图片模型后，使用 Boost 平台密钥调用以下路径：

- 图片生成：`POST /v1/images/generations`，使用上游支持的 JSON 参数。
- 图片编辑：`POST /v1/images/edits`，支持 JSON 以及带原始图片文件的 `multipart/form-data`。
- 流式图片响应会保留上游图片 SSE 事件。

「聚合 API → 高级配置 → 快捷请求路径」可以选择自动跟随客户端请求、图片生成、图片编辑或自定义路径。设置中的文本端点不会把图片请求改写成文本请求；自定义图片端点仍按显式配置调用。图片模型和参数需由实际接入的上游支持。
