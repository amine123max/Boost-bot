# Importing an existing ChatGPT session

[简体中文](../../zh-CN/report/不登陆Codex使用ChatGPT-auth-session导入账号.md) · [Account configuration](boost-client-configuration.md)

## Preconditions

Use only a session you are authorized to access. The JSON returned by [ChatGPT session information](https://chatgpt.com/api/auth/session) contains sensitive credentials. Do not post it to issues, chat, screenshots or diagnostic logs.

An imported access token can expire without a refresh token. Built-in authorization is preferable when long-term refresh is required; importing a browser session does not create refresh capability that the provider did not supply.

## Import

1. Open the session endpoint in the browser already signed in to ChatGPT.
2. Copy the complete JSON response.
3. In Boost Accounts, open account import and choose batch import.
4. Paste the response, import and refresh usage/status.
5. If import fails, inspect the redacted error rather than sending the source JSON to another person.

## Accepted structures

| Input | Interpretation |
| --- | --- |
| CamelCase token fields | Access/refresh/ID tokens and account identifiers |
| Underscore token fields | Equivalent imported credential fields |
| Nested token/credentials/auth records | Recognized compatible export structures |
| ChatGPT user/account records | Identity metadata |
| sub2api data/bundle | Accounts extracted from the documented credentials collection |
| Access-token-only accounts | Usable until expiry, without guaranteed refresh |

No field renaming is required for a supported complete export. The importer prefers account/user identity and otherwise uses a token fingerprint to avoid importing the same credential repeatedly.

## Troubleshooting

An HTML/login response indicates an absent or expired browser session or a network interception. Malformed JSON usually indicates an incomplete copy. Imported but later unavailable accounts can have expired access tokens without refresh credentials. Reauthorize or import a fresh session; do not bypass provider authorization checks.

Implementation: [account import](../../../backend/service/src/account/account_import.rs). Configuration and key scope are described in [client configuration](boost-client-configuration.md).
