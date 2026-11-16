# Provider challenge diagnosis

[简体中文](../../zh-CN/report/service部署出现Cloudflare%20403错误修复说明.md) · [Network configuration](environment-and-runtime-config.md)

## Classify the response

A 403 can indicate expired/invalid credentials, model authorization, geographic policy, proxy failure or a provider/WAF challenge. Inspect status, content type, redacted provider error and challenge indicators before changing transport.

| Evidence | Interpretation |
| --- | --- |
| JSON auth error | Check the selected account/key and refresh state |
| Explicit regional restriction | Check provider support and deployment location |
| HTML challenge | Network/provider challenge; not a valid model JSON response |
| Local proxy failure | Validate the configured source-specific route |
| Loopback intercepted | Correct local routing before touching upstream behavior |

Do not bypass provider account, regional or access restrictions. A successful browser request is not proof that the same account/API operation is supported from a server.

## Existing optional helpers

The repository contains curl_cffi and WARP troubleshooting helpers under scripts. They are optional system/network configuration tools, not default application startup and not a guaranteed solution to provider denials. Read each script and review its host/network effects before use.

If using an authorized local HTTP bridge, bind it to loopback, retain authentication, avoid logging credentials, configure the service's trusted upstream explicitly and test cancellation/SSE/body limits. Do not expose an unauthenticated credential-forwarding proxy publicly.

## Acceptance and reporting

Compare direct/configured-proxy behavior with the same authorized operation, record source/transport/error timing and verify that failure never silently falls back to an unintended direct route. Keep logs redacted and separate local fixtures from real provider acceptance.

Relevant implementation: [proxy policy](../../../backend/service/src/proxy_policy.rs), [upstream transport](../../../backend/service/src/gateway/upstream/attempt_flow/transport.rs), [runtime guide](../../CONFIGURATION.md).
