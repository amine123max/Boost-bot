# Desktop updates and releases

[简体中文](../../zh-CN/release/自动更新与GitHub发布.md)

## Sources and user control

The update repository is fixed at build time (`BOOST_UPDATE_REPO` in release builds, otherwise the bundled default). Runtime variables and historical settings cannot redirect it to another project. Web/Docker deployments are updated by their operator, not desktop IPC.

Automatic checks use the persisted preference, run after the main window is ready and on the existing periodic schedule, and do not download/install/restart without the user's action. Manual checks show the actual source and errors. A stable client normally selects stable releases; prerelease behavior is explicitly configured.

## Authenticity

A release contains the platform artifacts, SHA256SUMS.txt and update-manifest.json. The manifest is Ed25519-signed and binds repository, tag, immutable source commit, asset name, target, size and SHA-256. The client bundles the public verification key; the private key exists only as the release workflow Secret.

Preparation rejects missing/invalid signatures and verifies the downloaded payload before extraction or execution. Apply verifies the stored payload again and refuses a non-newer version. Old unsigned pending updates must be prepared again. SHA-256 alone is an integrity check, not publisher authentication.

## Publishing

| Gate | Requirement |
| --- | --- |
| Versions | Root/desktop Cargo, Tauri, frontend and Bot metadata match the tag |
| Build | Windows x64 portable EXE and NSIS; macOS arm64 DMG |
| Source | Artifacts correspond to one immutable commit |
| Validation | Frontend/Bot builds, retained Rust tests, desktop update regressions and runtime acceptance |
| Signing | Secret matches the bundled public key; all three artifacts are signed together |
| Publication | Update paired notes, upload assets/checksums/manifest, verify the published result |

Run scripts/check-release-version.mjs with the intended tag. The workflow supports version tags and manual dispatch for an existing tag. Partial portable-only refresh is not a complete signed release and must not mix source commits. Published tag/asset replacement requires explicit authorization.

## Compatibility and recovery

A new binary can require a newer database schema. Signature verification does not make downgrade safe, and switching executables does not restore data. Previous-version retention, schema rollback and key rotation require explicit policies; no automatic backup or one-click data rollback is claimed.

Current packaging targets are defined by the [workflow](../../../.github/workflows/release-all.yml), not historical platform lists. Real download/install acceptance uses an older authorized client and a matching signed release.
