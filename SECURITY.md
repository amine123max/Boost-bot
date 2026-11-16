# Security

[简体中文](SECURITY.zh-CN.md) · [Architecture](ARCHITECTURE.md) · [Hardening plan](update.md)

## Reporting

Report account-token leaks, authorization bypass, cross-actor access, unsafe updates, sandbox failures and exploitable resource exhaustion privately through the repository owner's published contact or an established private channel. A public issue should contain impact and affected versions only, without live secrets or a reusable exploit.

Include the version/commit, runtime mode, platform, prerequisites, minimal reproduction, expected/actual behavior and redacted evidence. Findings are assessed and fixed according to reproducibility and impact; no unverified response-time guarantee is stated.

## Trust boundaries

| Boundary | Enforcement |
| --- | --- |
| Web session | Server derives role and actor; client headers cannot choose identity |
| Internal RPC | Dedicated internal credential plus trusted actor context |
| Model access | Platform key, ownership, model access and local billing/quota policy |
| Bot | Actor-scoped process/data and authorized model key |
| Public callback | Per-account signature, time window and deduplication |
| Storage | Local filesystem ownership; optional main SQLCipher and per-actor encrypted Bot storage |
| Updates | Fixed source and current updater checks; signing hardening tracked separately |

An authenticated administrator is privileged. Local users who control application files or the running process are outside the protection provided by role checks or at-rest encryption. Directory restrictions and application approvals are not a complete OS sandbox.

## Storage and key handling

Default builds include SQLCipher; encryption is enabled explicitly through Settings or bootstrap configuration. Existing plain databases remain compatible. Desktop keys use the OS credential store; headless deployments can use a restricted explicit key file. Missing/wrong keys fail startup without generating a replacement or initializing an empty database.

Encrypted main storage derives independent per-actor Bot keys. A Bot converts its existing database on its next managed start. Workspace files, logs, configuration files and exports are not automatically encrypted. Preserve the original key for recovery; a database file alone is insufficient. No automatic backups or automatic restore are enabled by these changes.

## Deployment

Local mode uses loopback by default; explicit environment and saved bind mode can expose listeners. Review Docker published ports and Nginx upstreams, terminate TLS where appropriate and retain authentication on every entrypoint. Do not publish internal RPC tokens or permit caller-selected actor headers.

Capacity controls are process-local. They bound admission and buffered input but cannot guarantee responsiveness under unlimited traffic or OS-level resource exhaustion. Monitor overload, disk capacity and effective configuration.

## Redaction and release checks

Do not commit databases, private keys, passwords, Authorization/Cookie headers, access/refresh/ID tokens, internal RPC credentials or platform keys. Redact URLs containing secrets and diagnostic SQL. Preserve [licenses and notices](bot/THIRD_PARTY_NOTICES_en.md).

Release checks cover version consistency, tamper rejection where implemented, platform packaging, checksums and schema compatibility. Fixed HTTPS download URLs or SHA-256 files alone do not establish publisher authenticity; signing and rollback requirements remain explicit in T05/T15.
