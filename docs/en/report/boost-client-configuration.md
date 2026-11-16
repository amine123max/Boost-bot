# Client configuration

[简体中文](../../zh-CN/report/Boost客户端配置.md) · [Configuration](../../CONFIGURATION.md)

## Credentials and endpoints

Create a platform key in Boost. Clients use this key, not an upstream provider secret or the internal RPC credential. New keys are 64 random hexadecimal characters without a prefix; existing keys remain compatible.

| Setting | Local default | Meaning |
| --- | --- | --- |
| Model Base URL | `http://localhost:12580/v1` | Service inference gateway |
| Browser entry | `http://localhost:12000` | Web management |
| Client secret | User-created platform key | Authorized model access |
| Model ID | Configured platform model | Must have an eligible source mapping |

Use the runtime address and available model shown by Boost when ports or remote deployment differ. Verify one authorized request and inspect its model, source and status in request logs.

## Codex CLI

Set `BOOST_API_KEY` in the terminal that launches Codex. Merge the following structure into the existing user configuration and replace the model with an available ID:

```toml
model_provider = "Boost"
model = "YOUR_AVAILABLE_MODEL"

[model_providers.Boost]
name = "Boost"
base_url = "http://localhost:12580/v1"
wire_api = "responses"
env_key = "BOOST_API_KEY"
requires_openai_auth = false
```

The provider identifier is case-sensitive. The normal file is `~/.codex/config.toml`, or the configured Codex home. The in-app configuration guide can copy examples using the active address. These placeholders describe user configuration; they are not a runnable model fixture or a distributed secret.

## Model sources and prices

Account pools and aggregate connections own their mappings separately. Remote discovery must use the selected source. Aggregate discovery does not create account-pool assignments, and warmup uses the target account's upstream model.

Official price synchronization updates each provider independently and preserves custom rules and the last successful result on failure. Displayed USD costs are estimates. TokenRhythm quotations use the configured supported models and a dated CNY/USD reference rate; missing/invalid quotations retain prior values. Image, audio, tools and other non-text charges require the provider bill.

## Other clients and images

OpenAI-compatible clients use the gateway Base URL, platform key and a routed model. Responses, Chat Completions, image generation and image editing depend on upstream support. Multipart image edits retain uploaded bytes; streaming image events require a compatible upstream. A configured text action must not silently replace an image route.

Sources: [client configuration reference](https://developers.openai.com/codex/config-reference/) for Codex fields; Boost behavior is defined by [typed clients](../../../frontend/src/lib/api/) and [gateway adapters](../../../backend/service/src/gateway/).
